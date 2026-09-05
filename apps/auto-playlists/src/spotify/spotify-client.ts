import { ProxyAgent } from "undici";
import type {
  Logger,
  PlaybackSnapshot,
  PlaylistItem,
  RecentlyPlayedItem,
  SavedTrackItem,
  SpotifyClientConfig,
} from "../shared/types.js";
import { SpotifyRateLimitError } from "./errors.js";
import type { AuthManager } from "./auth-manager.js";
import { t } from "../i18n/index.js";

interface SpotifyArtist {
  name?: string;
}

interface SpotifyTrackItem {
  id?: string;
  uri?: string;
  name?: string;
  artists?: SpotifyArtist[];
}

interface SpotifyCurrentlyPlayingResponse {
  is_playing?: boolean;
  currently_playing_type?: string;
  progress_ms?: number;
  item?: SpotifyTrackItem | null;
}

interface SpotifyCurrentUserResponse {
  id: string;
}

interface SpotifyPlaylist {
  id: string;
  name: string;
}

interface SpotifyPlaylistsPage {
  items: SpotifyPlaylist[];
  next: string | null;
}

interface SpotifyPlaylistItemsPage {
  items: Array<{
    added_at?: string | null;
    track?: SpotifyTrackItem | null;
  }>;
  next: string | null;
}

interface SpotifyRecentlyPlayedPage {
  items: Array<{
    played_at?: string;
    track?: SpotifyTrackItem | null;
  }>;
}

interface SpotifySavedTracksPage {
  items: Array<{
    added_at?: string;
    track?: SpotifyTrackItem | null;
  }>;
  total?: number;
}

type TransportMode = "direct" | "proxy";

export class SpotifyClient {
  private static readonly RATE_LIMIT_RETRY_ATTEMPTS = 2;
  private static readonly RATE_LIMIT_BUFFER_MS = 250;
  private readonly auth: AuthManager;
  private readonly cfg: SpotifyClientConfig;
  private readonly log: Logger;
  private readonly fetchImpl: typeof fetch;
  private readonly proxyDispatcher: unknown | null;
  private transportMode: TransportMode;
  private rateLimitedUntilEpochMs = 0;
  private lastRequestStartedAtEpochMs = 0;
  private requestQueue: Promise<void> = Promise.resolve();
  private currentUserId: string | null = null;

  constructor(auth: AuthManager, cfg: SpotifyClientConfig, log: Logger, fetchImpl: typeof fetch = fetch) {
    this.auth = auth;
    this.cfg = cfg;
    this.log = log;
    this.fetchImpl = fetchImpl;
    this.proxyDispatcher = cfg.spotifyProxyUrl ? new ProxyAgent(cfg.spotifyProxyUrl) : null;
    this.transportMode = "direct";
  }

  public async initializeTransport(): Promise<void> {
    if (this.isProxyConfigured()) {
      const proxyValidation = await this.validateConnection("proxy");
      if (proxyValidation.ok) {
        this.transportMode = "proxy";
        this.log.info(t("spotifyProxyValidatedUsingProxy"));
        return;
      }

      this.transportMode = "direct";
      this.log.warn(t("spotifyProxyConfiguredButFailedUsingDirect", proxyValidation.message));
    }

    const directValidation = await this.validateConnection("direct");
    if (!directValidation.ok) {
      throw new Error(t("spotifyDirectConnectionFailed", directValidation.message));
    }
  }

  public async getCurrentlyPlaying(): Promise<PlaybackSnapshot | null> {
    const response = await this.requestWithAuth(
      "https://api.spotify.com/v1/me/player/currently-playing",
      { method: "GET" },
      true,
    );

    if (response.status === 204) {
      return null;
    }

    const payload = (await response.json()) as SpotifyCurrentlyPlayingResponse;
    return normalizeCurrentlyPlaying(payload);
  }

  public async getCurrentUserId(): Promise<string> {
    if (this.currentUserId) {
      return this.currentUserId;
    }

    const response = await this.requestWithAuth("https://api.spotify.com/v1/me", { method: "GET" }, true);
    const payload = (await response.json()) as SpotifyCurrentUserResponse;
    this.currentUserId = payload.id;
    return payload.id;
  }

  public async hasPlaylistInLibrary(playlistId: string): Promise<boolean> {
    let nextUrl: string | null = "https://api.spotify.com/v1/me/playlists?limit=50";

    while (nextUrl) {
      const response = await this.requestWithAuth(nextUrl, { method: "GET" }, true);
      const payload = (await response.json()) as SpotifyPlaylistsPage;
      if (payload.items.some((item) => item.id === playlistId)) {
        return true;
      }
      nextUrl = payload.next;
    }

    return false;
  }

  public async findPlaylistByName(name: string): Promise<SpotifyPlaylist | null> {
    let nextUrl: string | null = "https://api.spotify.com/v1/me/playlists?limit=50";

    while (nextUrl) {
      const response = await this.requestWithAuth(nextUrl, { method: "GET" }, true);
      const payload = (await response.json()) as SpotifyPlaylistsPage;
      const found = payload.items.find((item) => item.name === name);
      if (found) {
        return found;
      }
      nextUrl = payload.next;
    }

    return null;
  }

  public async createPlaylist(
    name: string,
    description: string,
    isPrivate = true,
  ): Promise<SpotifyPlaylist> {
    const response = await this.requestWithAuth(
      "https://api.spotify.com/v1/me/playlists",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          public: !isPrivate,
          description,
        }),
      },
      true,
    );

    const payload = (await response.json()) as SpotifyPlaylist;
    return payload;
  }

  public async getPlaylist(playlistId: string): Promise<SpotifyPlaylist> {
    const response = await this.requestWithAuth(
      `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}?fields=id,name`,
      { method: "GET" },
      true,
    );

    const payload = (await response.json()) as SpotifyPlaylist;
    return payload;
  }

  public async getPlaylistItems(playlistId: string): Promise<PlaylistItem[]> {
    const items: PlaylistItem[] = [];
    let nextUrl: string | null =
      `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks?limit=100&fields=next,items(added_at,track(id,uri))`;

    while (nextUrl) {
      const response = await this.requestWithAuth(nextUrl, { method: "GET" }, true);
      const payload = (await response.json()) as SpotifyPlaylistItemsPage;

      for (const item of payload.items) {
        const uri = item.track?.uri ?? deriveUriFromTrackId(item.track?.id);
        if (!uri) {
          continue;
        }

        const addedAt = item.added_at ? new Date(item.added_at) : null;
        items.push({
          trackUri: uri,
          addedAt: addedAt && !Number.isNaN(addedAt.getTime()) ? addedAt : null,
        });
      }

      nextUrl = payload.next;
    }

    return items;
  }

  public async replacePlaylistItems(playlistId: string, trackUris: string[]): Promise<void> {
    const playlistUrl = `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/items`;
    const head = trackUris.slice(0, 100);
    const tail = trackUris.slice(100);

    await this.requestWithAuth(
      playlistUrl,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uris: head }),
      },
      true,
    );

    for (let i = 0; i < tail.length; i += 100) {
      const batch = tail.slice(i, i + 100);
      await this.requestWithAuth(
        playlistUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ uris: batch }),
        },
        true,
      );
    }
  }

  public async uploadPlaylistCoverImage(playlistId: string, jpegBase64: string): Promise<void> {
    await this.requestWithAuth(
      `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/images`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "image/jpeg",
        },
        body: jpegBase64,
      },
      true,
    );
  }

  public async getRecentlyPlayed(limit: number): Promise<RecentlyPlayedItem[]> {
    const beforeEpochMs = Date.now();
    const url = `https://api.spotify.com/v1/me/player/recently-played?limit=${encodeURIComponent(String(limit))}&before=${encodeURIComponent(String(beforeEpochMs))}`;
    const response = await this.requestWithAuth(url, { method: "GET" }, true);
    const payload = (await response.json()) as SpotifyRecentlyPlayedPage;

    return payload.items
      .map((item) => {
        const playedAt = item.played_at ? new Date(item.played_at) : null;
        const uri = item.track?.uri ?? deriveUriFromTrackId(item.track?.id);
        if (!uri || !playedAt || Number.isNaN(playedAt.getTime())) {
          return null;
        }
        return {
          trackUri: uri,
          trackName: item.track?.name ?? null,
          artistName: item.track?.artists?.[0]?.name ?? null,
          playedAt,
        } satisfies RecentlyPlayedItem;
      })
      .filter((item): item is RecentlyPlayedItem => item !== null);
  }

  public async getRecentSavedTrackUris(limit: number): Promise<string[]> {
    const target = Math.max(0, limit);
    if (target === 0) {
      return [];
    }

    const uris: string[] = [];
    let offset = 0;

    while (uris.length < target) {
      const pageLimit = Math.min(50, target - uris.length);
      const url = `https://api.spotify.com/v1/me/tracks?limit=${pageLimit}&offset=${offset}`;
      const response = await this.requestWithAuth(url, { method: "GET" }, true);
      const payload = (await response.json()) as SpotifySavedTracksPage;

      for (const item of payload.items) {
        const uri = item.track?.uri ?? deriveUriFromTrackId(item.track?.id);
        if (!uri) {
          continue;
        }
        uris.push(uri);
        if (uris.length >= target) {
          break;
        }
      }

      if (payload.items.length < pageLimit) {
        break;
      }
      offset += pageLimit;
    }

    return uris;
  }

  public async getSavedTracksPage(limit: number, offset: number): Promise<{ tracks: SavedTrackItem[]; total: number }> {
    const url = `https://api.spotify.com/v1/me/tracks?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`;
    const response = await this.requestWithAuth(url, { method: "GET" }, true);
    const payload = (await response.json()) as SpotifySavedTracksPage;

    const tracks: SavedTrackItem[] = [];
    for (const item of payload.items) {
      const track = item.track;
      if (!track?.id) {
        continue;
      }

      const addedAt = item.added_at ? new Date(item.added_at) : new Date();
      const trackId = track.id;
      const trackUri = track.uri ?? deriveUriFromTrackId(trackId);

      if (!trackUri) {
        continue;
      }

      tracks.push({
        trackId,
        trackUri,
        trackName: track.name ?? null,
        artistName: track.artists?.[0]?.name ?? null,
        addedAt,
      });
    }

    return {
      tracks,
      total: payload.total ?? tracks.length,
    };
  }

  private async requestWithAuth(
    url: string,
    init: RequestInit,
    allowRetryOnUnauthorized: boolean,
    rateLimitRetryAttempts = SpotifyClient.RATE_LIMIT_RETRY_ATTEMPTS,
  ): Promise<Response> {
    return this.runInRequestQueue(() =>
      this.requestWithAuthInternal(url, init, allowRetryOnUnauthorized, rateLimitRetryAttempts),
    );
  }

  private async requestWithAuthInternal(
    url: string,
    init: RequestInit,
    allowRetryOnUnauthorized: boolean,
    rateLimitRetryAttempts = SpotifyClient.RATE_LIMIT_RETRY_ATTEMPTS,
    modeOverride?: TransportMode,
  ): Promise<Response> {
    await this.waitForRateLimitWindow();
    await this.waitForRequestGap();

    const accessToken = await this.auth.getAccessToken();
    const headers = new Headers(init.headers ?? {});
    headers.set("Authorization", `Bearer ${accessToken}`);

    const requestDescription = describeRequest(init.method, url);
    let response: Response;
    try {
      response = await this.fetchWithTransport(url, init, headers, modeOverride ?? this.transportMode);
    } catch (error) {
      throw new Error(buildSpotifyTransportErrorMessage(requestDescription, error, this.cfg.requestTimeoutMs));
    }

    if (response.status === 401 && allowRetryOnUnauthorized) {
      this.log.warn(t("spotifyApi401"));
      await this.auth.handleUnauthorized();
      return this.requestWithAuthInternal(url, init, false, rateLimitRetryAttempts, modeOverride);
    }

    if (response.status === 429) {
      const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get("retry-after"));
      this.bumpRateLimitWindow(retryAfterSeconds);

      if (rateLimitRetryAttempts <= 0) {
        throw new SpotifyRateLimitError(retryAfterSeconds);
      }

      this.log.warn(
        t("spotifyApi429", describeRequest(init.method, url), retryAfterSeconds, rateLimitRetryAttempts),
      );
      await sleep(retryAfterSeconds * 1000);
      return this.requestWithAuthInternal(
        url,
        init,
        allowRetryOnUnauthorized,
        rateLimitRetryAttempts - 1,
        modeOverride,
      );
    }

    if (!response.ok) {
      const payload = await response.text();

      if (this.shouldRetryWithProxy(response.status, payload)) {
        this.transportMode = "proxy";
        this.log.warn(t("spotifyGeoBlockProxy"));
        return this.requestWithAuthInternal(
          url,
          init,
          allowRetryOnUnauthorized,
          SpotifyClient.RATE_LIMIT_RETRY_ATTEMPTS,
          modeOverride,
        );
      }

      if (isSpotifyGeoBlock(response.status, payload) && !this.canUseProxy()) {
        this.log.warn(t("spotifyGeoBlockNoProxy"));
      }

      throw new Error(buildSpotifyApiErrorMessage(requestDescription, response.status, payload));
    }

    return response;
  }

  private async runInRequestQueue<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.requestQueue;
    let release!: () => void;
    this.requestQueue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous.catch(() => undefined);

    try {
      return await operation();
    } finally {
      release();
    }
  }

  private async fetchWithTransport(
    url: string,
    init: RequestInit,
    headers: Headers,
    mode: TransportMode,
  ): Promise<Response> {
    const requestInit: RequestInit = {
      ...init,
      headers,
      signal: AbortSignal.timeout(this.cfg.requestTimeoutMs),
    };

    if (mode === "proxy" && this.proxyDispatcher) {
      (requestInit as { dispatcher?: unknown }).dispatcher = this.proxyDispatcher;
    }

    return this.fetchImpl(url, requestInit);
  }

  private canUseProxy(): boolean {
    return this.isProxyConfigured() && Boolean(this.proxyDispatcher);
  }

  private isProxyConfigured(): boolean {
    return this.cfg.spotifyProxyUrl.trim().length > 0;
  }

  private shouldRetryWithProxy(status: number, payload: string): boolean {
    return this.transportMode === "direct" && this.canUseProxy() && isSpotifyGeoBlock(status, payload);
  }

  private async validateConnection(mode: TransportMode): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
      const response = await this.requestWithAuthInternal(
        "https://api.spotify.com/v1/me",
        { method: "GET" },
        true,
        SpotifyClient.RATE_LIMIT_RETRY_ATTEMPTS,
        mode,
      );
      const payload = (await response.json()) as Partial<SpotifyCurrentUserResponse>;
      if (!payload.id) {
        return {
          ok: false,
          message: t("spotifyConnectionValidationMissingUserId"),
        };
      }

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private bumpRateLimitWindow(retryAfterSeconds: number): void {
    const candidateEpochMs =
      Date.now() + Math.max(0, retryAfterSeconds) * 1000 + SpotifyClient.RATE_LIMIT_BUFFER_MS;
    if (candidateEpochMs > this.rateLimitedUntilEpochMs) {
      this.rateLimitedUntilEpochMs = candidateEpochMs;
    }
  }

  private async waitForRequestGap(): Promise<void> {
    const waitMs = this.lastRequestStartedAtEpochMs + this.cfg.minRequestGapMs - Date.now();
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    this.lastRequestStartedAtEpochMs = Date.now();
  }

  private async waitForRateLimitWindow(): Promise<void> {
    const waitMs = this.rateLimitedUntilEpochMs - Date.now();
    if (waitMs <= 0) {
      return;
    }
    await sleep(waitMs);
  }
}

export function normalizeCurrentlyPlaying(payload: SpotifyCurrentlyPlayingResponse): PlaybackSnapshot {
  const rawType = payload.currently_playing_type ?? "unknown";
  const itemType = toItemType(rawType);
  const track = payload.item ?? null;
  const trackId = itemType === "track" ? track?.id ?? null : null;
  const trackUri = itemType === "track" ? track?.uri ?? deriveUriFromTrackId(track?.id) : null;

  return {
    isPlaying: Boolean(payload.is_playing),
    itemType,
    trackId,
    trackUri,
    trackName: itemType === "track" ? track?.name ?? null : null,
    artists:
      itemType === "track"
        ? (track?.artists ?? []).map((artist) => artist.name).filter((name): name is string => Boolean(name))
        : [],
    progressMs: typeof payload.progress_ms === "number" ? payload.progress_ms : null,
    fetchedAtEpochMs: Date.now(),
  };
}

function toItemType(type: string): PlaybackSnapshot["itemType"] {
  if (type === "track" || type === "episode" || type === "ad") {
    return type;
  }
  return "unknown";
}

function deriveUriFromTrackId(trackId: string | undefined): string | null {
  return trackId ? `spotify:track:${trackId}` : null;
}

function isSpotifyGeoBlock(status: number, payload: string): boolean {
  if (status !== 403) {
    return false;
  }

  if (payload.toLowerCase().includes("spotify is unavailable in this country")) {
    return true;
  }

  try {
    const parsed = JSON.parse(payload) as {
      error?: {
        message?: string;
      };
    };
    return parsed.error?.message?.toLowerCase().includes("spotify is unavailable in this country") ?? false;
  } catch {
    return false;
  }
}

function parseRetryAfterSeconds(retryAfterHeader: string | null): number {
  if (!retryAfterHeader) {
    return 2;
  }

  const asNumber = Number(retryAfterHeader);
  if (!Number.isNaN(asNumber) && asNumber >= 0) {
    return Math.ceil(asNumber);
  }

  const asDateMs = Date.parse(retryAfterHeader);
  if (!Number.isNaN(asDateMs)) {
    return Math.max(1, Math.ceil((asDateMs - Date.now()) / 1000));
  }

  return 2;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
  });
}

function describeRequest(method: string | undefined, url: string): string {
  const normalizedMethod = (method ?? "GET").toUpperCase();

  try {
    const parsed = new URL(url);
    return `${normalizedMethod} ${parsed.pathname}`;
  } catch {
    return `${normalizedMethod} ${url}`;
  }
}

function buildSpotifyApiErrorMessage(
  requestDescription: string,
  status: number,
  payload: string,
): string {
  return `Spotify API error during ${requestDescription} (${status}): ${payload}`;
}

function buildSpotifyTransportErrorMessage(
  requestDescription: string,
  error: unknown,
  requestTimeoutMs: number,
): string {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();
  const timeoutLike =
    lowerMessage.includes("aborted due to timeout") ||
    lowerMessage.includes("timeout") ||
    lowerMessage.includes("timed out");

  if (timeoutLike) {
    return `Spotify request ${requestDescription} timed out after ${requestTimeoutMs}ms.`;
  }

  return `Spotify request ${requestDescription} failed before response: ${message}`;
}
