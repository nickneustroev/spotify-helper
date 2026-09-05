import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger, SpotifyClientConfig } from "../src/shared/types.js";
import { SpotifyClient } from "../src/spotify/spotify-client.js";
import { SpotifyRateLimitError } from "../src/spotify/errors.js";
import type { AuthManager } from "../src/spotify/auth-manager.js";

const log: Logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const cfg: SpotifyClientConfig = {
  requestTimeoutMs: 5000,
  minRequestGapMs: 25,
  spotifyProxyEnabled: false,
  spotifyProxyUrl: "",
};

function createClient(fetchImpl: typeof fetch, overrides: Partial<SpotifyClientConfig> = {}): SpotifyClient {
  const auth = {
    getAccessToken: vi.fn().mockResolvedValue("token"),
    handleUnauthorized: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuthManager;

  return new SpotifyClient(auth, { ...cfg, ...overrides }, log, fetchImpl);
}

describe("SpotifyClient rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries after 429 and honors retry-after before succeeding", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("{}", {
          status: 429,
          headers: {
            "retry-after": "1",
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "user-1" }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
      );

    const client = createClient(fetchImpl);
    const request = client.getCurrentUserId();

    await vi.advanceTimersByTimeAsync(1249);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);
    await expect(request).resolves.toBe("user-1");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("serializes concurrent requests and spaces them out", async () => {
    vi.useFakeTimers();
    const startedAt: number[] = [];
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => {
      startedAt.push(Date.now());
      return new Response(JSON.stringify({ id: `user-${startedAt.length}` }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    });

    const client = createClient(fetchImpl);
    const requests = [client.getCurrentUserId(), client.getCurrentUserId(), client.getCurrentUserId()];

    await vi.runAllTimersAsync();
    await expect(Promise.all(requests)).resolves.toEqual(["user-1", "user-2", "user-3"]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(startedAt[1] - startedAt[0]).toBeGreaterThanOrEqual(cfg.minRequestGapMs);
    expect(startedAt[2] - startedAt[1]).toBeGreaterThanOrEqual(cfg.minRequestGapMs);
  });

  it("throws SpotifyRateLimitError after retry budget is exhausted", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("{}", {
        status: 429,
        headers: {
          "retry-after": "1",
        },
      }),
    );

    const client = createClient(fetchImpl);
    const request = expect(client.getCurrentUserId()).rejects.toBeInstanceOf(SpotifyRateLimitError);

    await vi.runAllTimersAsync();
    await request;
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("uses configured proxy when startup validation succeeds", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      expect(init && "dispatcher" in init && init.dispatcher).toBeTruthy();
      return new Response(JSON.stringify({ id: "user-1" }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    });

    const client = createClient(fetchImpl, {
      spotifyProxyUrl: "http://user:pass@127.0.0.1:8080",
    });

    await expect(client.initializeTransport()).resolves.toBeUndefined();
    await expect(client.getCurrentUserId()).resolves.toBe("user-1");
    expect(log.info).toHaveBeenCalledWith("A proxy is configured and validated, so it will be used.");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("falls back to direct connection when configured proxy validation fails", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      if (init && "dispatcher" in init && init.dispatcher) {
        throw new Error("proxy unreachable");
      }

      return new Response(JSON.stringify({ id: "user-1" }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    });

    const client = createClient(fetchImpl, {
      spotifyProxyUrl: "http://user:pass@127.0.0.1:8080",
    });

    await expect(client.initializeTransport()).resolves.toBeUndefined();
    await expect(client.getCurrentUserId()).resolves.toBe("user-1");
    expect(log.warn).toHaveBeenCalledWith(
      "A proxy is configured but not working, so a direct connection will be used. Reason: Spotify request GET /v1/me failed before response: proxy unreachable",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("stops startup when direct Spotify connection is not fully available", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{"error":{"message":"Spotify is unavailable in this country"}}', {
        status: 403,
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    const client = createClient(fetchImpl);

    await expect(client.initializeTransport()).rejects.toThrow(
      "Direct Spotify connection validation failed. Spotify is not responding fully or access is region-blocked. The application is stopping.",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("creates playlists through POST /v1/me/playlists", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: "playlist-1", name: "Test" }), {
        status: 201,
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    const client = createClient(fetchImpl);
    await expect(client.createPlaylist("Test", "Description", true)).resolves.toEqual({
      id: "playlist-1",
      name: "Test",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.spotify.com/v1/me/playlists",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("replaces playlist items through /items endpoints", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("{}", {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
      );

    const client = createClient(fetchImpl);
    await expect(
      client.replacePlaylistItems("playlist-1", ["spotify:track:a", "spotify:track:b"]),
    ).resolves.toBeUndefined();

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.spotify.com/v1/playlists/playlist-1/items",
      expect.objectContaining({
        method: "PUT",
      }),
    );
  });

  it("loads playlist items across pages and normalizes missing data", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                added_at: "2026-01-02T03:04:05Z",
                track: { uri: "spotify:track:uri-a" },
              },
              {
                added_at: "not-a-date",
                track: { id: "id-b" },
              },
              {
                added_at: "2026-02-01T00:00:00Z",
                track: null,
              },
            ],
            next: "https://api.spotify.com/v1/playlists/playlist-1/tracks?offset=100",
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                added_at: null,
                track: { uri: "spotify:track:uri-c" },
              },
            ],
            next: null,
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      );

    const client = createClient(fetchImpl);

    await expect(client.getPlaylistItems("playlist-1")).resolves.toEqual([
      { trackUri: "spotify:track:uri-a", addedAt: new Date("2026-01-02T03:04:05Z") },
      { trackUri: "spotify:track:id-b", addedAt: null },
      { trackUri: "spotify:track:uri-c", addedAt: null },
    ]);

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "https://api.spotify.com/v1/playlists/playlist-1/tracks?limit=100&fields=next,items(added_at,track(id,uri))",
      expect.objectContaining({
        method: "GET",
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://api.spotify.com/v1/playlists/playlist-1/tracks?offset=100",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });
});
