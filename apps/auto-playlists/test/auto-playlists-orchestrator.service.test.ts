import { beforeEach, describe, expect, it, vi } from "vitest";
import { AutoPlaylistsOrchestratorService } from "../src/runtime/auto-playlists-orchestrator.service.js";
import { initLocale } from "../src/i18n/index.js";
import type { AppConfig } from "../src/core/config.js";
import type { Logger } from "../src/shared/types.js";

describe("AutoPlaylistsOrchestratorService", () => {
  beforeEach(() => {
    initLocale("RU");
  });

  it("logs that auto playlists are not configured when both services are absent", async () => {
    const log: Logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const cfg = {
      spotifyClientId: "client-id",
      spotifyClientSecret: "client-secret",
      spotifyRedirectUri: "http://127.0.0.1:3000/callback",
      pollIntervalMs: 5000,
      spotifyMinRequestGapMs: 0,
      trackMonitoringEnabled: false,
      databaseUrl: "",
      requestTimeoutMs: 5000,
      autoPlaylistsPlaylistPrefix: "",
      autoPlaylistsPlaylistSuffix: "[AUTO]",
      autoPlaylistsFrequentSyncIntervalMs: 600000,
      autoPlaylistsRareSyncIntervalMs: 10800000,
      savedRecentCoverColor: "#000000",
      savedInYearCoverColor: "#060E73",
      recentFromPlaylistsCoverColor: "#14532D",
      savedRecentWindows: [],
      savedInYearYears: [],
      autoPlaylistsMergedPlaylists: [],
      autoPlaylistsRecentFromPlaylists: [],
      spotifyProxyUrl: "",
      appLocale: "RU",
    } as AppConfig;

    const authManager = {
      initialize: vi.fn().mockResolvedValue(undefined),
    };

    const spotifyClient = {
      initializeTransport: vi.fn().mockResolvedValue(undefined),
    };

    const databaseFeatures = {
      initialize: vi.fn().mockResolvedValue(undefined),
    };

    const watcher = {
      start: vi.fn(),
      stop: vi.fn(),
    };

    const orchestrator = new AutoPlaylistsOrchestratorService(
      cfg,
      log,
      authManager as never,
      spotifyClient as never,
      null,
      databaseFeatures as never,
      watcher as never,
      null,
      null,
      null,
    );

    await orchestrator.onModuleInit();

    expect(log.info).toHaveBeenCalledWith("Автоплейлисты не настроены.");
  });

  it("starts and stops merged playlist sync service", async () => {
    const log: Logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const cfg = {
      spotifyClientId: "client-id",
      spotifyClientSecret: "client-secret",
      spotifyRedirectUri: "http://127.0.0.1:3000/callback",
      pollIntervalMs: 5000,
      spotifyMinRequestGapMs: 0,
      trackMonitoringEnabled: false,
      databaseUrl: "",
      requestTimeoutMs: 5000,
      autoPlaylistsPlaylistPrefix: "",
      autoPlaylistsPlaylistSuffix: "[AUTO]",
      autoPlaylistsFrequentSyncIntervalMs: 600000,
      autoPlaylistsRareSyncIntervalMs: 10800000,
      savedRecentCoverColor: "#000000",
      savedInYearCoverColor: "#060E73",
      recentFromPlaylistsCoverColor: "#14532D",
      savedRecentWindows: [],
      savedInYearYears: [],
      autoPlaylistsMergedPlaylists: [{ targetName: "Mix", sourceNames: ["A"] }],
      autoPlaylistsRecentFromPlaylists: [],
      spotifyProxyUrl: "",
      appLocale: "RU",
    } as AppConfig;

    const authManager = {
      initialize: vi.fn().mockResolvedValue(undefined),
    };

    const spotifyClient = {
      initializeTransport: vi.fn().mockResolvedValue(undefined),
    };

    const databaseFeatures = {
      initialize: vi.fn().mockResolvedValue(undefined),
    };

    const watcher = {
      start: vi.fn(),
      stop: vi.fn(),
    };

    const mergedSyncService = {
      start: vi.fn(),
      stop: vi.fn(),
    };

    const orchestrator = new AutoPlaylistsOrchestratorService(
      cfg,
      log,
      authManager as never,
      spotifyClient as never,
      null,
      databaseFeatures as never,
      watcher as never,
      null,
      null,
      mergedSyncService as never,
    );

    await orchestrator.onModuleInit();
    await orchestrator.onApplicationShutdown();

    expect(mergedSyncService.start).toHaveBeenCalledTimes(1);
    expect(mergedSyncService.stop).toHaveBeenCalledTimes(1);
    expect(log.info).not.toHaveBeenCalledWith("Автоплейлисты не настроены.");
  });
});
