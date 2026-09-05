import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  parseHexColor,
  loadConfig,
  parseMergedPlaylists,
  parsePlaylistSuffix,
  parseSavedInYearYears,
  parseSavedRecentWindows,
} from "../src/core/config.js";

const ENV_KEYS = [
  "SPOTIFY_CLIENT_ID",
  "SPOTIFY_CLIENT_SECRET",
  "SPOTIFY_REDIRECT_URI",
  "DATABASE_URL",
  "POLL_INTERVAL_MS",
  "SPOTIFY_MIN_REQUEST_GAP_MS",
  "TRACK_MONITORING_ENABLED",
  "AUTO_PLAYLISTS_PLAYLIST_PREFIX",
  "AUTO_PLAYLISTS_PLAYLIST_SUFFIX",
  "AUTO_PLAYLISTS_FREQUENT_SYNC_INTERVAL_MS",
  "AUTO_PLAYLISTS_RARE_SYNC_INTERVAL_MS",
  "AUTO_PLAYLISTS_SYNC_QUEUE_GAP_MS",
  "SAVED_RECENT_COVER_COLOR",
  "SAVED_IN_YEAR_COVER_COLOR",
  "SAVED_RECENT_WINDOWS",
  "SAVED_IN_YEAR_YEARS",
  "AUTO_PLAYLISTS_MERGED_PLAYLISTS",
  "SPOTIFY_PROXY_ENABLED",
  "SPOTIFY_PROXY_URL",
  "APP_LOCALE",
] as const;

const originalEnv = new Map<string, string | undefined>();

describe("auto-playlists config parsers", () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = originalEnv.get(key);
      if (value === undefined) {
        delete process.env[key];
        continue;
      }

      process.env[key] = value;
    }
    originalEnv.clear();
  });

  it("parses, deduplicates and sorts saved recent windows", () => {
    const parsed = parseSavedRecentWindows("100, 20, 20,50");
    expect(parsed).toEqual([20, 50, 100]);
  });

  it("returns empty list when saved recent windows are missing", () => {
    expect(parseSavedRecentWindows(undefined)).toEqual([]);
    expect(parseSavedRecentWindows("")).toEqual([]);
  });

  it("throws on invalid saved recent windows", () => {
    expect(() => parseSavedRecentWindows("0,20")).toThrow();
    expect(() => parseSavedRecentWindows("abc,20")).toThrow();
  });

  it("parses, deduplicates and sorts saved-in-year values", () => {
    const parsed = parseSavedInYearYears("2024, 2022, 2024,2023");
    expect(parsed).toEqual([2022, 2023, 2024]);
  });

  it("returns empty list when saved-in-year values are missing", () => {
    expect(parseSavedInYearYears(undefined)).toEqual([]);
    expect(parseSavedInYearYears("")).toEqual([]);
  });

  it("throws on invalid saved-in-year values", () => {
    expect(() => parseSavedInYearYears("2005")).toThrow();
    expect(() => parseSavedInYearYears("abc,2024")).toThrow();
  });

  it("parses merged playlists configuration", () => {
    expect(parseMergedPlaylists("Mix=A+B;Gym=C")).toEqual([
      { targetName: "Mix", sourceNames: ["A", "B"] },
      { targetName: "Gym", sourceNames: ["C"] },
    ]);
  });

  it("loads merged playlists from env", () => {
    process.env.SPOTIFY_CLIENT_ID = "test-client-id";
    process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret";
    process.env.AUTO_PLAYLISTS_MERGED_PLAYLISTS = "Mix=A+B";

    const config = loadConfig();

    expect(config.autoPlaylistsMergedPlaylists).toEqual([
      { targetName: "Mix", sourceNames: ["A", "B"] },
    ]);
  });

  it("normalizes valid hex colors", () => {
    expect(parseHexColor("#000")).toBe("#000000");
    expect(parseHexColor("1a2b3c")).toBe("#1A2B3C");
  });

  it("throws on invalid hex colors", () => {
    expect(() => parseHexColor("zzz")).toThrow();
    expect(() => parseHexColor("#12345")).toThrow();
  });

  it("uses default cover colors when env values are empty", () => {
    process.env.SPOTIFY_CLIENT_ID = "test-client-id";
    process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret";
    process.env.SAVED_RECENT_COVER_COLOR = "";
    process.env.SAVED_IN_YEAR_COVER_COLOR = "   ";

    const config = loadConfig();

    expect(config.savedRecentCoverColor).toBe("#000000");
    expect(config.savedInYearCoverColor).toBe("#060E73");
  });

  it("uses defaults for all supported empty env values", () => {
    process.env.SPOTIFY_CLIENT_ID = "test-client-id";
    process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret";
    process.env.SPOTIFY_REDIRECT_URI = " ";
    process.env.POLL_INTERVAL_MS = "";
    process.env.SPOTIFY_MIN_REQUEST_GAP_MS = "   ";
    process.env.TRACK_MONITORING_ENABLED = "";
    process.env.DATABASE_URL = " ";
    process.env.AUTO_PLAYLISTS_PLAYLIST_PREFIX = " ";
    process.env.AUTO_PLAYLISTS_PLAYLIST_SUFFIX = "";
    process.env.AUTO_PLAYLISTS_FREQUENT_SYNC_INTERVAL_MS = "";
    process.env.AUTO_PLAYLISTS_RARE_SYNC_INTERVAL_MS = " ";
    process.env.AUTO_PLAYLISTS_SYNC_QUEUE_GAP_MS = "";
    process.env.SAVED_RECENT_COVER_COLOR = "";
    process.env.SAVED_IN_YEAR_COVER_COLOR = " ";
    process.env.AUTO_PLAYLISTS_MERGED_PLAYLISTS = "";
    process.env.SPOTIFY_PROXY_ENABLED = "";
    process.env.SPOTIFY_PROXY_URL = " ";
    process.env.APP_LOCALE = "";

    const config = loadConfig();

    expect(config.spotifyRedirectUri).toBe("http://127.0.0.1:3000/callback");
    expect(config.pollIntervalMs).toBe(5000);
    expect(config.spotifyMinRequestGapMs).toBe(100);
    expect(config.trackMonitoringEnabled).toBe(true);
    expect(config.databaseUrl).toBe("");
    expect(config.autoPlaylistsPlaylistPrefix).toBe("");
    expect(config.autoPlaylistsPlaylistSuffix).toBe("[AUTO]");
    expect(config.autoPlaylistsFrequentSyncIntervalMs).toBe(600000);
    expect(config.autoPlaylistsRareSyncIntervalMs).toBe(10800000);
    expect(config.autoPlaylistsSyncQueueGapMs).toBe(60000);
    expect(config.savedRecentCoverColor).toBe("#000000");
    expect(config.savedInYearCoverColor).toBe("#060E73");
    expect(config.autoPlaylistsMergedPlaylists).toEqual([]);
    expect(config.spotifyProxyEnabled).toBe(false);
    expect(config.spotifyProxyUrl).toBe("");
    expect(config.appLocale).toBe("EN");
  });

  it("uses default suffix when suffix is missing or empty", () => {
    expect(parsePlaylistSuffix(undefined)).toBe("[AUTO]");
    expect(parsePlaylistSuffix("")).toBe("[AUTO]");
    expect(parsePlaylistSuffix("   ")).toBe("[AUTO]");
  });

  it("preserves explicit suffix", () => {
    expect(parsePlaylistSuffix("[SYNC]")).toBe("[SYNC]");
  });

  it("throws a localized russian error when spotify credentials are missing", () => {
    process.env.APP_LOCALE = "RU";

    expect(() => loadConfig()).toThrow(
      "Не указаны обязательные переменные окружения SPOTIFY_CLIENT_ID и SPOTIFY_CLIENT_SECRET.",
    );
  });

  it("throws a localized english error when only spotify client secret is missing", () => {
    process.env.APP_LOCALE = "EN";
    process.env.SPOTIFY_CLIENT_ID = "test-client-id";

    expect(() => loadConfig()).toThrow(
      "Required environment variable SPOTIFY_CLIENT_SECRET is not set.",
    );
  });

  it("uses env.example defaults for optional runtime parameters", () => {
    process.env.SPOTIFY_CLIENT_ID = "test-client-id";
    process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret";

    const config = loadConfig();

    expect(config.spotifyRedirectUri).toBe("http://127.0.0.1:3000/callback");
    expect(config.pollIntervalMs).toBe(5000);
    expect(config.spotifyMinRequestGapMs).toBe(100);
    expect(config.trackMonitoringEnabled).toBe(true);
    expect(config.databaseUrl).toBe("");
    expect(config.autoPlaylistsPlaylistPrefix).toBe("");
    expect(config.autoPlaylistsPlaylistSuffix).toBe("[AUTO]");
    expect(config.autoPlaylistsFrequentSyncIntervalMs).toBe(600000);
    expect(config.autoPlaylistsRareSyncIntervalMs).toBe(10800000);
    expect(config.autoPlaylistsSyncQueueGapMs).toBe(60000);
    expect(config.savedRecentCoverColor).toBe("#000000");
    expect(config.savedInYearCoverColor).toBe("#060E73");
    expect(config.savedRecentWindows).toEqual([]);
    expect(config.savedInYearYears).toEqual([]);
    expect(config.autoPlaylistsMergedPlaylists).toEqual([]);
    expect(config.spotifyProxyEnabled).toBe(false);
    expect(config.spotifyProxyUrl).toBe("");
    expect(config.appLocale).toBe("EN");
  });

  it("uses dedicated full sync interval when it is configured", () => {
    process.env.SPOTIFY_CLIENT_ID = "test-client-id";
    process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret";
    process.env.SPOTIFY_REDIRECT_URI = "http://127.0.0.1:3000/callback";
    process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/spotify_helper_test";
    process.env.AUTO_PLAYLISTS_RARE_SYNC_INTERVAL_MS = "7200000";

    expect(loadConfig().autoPlaylistsRareSyncIntervalMs).toBe(7200000);
  });

  it("allows empty database url", () => {
    process.env.SPOTIFY_CLIENT_ID = "test-client-id";
    process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret";
    process.env.SPOTIFY_REDIRECT_URI = "http://127.0.0.1:3000/callback";
    process.env.DATABASE_URL = "";

    expect(loadConfig().databaseUrl).toBe("");
  });

  it("prefers frequent sync interval env name", () => {
    process.env.SPOTIFY_CLIENT_ID = "test-client-id";
    process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret";
    process.env.SPOTIFY_REDIRECT_URI = "http://127.0.0.1:3000/callback";
    process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/spotify_helper_test";
    process.env.AUTO_PLAYLISTS_FREQUENT_SYNC_INTERVAL_MS = "45000";

    expect(loadConfig().autoPlaylistsFrequentSyncIntervalMs).toBe(45000);
  });

  it("uses sync queue gap from env when it is configured", () => {
    process.env.SPOTIFY_CLIENT_ID = "test-client-id";
    process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret";
    process.env.AUTO_PLAYLISTS_SYNC_QUEUE_GAP_MS = "15000";

    expect(loadConfig().autoPlaylistsSyncQueueGapMs).toBe(15000);
  });

  it("uses default frequent and full sync intervals when env values are missing", () => {
    process.env.SPOTIFY_CLIENT_ID = "test-client-id";
    process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret";
    process.env.SPOTIFY_REDIRECT_URI = "http://127.0.0.1:3000/callback";
    process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/spotify_helper_test";
    delete process.env.AUTO_PLAYLISTS_FREQUENT_SYNC_INTERVAL_MS;
    delete process.env.AUTO_PLAYLISTS_RARE_SYNC_INTERVAL_MS;

    const config = loadConfig();

    expect(config.autoPlaylistsFrequentSyncIntervalMs).toBe(600000);
    expect(config.autoPlaylistsRareSyncIntervalMs).toBe(10800000);
  });
});
