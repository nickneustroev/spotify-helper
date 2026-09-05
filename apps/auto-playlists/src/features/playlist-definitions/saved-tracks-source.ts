import type { SavedTrackItem } from "../../shared/types.js";
import type { SpotifyClient } from "../../spotify/spotify-client.js";

export interface SavedTracksFetchRequirements {
  maxRecentTracks?: number;
  minSavedYear?: number;
}

export class SavedTracksSource {
  constructor(
    private readonly spotifyClient: SpotifyClient,
    private readonly pageSize = 50,
    private readonly maxScanAttempts = 3,
  ) {}

  public async getSavedTracks(requirements: SavedTracksFetchRequirements = {}): Promise<SavedTrackItem[]> {
    if (requirements.minSavedYear !== undefined) {
      return this.getSavedTracksSinceYear(requirements.minSavedYear, requirements);
    }

    const maxRecentTracks = Math.max(0, requirements.maxRecentTracks ?? 0);
    if (maxRecentTracks > 0) {
      return this.getRecentSavedTracks(maxRecentTracks);
    }

    return this.getAllSavedTracks();
  }

  public async getAllSavedTracks(): Promise<SavedTrackItem[]> {
    let lastCollectedTracks: SavedTrackItem[] = [];

    for (let attempt = 1; attempt <= this.maxScanAttempts; attempt += 1) {
      const firstPage = await this.spotifyClient.getSavedTracksPage(this.pageSize, 0);
      const collectedTracks = [...firstPage.tracks];
      let offset = firstPage.tracks.length;

      while (offset > 0 && offset < firstPage.total) {
        const page = await this.spotifyClient.getSavedTracksPage(this.pageSize, offset);
        if (page.tracks.length === 0) {
          break;
        }

        collectedTracks.push(...page.tracks);
        offset += page.tracks.length;
      }

      lastCollectedTracks = dedupeSavedTracks(collectedTracks);

      if (firstPage.total <= this.pageSize || attempt === this.maxScanAttempts) {
        break;
      }

      const verificationPage = await this.spotifyClient.getSavedTracksPage(this.pageSize, 0);
      if (isStableFirstPage(firstPage, verificationPage)) {
        break;
      }
    }

    return lastCollectedTracks.sort((left, right) => right.addedAt.getTime() - left.addedAt.getTime());
  }

  public async getRecentSavedTracks(limit: number): Promise<SavedTrackItem[]> {
    if (limit <= 0) {
      return [];
    }

    const collectedTracks: SavedTrackItem[] = [];
    let offset = 0;

    while (collectedTracks.length < limit) {
      const page = await this.spotifyClient.getSavedTracksPage(this.pageSize, offset);
      if (page.tracks.length === 0) {
        break;
      }

      collectedTracks.push(...page.tracks);
      offset += page.tracks.length;

      if (offset >= page.total) {
        break;
      }
    }

    return dedupeSavedTracks(collectedTracks)
      .sort((left, right) => right.addedAt.getTime() - left.addedAt.getTime())
      .slice(0, limit);
  }

  public async getSavedTracksSinceYear(
    minSavedYear: number,
    requirements: SavedTracksFetchRequirements = { minSavedYear },
  ): Promise<SavedTrackItem[]> {
    let lastCollectedTracks: SavedTrackItem[] = [];

    for (let attempt = 1; attempt <= this.maxScanAttempts; attempt += 1) {
      const firstPage = await this.spotifyClient.getSavedTracksPage(this.pageSize, 0);
      const collectedTracks = [...firstPage.tracks];
      let offset = firstPage.tracks.length;
      let reachedOlderTracks = hasTracksBeforeYear(firstPage.tracks, minSavedYear);

      while (!reachedOlderTracks && offset > 0 && offset < firstPage.total) {
        const page = await this.spotifyClient.getSavedTracksPage(this.pageSize, offset);
        if (page.tracks.length === 0) {
          break;
        }

        collectedTracks.push(...page.tracks);
        offset += page.tracks.length;
        reachedOlderTracks = hasTracksBeforeYear(page.tracks, minSavedYear);
      }

      lastCollectedTracks = filterSavedTracks(dedupeSavedTracks(collectedTracks), requirements);

      if (reachedOlderTracks || firstPage.total <= this.pageSize || attempt === this.maxScanAttempts) {
        break;
      }

      const verificationPage = await this.spotifyClient.getSavedTracksPage(this.pageSize, 0);
      if (isStableFirstPage(firstPage, verificationPage)) {
        break;
      }
    }

    return lastCollectedTracks.sort((left, right) => right.addedAt.getTime() - left.addedAt.getTime());
  }
}

export function filterSavedTracks(
  tracks: SavedTrackItem[],
  requirements: SavedTracksFetchRequirements = {},
): SavedTrackItem[] {
  const sortedTracks = [...tracks].sort((left, right) => right.addedAt.getTime() - left.addedAt.getTime());
  const targetRecentCount = Math.max(0, requirements.maxRecentTracks ?? 0);
  const minSavedYear = requirements.minSavedYear;

  return sortedTracks.filter((track, index) => {
    const recentMatched = targetRecentCount > 0 && index < targetRecentCount;
    const yearMatched = minSavedYear !== undefined && track.addedAt.getUTCFullYear() >= minSavedYear;

    if (targetRecentCount > 0 && minSavedYear !== undefined) {
      return recentMatched || yearMatched;
    }

    if (targetRecentCount > 0) {
      return recentMatched;
    }

    if (minSavedYear !== undefined) {
      return yearMatched;
    }

    return true;
  });
}

function dedupeSavedTracks(tracks: SavedTrackItem[]): SavedTrackItem[] {
  const seenTrackIds = new Set<string>();
  const deduped: SavedTrackItem[] = [];

  for (const track of tracks) {
    if (seenTrackIds.has(track.trackId)) {
      continue;
    }
    seenTrackIds.add(track.trackId);
    deduped.push(track);
  }

  return deduped;
}

function isStableFirstPage(
  left: { tracks: SavedTrackItem[]; total: number },
  right: { tracks: SavedTrackItem[]; total: number },
): boolean {
  if (left.total !== right.total || left.tracks.length !== right.tracks.length) {
    return false;
  }

  return left.tracks.every((track, index) => {
    const candidate = right.tracks[index];
    return (
      candidate !== undefined &&
      track.trackId === candidate.trackId &&
      track.addedAt.getTime() === candidate.addedAt.getTime()
    );
  });
}

function hasTracksBeforeYear(tracks: SavedTrackItem[], minSavedYear: number): boolean {
  return tracks.some((track) => track.addedAt.getUTCFullYear() < minSavedYear);
}
