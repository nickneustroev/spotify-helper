import { t } from "../../i18n/index.js";
import type { Logger } from "../../shared/types.js";
import type { SpotifyClient } from "../../spotify/spotify-client.js";

export async function fetchExcludedTrackIds(
  spotifyClient: SpotifyClient,
  playlistName: string,
  logger: Logger,
): Promise<Set<string>> {
  if (playlistName.trim().length === 0) {
    return new Set();
  }

  let playlistId: string;
  try {
    const playlist = await spotifyClient.findPlaylistByName(playlistName);
    if (!playlist) {
      logger.warn(t("excludePlaylistNotFound", playlistName));
      return new Set();
    }
    playlistId = playlist.id;
  } catch (error) {
    logger.warn(t("excludePlaylistLookupFailed", playlistName, (error as Error).message));
    return new Set();
  }

  try {
    const items = await spotifyClient.getPlaylistItems(playlistId);
    const trackIds = new Set<string>();
    for (const item of items) {
      const trackId = extractTrackId(item.trackUri);
      if (trackId) {
        trackIds.add(trackId);
      }
    }
    return trackIds;
  } catch (error) {
    logger.warn(t("excludePlaylistFetchFailed", playlistName, (error as Error).message));
    return new Set();
  }
}

export function extractTrackId(trackUri: string): string | null {
  const match = /^spotify:track:([A-Za-z0-9]+)$/.exec(trackUri);
  return match ? (match[1] ?? null) : null;
}
