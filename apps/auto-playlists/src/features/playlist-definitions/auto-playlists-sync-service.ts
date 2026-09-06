import type { AppStateRepository, ArchiveRepository } from "../../persistence/types.js";
import type { SavedTrackItem } from "../../shared/types.js";
import { SpotifyRateLimitError } from "../../shared/errors.js";
import type { Logger } from "../../shared/types.js";
import type { SpotifyClient } from "../../spotify/spotify-client.js";
import { t } from "../../i18n/index.js";
import type { AutoPlaylistDefinition } from "./auto-playlist-definition.js";
import { fetchExcludedTrackIds } from "../exclude-playlist/exclude-playlist.js";
import {
  filterSavedTracks,
  type SavedTracksFetchRequirements,
  type SavedTracksSource,
} from "./saved-tracks-source.js";

export interface AutoPlaylistsSyncOptions {
  definitions: AutoPlaylistDefinition[];
  syncIntervalMs: number;
  playlistPrivate: boolean;
  syncModeName: string;
  syncLogLabel?: string;
  initialDelayMs?: number;
  syncRemovedTracksArchive?: boolean;
  isDatabasePersistenceEnabled?: () => boolean;
  savedTracksRequirements?: SavedTracksFetchRequirements;
  fetchSavedTracks?: boolean;
  excludePlaylistName?: string;
  runExclusive?: <T>(modeName: string, run: () => Promise<T>) => Promise<T>;
}

interface SavedTrackSnapshotItem {
  trackId: string;
  trackUri: string;
  trackName: string | null;
  artistName: string | null;
  addedAtIso: string;
}

const SAVED_TRACKS_SNAPSHOT_KEY = "auto_playlists:saved_tracks_snapshot";
const SAVED_TRACKS_SNAPSHOT_UPDATED_AT_KEY = "auto_playlists:saved_tracks_snapshot:updated_at";
const PLAYLIST_ID_KEY_PREFIX = "auto_playlists:playlist_id:";

export class AutoPlaylistsSyncService {
  private timer: NodeJS.Timeout | null = null;
  private initialTimer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = true;
  private nextAllowedSyncAtEpochMs = 0;
  private readonly playlistIdsByDefinitionKey = new Map<string, string>();
  private readonly lastHashesByDefinitionKey = new Map<string, string>();

  constructor(
    private readonly spotifyClient: SpotifyClient,
    private readonly savedTracksSource: SavedTracksSource,
    private readonly archiveRepository: ArchiveRepository,
    private readonly appStateRepository: AppStateRepository,
    private readonly logger: Logger,
    private readonly options: AutoPlaylistsSyncOptions,
  ) {}

  public start(): void {
    if (this.options.definitions.length === 0) {
      this.logger.warn(t("noPlaylistDefinitionsConfigured"));
      return;
    }

    this.stopped = false;
    const initialDelayMs = Math.max(0, this.options.initialDelayMs ?? 0);
    if (initialDelayMs === 0) {
      void this.syncNow();
    } else {
      this.initialTimer = setTimeout(() => {
        this.initialTimer = null;
        void this.syncNow();
      }, initialDelayMs);
    }
    this.timer = setInterval(() => {
      void this.syncNow();
    }, this.options.syncIntervalMs);
    this.logger.info(
      t(
        "syncActive",
        this.options.syncLogLabel ?? this.options.syncModeName,
        this.options.definitions.length,
        this.options.syncIntervalMs,
        initialDelayMs,
      ),
    );
  }

  public stop(): void {
    this.stopped = true;
    if (this.initialTimer) {
      clearTimeout(this.initialTimer);
      this.initialTimer = null;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.logger.info(t("syncStopped", this.options.syncModeName));
  }

  public async syncNow(): Promise<void> {
    if (this.stopped || this.running) {
      return;
    }
    if (Date.now() < this.nextAllowedSyncAtEpochMs) {
      return;
    }

    this.running = true;
    try {
      const runExclusive = this.options.runExclusive ?? defaultRunExclusive;
      await runExclusive(this.options.syncModeName, async () => {
        this.logger.info(t("syncCycleStarted", this.options.syncLogLabel ?? this.options.syncModeName));
        await this.ensurePlaylists();
        const fetchSavedTracks = this.options.fetchSavedTracks ?? true;
        const databasePersistenceEnabled = this.options.isDatabasePersistenceEnabled?.() ?? true;
        const excludeTrackIds = await this.resolveExcludedTrackIds();
        const savedTracks = fetchSavedTracks
          ? await this.savedTracksSource.getSavedTracks({
              ...this.resolveSavedTracksRequirements(databasePersistenceEnabled),
              excludeTrackIds,
            })
          : [];

        if (
          this.options.syncRemovedTracksArchive &&
          databasePersistenceEnabled
        ) {
          await this.syncRemovedTracksArchive(savedTracks);
        }

        let syncedPlaylists = 0;

        for (const definition of this.options.definitions) {
          let playlistId = this.playlistIdsByDefinitionKey.get(definition.key);
          if (!playlistId) {
            continue;
          }

          let trackUris: string[];
          if (definition.resolveTrackUrisAsync) {
            try {
              trackUris = await definition.resolveTrackUrisAsync(this.spotifyClient, savedTracks);
            } catch (error) {
              this.logger.warn(
                t("playlistTrackResolveFailed", definition.playlistName, (error as Error).message),
              );
              continue;
            }
          } else {
            trackUris = definition.resolveTrackUris(savedTracks);
          }

          const hash = hashTrackUris(trackUris);
          if (this.lastHashesByDefinitionKey.get(definition.key) === hash) {
            this.logger.info(t("playlistDoesNotRequireUpdate", definition.playlistName));
            continue;
          }

          let synced = false;
          for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
              await this.spotifyClient.replacePlaylistItems(playlistId, trackUris);
              synced = true;
              break;
            } catch (error) {
              if (!isMissingPlaylistError(error)) {
                throw error;
              }

              await this.forgetPlaylistId(definition.key);
              this.lastHashesByDefinitionKey.delete(definition.key);

              const recoveredPlaylistId = await this.recoverOrCreatePlaylist(definition, playlistId);
              if (!recoveredPlaylistId) {
                this.logger.warn(
                  t("playlistNoLongerAvailable", definition.playlistName),
                );
                break;
              }

              playlistId = recoveredPlaylistId;
            }
          }

          if (!synced) {
            continue;
          }

          this.lastHashesByDefinitionKey.set(definition.key, hash);
          syncedPlaylists += 1;
          this.logger.info(t("playlistUpdated", definition.playlistName));
        }

        this.logger.info(
          t(
            "syncCycleCompleted",
            this.options.syncLogLabel ?? this.options.syncModeName,
            syncedPlaylists,
            this.options.definitions.length,
          ),
        );
      });
    } catch (error) {
      if (error instanceof SpotifyRateLimitError) {
        this.nextAllowedSyncAtEpochMs = Date.now() + error.retryAfterSeconds * 1000;
        this.logger.warn(
          t(
            "syncRateLimited",
            error.retryAfterSeconds,
            new Date(this.nextAllowedSyncAtEpochMs).toISOString(),
          ),
        );
      } else {
        this.logger.warn(t("syncFailed", this.options.syncModeName, (error as Error).message));
      }
    } finally {
      this.running = false;
    }
  }

  private async ensurePlaylists(): Promise<void> {
    for (const definition of this.options.definitions) {
      if (this.playlistIdsByDefinitionKey.has(definition.key)) {
        continue;
      }

      const cachedPlaylistId = await this.readPlaylistId(definition.key);
      if (cachedPlaylistId) {
        const resolvedPlaylistId = await this.restoreCachedPlaylistId(definition, cachedPlaylistId);
        if (resolvedPlaylistId) {
          continue;
        }
      }

      const existing = await this.spotifyClient.findPlaylistByName(definition.playlistName);
      if (existing) {
        await this.rememberPlaylistId(definition.key, existing.id);
        continue;
      }

      const created = await this.spotifyClient.createPlaylist(
        definition.playlistName,
        definition.playlistDescription,
        this.options.playlistPrivate,
      );
      await this.rememberPlaylistId(definition.key, created.id);
      this.logger.info(t("playlistCreated", definition.playlistName));

      if (!definition.buildCoverJpeg) {
        continue;
      }

      try {
        const coverJpeg = await definition.buildCoverJpeg();
        await this.spotifyClient.uploadPlaylistCoverImage(created.id, coverJpeg.toString("base64"));
        this.logger.info(t("coverUploaded", definition.playlistName));
      } catch (error) {
        this.logger.warn(
          t("coverUploadFailed", definition.playlistName, (error as Error).message),
        );
      }
    }
  }

  private resolveSavedTracksRequirements(databasePersistenceEnabled: boolean): SavedTracksFetchRequirements | undefined {
    if (this.options.syncRemovedTracksArchive && databasePersistenceEnabled) {
      return undefined;
    }

    return this.options.savedTracksRequirements;
  }

  private async resolveExcludedTrackIds(): Promise<Set<string>> {
    const excludePlaylistName = this.options.excludePlaylistName;
    if (!excludePlaylistName || excludePlaylistName.trim().length === 0) {
      return new Set();
    }

    return fetchExcludedTrackIds(this.spotifyClient, excludePlaylistName, this.logger);
  }

  private async syncRemovedTracksArchive(currentSavedTracks: SavedTrackItem[]): Promise<void> {
    const previousSnapshot = await this.readSavedTracksSnapshot();
    if (previousSnapshot.length > 0) {
      const currentTrackIds = new Set(currentSavedTracks.map((track) => track.trackId));
      const now = new Date();

      for (const track of previousSnapshot) {
        if (currentTrackIds.has(track.trackId)) {
          continue;
        }

        const existingArchive = await this.archiveRepository.getArchivedTrack(track.trackId);
        if (existingArchive) {
          continue;
        }

        await this.archiveRepository.upsertArchivedTrack({
          trackId: track.trackId,
          trackUri: track.trackUri,
          trackName: track.trackName,
          artistName: track.artistName,
          addedAt: track.addedAt,
          removedAt: now,
        });
        this.logger.info(
          t(
            "archivedRemovedTrack",
            track.artistName ?? "Unknown artist",
            track.trackName ?? track.trackId,
            track.trackId,
          ),
        );
      }
    }

    await this.writeSavedTracksSnapshot(currentSavedTracks);
  }

  private async readSavedTracksSnapshot(): Promise<SavedTrackItem[]> {
    const raw = await this.appStateRepository.getValue(SAVED_TRACKS_SNAPSHOT_KEY);
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as SavedTrackSnapshotItem[];
      return parsed
        .map((item) => ({
          trackId: item.trackId,
          trackUri: item.trackUri,
          trackName: item.trackName,
          artistName: item.artistName,
          addedAt: new Date(item.addedAtIso),
        }))
        .filter((item) => !Number.isNaN(item.addedAt.getTime()));
    } catch {
      this.logger.warn(t("savedTracksSnapshotInvalid"));
      return [];
    }
  }

  private async writeSavedTracksSnapshot(savedTracks: SavedTrackItem[]): Promise<void> {
    const payload = JSON.stringify(
      savedTracks.map((track) => ({
        trackId: track.trackId,
        trackUri: track.trackUri,
        trackName: track.trackName,
        artistName: track.artistName,
        addedAtIso: track.addedAt.toISOString(),
      } satisfies SavedTrackSnapshotItem)),
    );

    await this.appStateRepository.setValue(SAVED_TRACKS_SNAPSHOT_KEY, payload);
    await this.appStateRepository.setValue(
      SAVED_TRACKS_SNAPSHOT_UPDATED_AT_KEY,
      new Date().toISOString(),
    );
  }

  private async readPlaylistId(definitionKey: string): Promise<string | null> {
    const raw = await this.appStateRepository.getValue(buildPlaylistIdStateKey(definitionKey));
    return raw && raw.trim().length > 0 ? raw : null;
  }

  private async rememberPlaylistId(definitionKey: string, playlistId: string): Promise<void> {
    this.playlistIdsByDefinitionKey.set(definitionKey, playlistId);
    await this.appStateRepository.setValue(buildPlaylistIdStateKey(definitionKey), playlistId);
  }

  private async recoverOrCreatePlaylist(
    definition: AutoPlaylistDefinition,
    unavailablePlaylistId: string,
  ): Promise<string | null> {
    const existing = await this.spotifyClient.findPlaylistByName(definition.playlistName);
    if (existing && existing.id !== unavailablePlaylistId) {
      await this.rememberPlaylistId(definition.key, existing.id);
      return existing.id;
    }

    const created = await this.spotifyClient.createPlaylist(
      definition.playlistName,
      definition.playlistDescription,
      this.options.playlistPrivate,
    );
    await this.rememberPlaylistId(definition.key, created.id);
    this.logger.info(t("playlistCreated", definition.playlistName));

    if (definition.buildCoverJpeg) {
      try {
        const coverJpeg = await definition.buildCoverJpeg();
        await this.spotifyClient.uploadPlaylistCoverImage(created.id, coverJpeg.toString("base64"));
        this.logger.info(t("coverUploaded", definition.playlistName));
      } catch (error) {
        this.logger.warn(
          t("coverUploadFailed", definition.playlistName, (error as Error).message),
        );
      }
    }

    return created.id;
  }

  private async forgetPlaylistId(definitionKey: string): Promise<void> {
    this.playlistIdsByDefinitionKey.delete(definitionKey);
    await this.appStateRepository.deleteValue(buildPlaylistIdStateKey(definitionKey));
  }

  private async restoreCachedPlaylistId(
    definition: AutoPlaylistDefinition,
    cachedPlaylistId: string,
  ): Promise<string | null> {
    try {
      await this.spotifyClient.getPlaylist(cachedPlaylistId);
      const hasPlaylistInLibrary = await this.spotifyClient.hasPlaylistInLibrary(cachedPlaylistId);
      if (!hasPlaylistInLibrary) {
        await this.forgetPlaylistId(definition.key);
        return this.recoverOrCreatePlaylist(definition, cachedPlaylistId);
      }

      this.playlistIdsByDefinitionKey.set(definition.key, cachedPlaylistId);
      return cachedPlaylistId;
    } catch (error) {
      if (!isMissingPlaylistError(error)) {
        throw error;
      }
    }

    await this.forgetPlaylistId(definition.key);
    return this.recoverOrCreatePlaylist(definition, cachedPlaylistId);
  }
}

export function hashTrackUris(trackUris: string[]): string {
  return `${trackUris.length}:${trackUris.join("|")}`;
}

export async function readFreshSavedTracksSnapshot(
  appStateRepository: AppStateRepository,
  maxAgeMs: number,
): Promise<SavedTrackItem[] | null> {
  const [raw, rawUpdatedAt] = await Promise.all([
    appStateRepository.getValue(SAVED_TRACKS_SNAPSHOT_KEY),
    appStateRepository.getValue(SAVED_TRACKS_SNAPSHOT_UPDATED_AT_KEY),
  ]);
  if (!raw || !rawUpdatedAt) {
    return null;
  }

  const updatedAt = new Date(rawUpdatedAt);
  if (Number.isNaN(updatedAt.getTime()) || Date.now() - updatedAt.getTime() > maxAgeMs) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as SavedTrackSnapshotItem[];
    const tracks = parsed
      .map((item) => ({
        trackId: item.trackId,
        trackUri: item.trackUri,
        trackName: item.trackName,
        artistName: item.artistName,
        addedAt: new Date(item.addedAtIso),
      }))
      .filter((item) => !Number.isNaN(item.addedAt.getTime()));

    if (tracks.length === 0) {
      return null;
    }

    return tracks.sort((left, right) => right.addedAt.getTime() - left.addedAt.getTime());
  } catch {
    return null;
  }
}

async function defaultRunExclusive<T>(_modeName: string, run: () => Promise<T>): Promise<T> {
  return run();
}

function buildPlaylistIdStateKey(definitionKey: string): string {
  return `${PLAYLIST_ID_KEY_PREFIX}${definitionKey}`;
}

function isMissingPlaylistError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("Spotify request failed (404)") ||
    error.message.includes("Spotify request failed (403)") ||
    error.message.includes("Spotify API error during") &&
    (error.message.includes("(404)") || error.message.includes("(403)"))
  );
}
