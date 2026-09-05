import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { AppConfig } from "../src/core/config.js";
import { DatabaseFeatures } from "../src/persistence/database-features.js";
import type { Logger } from "../src/shared/types.js";
import { initLocale } from "../src/i18n/index.js";

const baseConfig: AppConfig = {
  spotifyClientId: "client-id",
  spotifyClientSecret: "client-secret",
  spotifyRedirectUri: "http://127.0.0.1:3000/callback",
  pollIntervalMs: 2500,
  spotifyMinRequestGapMs: 0,
  printOnStart: true,
  databaseUrl: "",
  requestTimeoutMs: 5000,
  autoPlaylistsPlaylistPrefix: "SAVED",
  autoPlaylistsPlaylistSuffix: "[AUTO]",
  autoPlaylistsFrequentSyncIntervalMs: 600000,
  autoPlaylistsRareSyncIntervalMs: 10800000,
  savedRecentCoverColor: "#000000",
  savedInYearCoverColor: "#000000",
  savedRecentWindows: [],
  savedInYearYears: [],
  spotifyProxyUrl: "",
  appLocale: "EN",
};

function createLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe("DatabaseFeatures", () => {
  it("disables DB persistence when DATABASE_URL is empty", async () => {
    initLocale("EN");
    const logger = createLogger();
    const features = new DatabaseFeatures({ ...baseConfig, databaseUrl: "" }, null, logger);

    await features.initialize();

    expect(features.isPersistenceEnabled()).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("DATABASE_URL"));
  });

  it("enables DB persistence when the connection check succeeds", async () => {
    initLocale("EN");
    const logger = createLogger();
    const prisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ ok: 1 }]),
    } as unknown as PrismaClient;
    const features = new DatabaseFeatures(
      { ...baseConfig, databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5432/app" },
      prisma,
      logger,
    );

    await features.initialize();

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith("SELECT 1");
    expect(features.isPersistenceEnabled()).toBe(true);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("verified"));
  });

  it("disables DB persistence when the connection check fails", async () => {
    initLocale("EN");
    const logger = createLogger();
    const prisma = {
      $queryRawUnsafe: vi.fn().mockRejectedValue(new Error("connection refused")),
    } as unknown as PrismaClient;
    const features = new DatabaseFeatures(
      { ...baseConfig, databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5432/app" },
      prisma,
      logger,
    );

    await features.initialize();

    expect(features.isPersistenceEnabled()).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("unable to connect"));
  });
});
