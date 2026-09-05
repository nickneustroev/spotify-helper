import type { MergedPlaylistConfig } from "../../core/config.js";
import { t } from "../../i18n/index.js";
import type { Logger, PlaylistItem } from "../../shared/types.js";
import type { SpotifyClient } from "../../spotify/spotify-client.js";
import type { AutoPlaylistDefinition } from "../playlist-definitions/auto-playlist-definition.js";

export interface MergedPlaylistDefinitionsOptions {
  merges: MergedPlaylistConfig[];
  playlistPrefix: string;
  playlistSuffix: string;
  logger: Logger;
}

export function createMergedPlaylistDefinitions(
  options: MergedPlaylistDefinitionsOptions,
): AutoPlaylistDefinition[] {
  return options.merges.map((merge) => ({
    key: `merged:${encodeURIComponent(merge.targetName)}`,
    playlistName: buildMergedPlaylistName(options.playlistPrefix, options.playlistSuffix, merge.targetName),
    playlistDescription: `Auto-maintained merge of: ${merge.sourceNames.join(", ")}.`,
    resolveTrackUris: () => [],
    async resolveTrackUrisAsync(spotifyClient: SpotifyClient): Promise<string[]> {
      const collectedItems: PlaylistItem[] = [];
      let foundSource = false;

      for (const sourceName of merge.sourceNames) {
        const source = await spotifyClient.findPlaylistByName(sourceName);
        if (!source) {
          options.logger.warn(t("mergedPlaylistSourceNotFound", merge.targetName, sourceName));
          continue;
        }

        foundSource = true;
        collectedItems.push(...(await spotifyClient.getPlaylistItems(source.id)));
      }

      if (!foundSource) {
        return [];
      }

      return mergePlaylistItems(collectedItems);
    },
  }));
}

export function buildMergedPlaylistName(prefix: string, suffix: string, targetName: string): string {
  return `${prefix} ${targetName} ${suffix}`.replace(/\s+/g, " ").trim();
}

export function mergePlaylistItems(items: PlaylistItem[]): string[] {
  const sorted = items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      if (!left.item.addedAt && !right.item.addedAt) {
        return left.index - right.index;
      }
      if (!left.item.addedAt) {
        return 1;
      }
      if (!right.item.addedAt) {
        return -1;
      }
      return right.item.addedAt.getTime() - left.item.addedAt.getTime() || left.index - right.index;
    });

  const seenUris = new Set<string>();
  const trackUris: string[] = [];
  for (const { item } of sorted) {
    if (seenUris.has(item.trackUri)) {
      continue;
    }
    seenUris.add(item.trackUri);
    trackUris.push(item.trackUri);
  }

  return trackUris;
}
