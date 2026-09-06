import { t } from "../../i18n/index.js";
import type { Logger, PlaylistItem } from "../../shared/types.js";
import type { SpotifyClient } from "../../spotify/spotify-client.js";
import { extractTrackId } from "../exclude-playlist/exclude-playlist.js";

export interface SpotifyPlaylistRef {
  id: string;
  name: string;
}

export interface PlaylistResolveContext {
  findPlaylistByName(name: string): Promise<SpotifyPlaylistRef | null>;
  getPlaylistItems(playlistId: string, maxItems?: number): Promise<PlaylistItem[]>;
  getExcludedTrackIds(playlistName: string): Promise<Set<string>>;
}

export function createPlaylistResolveContext(
  spotifyClient: SpotifyClient,
  logger: Logger,
): PlaylistResolveContext {
  const playlistsByName = new Map<string, Promise<SpotifyPlaylistRef | null>>();
  const itemsByKey = new Map<string, Promise<PlaylistItem[]>>();
  const excludedByName = new Map<string, Promise<Set<string>>>();

  function findPlaylistByName(name: string): Promise<SpotifyPlaylistRef | null> {
    let promise = playlistsByName.get(name);
    if (!promise) {
      promise = spotifyClient.findPlaylistByName(name);
      playlistsByName.set(name, promise);
      promise.catch(() => playlistsByName.delete(name));
    }
    return promise;
  }

  function getPlaylistItems(playlistId: string, maxItems?: number): Promise<PlaylistItem[]> {
    const key = `${playlistId}:${maxItems ?? "all"}`;
    let promise = itemsByKey.get(key);
    if (!promise) {
      promise = spotifyClient.getPlaylistItems(playlistId, maxItems);
      itemsByKey.set(key, promise);
      promise.catch(() => itemsByKey.delete(key));
    }
    return promise;
  }

  function getExcludedTrackIds(playlistName: string): Promise<Set<string>> {
    let promise = excludedByName.get(playlistName);
    if (!promise) {
      promise = loadExcludedTrackIdsCached(playlistName);
      excludedByName.set(playlistName, promise);
      promise.catch(() => excludedByName.delete(playlistName));
    }
    return promise;
  }

  async function loadExcludedTrackIdsCached(playlistName: string): Promise<Set<string>> {
    try {
      return await loadExcludedTrackIds(playlistName);
    } catch (error) {
      excludedByName.delete(playlistName);
      logger.warn(t("excludePlaylistLookupFailed", playlistName, (error as Error).message));
      return new Set();
    }
  }

  async function loadExcludedTrackIds(playlistName: string): Promise<Set<string>> {
    if (playlistName.trim().length === 0) {
      return new Set();
    }

    const playlist = await findPlaylistByName(playlistName);
    if (!playlist) {
      logger.warn(t("excludePlaylistNotFound", playlistName));
      return new Set();
    }

    const items = await getPlaylistItems(playlist.id);
    const trackIds = new Set<string>();
    for (const item of items) {
      const trackId = extractTrackId(item.trackUri);
      if (trackId) {
        trackIds.add(trackId);
      }
    }
    return trackIds;
  }

  return { findPlaylistByName, getPlaylistItems, getExcludedTrackIds };
}
