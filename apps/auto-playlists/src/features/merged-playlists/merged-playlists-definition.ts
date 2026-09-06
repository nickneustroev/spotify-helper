import type { MergedPlaylistConfig } from "../../core/config.js";
import { t } from "../../i18n/index.js";
import type { Logger, PlaylistItem, SavedTrackItem } from "../../shared/types.js";
import type { SpotifyClient } from "../../spotify/spotify-client.js";
import { extractTrackId } from "../exclude-playlist/exclude-playlist.js";
import { SavedTracksSource } from "../playlist-definitions/saved-tracks-source.js";
import type { AutoPlaylistDefinition } from "../playlist-definitions/auto-playlist-definition.js";

export interface MergedPlaylistDefinitionsOptions {
  merges: MergedPlaylistConfig[];
  playlistPrefix: string;
  playlistSuffix: string;
  logger: Logger;
  getSavedTracks?: () => Promise<SavedTrackItem[]>;
}

export function createMergedPlaylistDefinitions(
  options: MergedPlaylistDefinitionsOptions,
): AutoPlaylistDefinition[] {
  return options.merges.map((merge) => ({
    key: `merged:${encodeURIComponent(merge.targetName)}`,
    playlistName: buildMergedPlaylistName(options.playlistPrefix, options.playlistSuffix, merge.targetName),
    playlistDescription: `Auto-maintained merge of: ${merge.sourceNames.join(", ")}.`,
    resolveTrackUris: () => [],
    async resolveTrackUrisAsync(
      spotifyClient: SpotifyClient,
      savedTracks?: SavedTrackItem[],
    ): Promise<string[]> {
      const collectedItems = await collectMergedSourceItems(spotifyClient, merge, options.logger);
      if (collectedItems === null) {
        return [];
      }

      if (merge.order === "saved") {
        const favorites = savedTracks && savedTracks.length > 0
          ? savedTracks
          : await loadFavoritesForSavedOrder(spotifyClient, options);
        return mergePlaylistItemsBySavedOrder(collectedItems, favorites);
      }

      return mergePlaylistItems(collectedItems);
    },
  }));
}

async function loadFavoritesForSavedOrder(
  spotifyClient: SpotifyClient,
  options: MergedPlaylistDefinitionsOptions,
): Promise<SavedTrackItem[]> {
  try {
    if (options.getSavedTracks) {
      return await options.getSavedTracks();
    }
    return await new SavedTracksSource(spotifyClient).getAllSavedTracks();
  } catch (error) {
    options.logger.warn(t("mergedPlaylistSavedOrderFetchFailed", (error as Error).message));
    return [];
  }
}

async function collectMergedSourceItems(
  spotifyClient: SpotifyClient,
  merge: MergedPlaylistConfig,
  logger: Logger,
): Promise<PlaylistItem[] | null> {
  const collectedItems: PlaylistItem[] = [];
  let foundSource = false;

  for (const sourceName of merge.sourceNames) {
    const source = await spotifyClient.findPlaylistByName(sourceName);
    if (!source) {
      logger.warn(t("mergedPlaylistSourceNotFound", merge.targetName, sourceName));
      continue;
    }

    try {
      collectedItems.push(...(await spotifyClient.getPlaylistItems(source.id)));
    } catch (error) {
      logger.warn(
        t("mergedPlaylistSourceFetchFailed", merge.targetName, sourceName, (error as Error).message),
      );
      continue;
    }
    foundSource = true;
  }

  return foundSource ? collectedItems : null;
}

export function buildMergedPlaylistName(prefix: string, suffix: string, targetName: string): string {
  return `${prefix} ${targetName} ${suffix}`.replace(/\s+/g, " ").trim();
}

export function mergePlaylistItems(items: PlaylistItem[]): string[] {
  const earliestByUri = new Map<string, { item: PlaylistItem; index: number }>();
  for (const [index, item] of items.entries()) {
    const existing = earliestByUri.get(item.trackUri);
    if (!existing || isEarlierAddition(item, existing.item)) {
      earliestByUri.set(item.trackUri, { item, index });
    }
  }

  const merged = Array.from(earliestByUri.values());
  merged.sort((left, right) => {
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

  return merged.map((entry) => entry.item.trackUri);
}

function isEarlierAddition(candidate: PlaylistItem, current: PlaylistItem): boolean {
  if (!candidate.addedAt) {
    return false;
  }
  if (!current.addedAt) {
    return true;
  }
  return candidate.addedAt.getTime() < current.addedAt.getTime();
}

export function mergePlaylistItemsBySavedOrder(
  items: PlaylistItem[],
  savedTracks: SavedTrackItem[],
): string[] {
  const sourceTrackIds = new Set<string>();
  for (const item of items) {
    const trackId = extractTrackId(item.trackUri);
    if (trackId) {
      sourceTrackIds.add(trackId);
    }
  }

  const seenTrackIds = new Set<string>();
  const orderedUris: string[] = [];
  for (const savedTrack of savedTracks) {
    if (!sourceTrackIds.has(savedTrack.trackId) || seenTrackIds.has(savedTrack.trackId)) {
      continue;
    }
    seenTrackIds.add(savedTrack.trackId);
    orderedUris.push(savedTrack.trackUri);
  }

  const leftovers = items.filter((item) => {
    const trackId = extractTrackId(item.trackUri);
    return trackId === null || !seenTrackIds.has(trackId);
  });

  return [...orderedUris, ...mergePlaylistItems(leftovers)];
}
