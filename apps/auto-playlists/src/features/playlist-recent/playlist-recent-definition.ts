import type { PlaylistRecentConfig } from "../../core/config.js";
import { t } from "../../i18n/index.js";
import type { Logger } from "../../shared/types.js";
import type { SpotifyClient } from "../../spotify/spotify-client.js";
import { generateRecentPlaylistCoverJpeg } from "../saved-recent/playlist-cover.js";
import type { AutoPlaylistDefinition } from "../playlist-definitions/auto-playlist-definition.js";

export interface PlaylistRecentDefinitionsOptions {
  configs: PlaylistRecentConfig[];
  playlistPrefix: string;
  playlistSuffix: string;
  coverColor: string;
  logger: Logger;
}

export function createPlaylistRecentDefinitions(
  options: PlaylistRecentDefinitionsOptions,
): AutoPlaylistDefinition[] {
  return options.configs.flatMap((config) =>
    config.windows.map((windowSize): AutoPlaylistDefinition => ({
      key: `playlist-recent:${encodeURIComponent(config.sourceName)}:${windowSize}`,
      playlistName: buildPlaylistRecentName(
        options.playlistPrefix,
        config.sourceName,
        windowSize,
        options.playlistSuffix,
      ),
      playlistDescription: `Auto-maintained top ${windowSize} tracks from playlist "${config.sourceName}".`,
      resolveTrackUris: () => [],
      async resolveTrackUrisAsync(spotifyClient: SpotifyClient): Promise<string[]> {
        const source = await spotifyClient.findPlaylistByName(config.sourceName);
        if (!source) {
          options.logger.warn(t("recentFromPlaylistSourceNotFound", config.sourceName));
          return [];
        }

        const items = await spotifyClient.getPlaylistItems(source.id);
        const seen = new Set<string>();
        const trackUris: string[] = [];
        for (const item of items) {
          if (seen.has(item.trackUri)) {
            continue;
          }
          seen.add(item.trackUri);
          trackUris.push(item.trackUri);
          if (trackUris.length >= windowSize) {
            break;
          }
        }
        return trackUris;
      },
      buildCoverJpeg: () => generateRecentPlaylistCoverJpeg(windowSize, options.coverColor),
    })),
  );
}

export function buildPlaylistRecentName(
  prefix: string,
  sourceName: string,
  windowSize: number,
  suffix: string,
): string {
  return `${prefix} ${sourceName} ${windowSize} ${suffix}`.replace(/\s+/g, " ").trim();
}
