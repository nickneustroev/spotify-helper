import "reflect-metadata";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/core/app.module.js";
import { initLocale } from "../src/i18n/index.js";
import { AutoPlaylistsSyncService } from "../src/features/playlist-definitions/auto-playlists-sync-service.js";
import { TrackWatcher } from "../src/runtime/track-watcher.js";
import { AuthManager } from "../src/spotify/auth-manager.js";
import { SpotifyClient } from "../src/spotify/spotify-client.js";

describe("Nest bootstrap lifecycle", () => {
  beforeEach(() => {
    process.env.SPOTIFY_CLIENT_ID = "test-client-id";
    process.env.SPOTIFY_CLIENT_SECRET = "test-client-secret";
    process.env.SPOTIFY_REDIRECT_URI = "http://127.0.0.1:3000/callback";
    process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/spotify_helper_test";
    process.env.POLL_INTERVAL_MS = "2500";
    process.env.SAVED_RECENT_WINDOWS = "20,50,100";
    process.env.SAVED_IN_YEAR_YEARS = "2025";
    process.env.AUTO_PLAYLISTS_MERGED_PLAYLISTS = "Merged=RECENT 20 [AUTO]+2025 [AUTO]";
    process.env.APP_LOCALE = "EN";

    initLocale("EN");

    vi.spyOn(AuthManager.prototype, "initialize").mockResolvedValue();
    vi.spyOn(SpotifyClient.prototype, "initializeTransport").mockResolvedValue();
    vi.spyOn(TrackWatcher.prototype, "start").mockImplementation(() => {});
    vi.spyOn(TrackWatcher.prototype, "stop").mockImplementation(() => {});
    vi.spyOn(AutoPlaylistsSyncService.prototype, "start").mockImplementation(() => {});
    vi.spyOn(AutoPlaylistsSyncService.prototype, "stop").mockImplementation(() => {});
    vi.spyOn(PrismaClient.prototype, "$queryRawUnsafe").mockResolvedValue([{ "?column?": 1 }]);
    vi.spyOn(PrismaClient.prototype, "$disconnect").mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates and closes application context without runtime failures", async () => {
    const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

    expect(AuthManager.prototype.initialize).toHaveBeenCalledTimes(1);
    expect(SpotifyClient.prototype.initializeTransport).toHaveBeenCalledTimes(1);
    expect(PrismaClient.prototype.$queryRawUnsafe).toHaveBeenCalledWith("SELECT 1");
    expect(TrackWatcher.prototype.start).toHaveBeenCalledTimes(1);
    expect(AutoPlaylistsSyncService.prototype.start).toHaveBeenCalledTimes(3);

    await app.close();

    expect(TrackWatcher.prototype.stop).toHaveBeenCalledTimes(1);
    expect(AutoPlaylistsSyncService.prototype.stop).toHaveBeenCalledTimes(3);
    expect(PrismaClient.prototype.$disconnect).toHaveBeenCalledTimes(1);
  });
});
