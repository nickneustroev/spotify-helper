import type { PrismaClient } from "@prisma/client";
import { Inject, Injectable, type OnApplicationShutdown, type OnModuleInit } from "@nestjs/common";
import { type AppConfig, getSafeConfigForLogs } from "../core/config.js";
import {
  AUTO_PLAYLISTS_FREQUENT_SYNC_SERVICE,
  AUTO_PLAYLISTS_MERGED_SYNC_SERVICE,
  AUTO_PLAYLISTS_PLAYLIST_RECENT_SYNC_SERVICE,
  AUTO_PLAYLISTS_RARE_SYNC_SERVICE,
  APP_CONFIG,
  APP_LOGGER,
  AUTH_MANAGER,
  DATABASE_FEATURES,
  PRISMA_CLIENT,
  SPOTIFY_CLIENT,
  TRACK_WATCHER,
} from "../core/nest.tokens.js";
import type { AutoPlaylistsSyncService } from "../features/playlist-definitions/auto-playlists-sync-service.js";
import type { DatabaseFeatures } from "../persistence/database-features.js";
import type { Logger } from "../shared/types.js";
import type { AuthManager } from "../spotify/auth-manager.js";
import { t } from "../i18n/index.js";
import type { SpotifyClient } from "../spotify/spotify-client.js";
import type { TrackWatcher } from "./track-watcher.js";

@Injectable()
export class AutoPlaylistsOrchestratorService implements OnModuleInit, OnApplicationShutdown {
  private shuttingDown = false;

  constructor(
    @Inject(APP_CONFIG) private readonly cfg: AppConfig,
    @Inject(APP_LOGGER) private readonly log: Logger,
    @Inject(AUTH_MANAGER) private readonly authManager: AuthManager,
    @Inject(SPOTIFY_CLIENT) private readonly spotifyClient: SpotifyClient,
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient | null,
    @Inject(DATABASE_FEATURES) private readonly databaseFeatures: DatabaseFeatures,
    @Inject(TRACK_WATCHER) private readonly watcher: TrackWatcher,
    @Inject(AUTO_PLAYLISTS_FREQUENT_SYNC_SERVICE)
    private readonly autoPlaylistsFrequentSyncService: AutoPlaylistsSyncService | null,
    @Inject(AUTO_PLAYLISTS_RARE_SYNC_SERVICE)
    private readonly autoPlaylistsRareSyncService: AutoPlaylistsSyncService | null,
    @Inject(AUTO_PLAYLISTS_MERGED_SYNC_SERVICE)
    private readonly autoPlaylistsMergedSyncService: AutoPlaylistsSyncService | null,
    @Inject(AUTO_PLAYLISTS_PLAYLIST_RECENT_SYNC_SERVICE)
    private readonly autoPlaylistsPlaylistRecentSyncService: AutoPlaylistsSyncService | null,
  ) {}

  public async onModuleInit(): Promise<void> {
    this.log.info(t("configLoaded", JSON.stringify(getSafeConfigForLogs(this.cfg))));
    await this.authManager.initialize();
    this.log.info(t("spotifyAuthReady"));
    await this.spotifyClient.initializeTransport();
    await this.databaseFeatures.initialize();

    if (this.cfg.trackMonitoringEnabled) {
      this.watcher.start();
    } else {
      this.log.info(t("trackMonitoringDisabled"));
    }

    if (
      !this.autoPlaylistsFrequentSyncService &&
      !this.autoPlaylistsRareSyncService &&
      !this.autoPlaylistsMergedSyncService &&
      !this.autoPlaylistsPlaylistRecentSyncService
    ) {
      this.log.info(t("noPlaylistDefinitionsConfigured"));
    }

    this.autoPlaylistsFrequentSyncService?.start();
    this.autoPlaylistsRareSyncService?.start();
    this.autoPlaylistsMergedSyncService?.start();
    this.autoPlaylistsPlaylistRecentSyncService?.start();
  }

  public async onApplicationShutdown(signal?: string): Promise<void> {
    if (this.shuttingDown) {
      return;
    }
    this.shuttingDown = true;

    this.log.info(t("stopping", signal ?? "app.close"));
    this.watcher.stop();
    this.autoPlaylistsFrequentSyncService?.stop();
    this.autoPlaylistsRareSyncService?.stop();
    this.autoPlaylistsMergedSyncService?.stop();
    this.autoPlaylistsPlaylistRecentSyncService?.stop();
    await this.prisma?.$disconnect();
  }
}
