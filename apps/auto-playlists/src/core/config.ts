import { config as loadEnv } from "dotenv";
import { z } from "zod";

const DEFAULT_SPOTIFY_REDIRECT_URI = "http://127.0.0.1:3000/callback";
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_SPOTIFY_MIN_REQUEST_GAP_MS = 500;
const DEFAULT_AUTO_PLAYLISTS_FREQUENT_SYNC_INTERVAL_MS = 600000;
const DEFAULT_AUTO_PLAYLISTS_RARE_SYNC_INTERVAL_MS = 10800000;
const DEFAULT_AUTO_PLAYLISTS_SYNC_QUEUE_GAP_MS = 60000;
const DEFAULT_SAVED_RECENT_COVER_COLOR = "000000";
const DEFAULT_SAVED_IN_YEAR_COVER_COLOR = "060E73";
const DEFAULT_RECENT_FROM_PLAYLISTS_COVER_COLOR = "14532D";
const DEFAULT_APP_LOCALE = "EN";
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;

const savedRecentWindowsSchema = z
  .string()
  .default("")
  .transform((value) => parseSavedRecentWindows(value));

const savedInYearYearsSchema = z
  .string()
  .default("")
  .transform((value) => parseSavedInYearYears(value));

const mergedPlaylistsSchema = z
  .string()
  .default("")
  .transform((value) => parseMergedPlaylists(value));

const recentFromPlaylistsSchema = z
  .string()
  .default("")
  .transform((value) => parseRecentFromPlaylists(value));

const optionalEnv = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
    schema.optional(),
  );

const hexColorSchema = (defaultValue: string) =>
  optionalEnv(z.string()).transform((value) => parseOptionalHexColor(value, defaultValue));
const playlistSuffixSchema = optionalEnv(z.string()).transform((value) => parsePlaylistSuffix(value));

const schema = z.object({
  SPOTIFY_CLIENT_ID: z.string().min(1),
  SPOTIFY_CLIENT_SECRET: z.string().min(1),
  SPOTIFY_REDIRECT_URI: optionalEnv(z.string().url()).default(DEFAULT_SPOTIFY_REDIRECT_URI),
  POLL_INTERVAL_MS: optionalEnv(z.coerce.number().int().min(500)).default(DEFAULT_POLL_INTERVAL_MS),
  SPOTIFY_MIN_REQUEST_GAP_MS: optionalEnv(z.coerce.number().int().min(0)).default(DEFAULT_SPOTIFY_MIN_REQUEST_GAP_MS),
  TRACK_MONITORING_ENABLED: optionalEnv(z.string())
    .transform((v) => v !== "false")
    .default(true),
  DATABASE_URL: optionalEnv(z.string()).default(""),
  REQUEST_TIMEOUT_MS: optionalEnv(z.coerce.number().int().min(1000)).default(DEFAULT_REQUEST_TIMEOUT_MS),
  AUTO_PLAYLISTS_PLAYLIST_PREFIX: optionalEnv(z.string()).default(""),
  AUTO_PLAYLISTS_PLAYLIST_SUFFIX: playlistSuffixSchema,
  AUTO_PLAYLISTS_FREQUENT_SYNC_INTERVAL_MS: optionalEnv(
    z.coerce.number().int().min(5000),
  )
    .default(DEFAULT_AUTO_PLAYLISTS_FREQUENT_SYNC_INTERVAL_MS),
  AUTO_PLAYLISTS_RARE_SYNC_INTERVAL_MS: optionalEnv(
    z.coerce.number().int().min(5000),
  )
    .default(DEFAULT_AUTO_PLAYLISTS_RARE_SYNC_INTERVAL_MS),
  AUTO_PLAYLISTS_SYNC_QUEUE_GAP_MS: optionalEnv(z.coerce.number().int().min(0)).default(
    DEFAULT_AUTO_PLAYLISTS_SYNC_QUEUE_GAP_MS,
  ),
  SAVED_RECENT_COVER_COLOR: hexColorSchema(DEFAULT_SAVED_RECENT_COVER_COLOR),
  SAVED_IN_YEAR_COVER_COLOR: hexColorSchema(DEFAULT_SAVED_IN_YEAR_COVER_COLOR),
  RECENT_FROM_PLAYLISTS_COVER_COLOR: hexColorSchema(DEFAULT_RECENT_FROM_PLAYLISTS_COVER_COLOR),
  SAVED_RECENT_WINDOWS: savedRecentWindowsSchema,
  SAVED_IN_YEAR_YEARS: savedInYearYearsSchema,
  AUTO_PLAYLISTS_MERGED_PLAYLISTS: mergedPlaylistsSchema,
  AUTO_PLAYLISTS_RECENT_FROM_PLAYLISTS: recentFromPlaylistsSchema,
  EXCLUDE_PLAYLIST_TITLE: optionalEnv(z.string().trim()).default(""),
  SPOTIFY_PROXY_URL: optionalEnv(z.string()).default(""),
  APP_LOCALE: optionalEnv(z.enum(["EN", "RU"])).default(DEFAULT_APP_LOCALE),
});

export interface AppConfig {
  spotifyClientId: string;
  spotifyClientSecret: string;
  spotifyRedirectUri: string;
  pollIntervalMs: number;
  spotifyMinRequestGapMs: number;
  trackMonitoringEnabled: boolean;
  databaseUrl: string;
  requestTimeoutMs: number;
  autoPlaylistsPlaylistPrefix: string;
  autoPlaylistsPlaylistSuffix: string;
  autoPlaylistsFrequentSyncIntervalMs: number;
  autoPlaylistsRareSyncIntervalMs: number;
  autoPlaylistsSyncQueueGapMs: number;
  savedRecentCoverColor: string;
  savedInYearCoverColor: string;
  recentFromPlaylistsCoverColor: string;
  savedRecentWindows: number[];
  savedInYearYears: number[];
  autoPlaylistsMergedPlaylists: MergedPlaylistConfig[];
  autoPlaylistsRecentFromPlaylists: PlaylistRecentConfig[];
  excludePlaylistTitle: string;
  spotifyProxyUrl: string;
  appLocale: "EN" | "RU";
}

export function loadConfig(): AppConfig {
  loadAppEnv();
  assertSpotifyCredentialsConfigured(process.env);
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment config: ${details}`);
  }

  const env = parsed.data;

  return {
    spotifyClientId: env.SPOTIFY_CLIENT_ID,
    spotifyClientSecret: env.SPOTIFY_CLIENT_SECRET,
    spotifyRedirectUri: env.SPOTIFY_REDIRECT_URI,
    pollIntervalMs: env.POLL_INTERVAL_MS,
    spotifyMinRequestGapMs: env.SPOTIFY_MIN_REQUEST_GAP_MS,
    trackMonitoringEnabled: env.TRACK_MONITORING_ENABLED,
    databaseUrl: env.DATABASE_URL,
    requestTimeoutMs: env.REQUEST_TIMEOUT_MS,
    autoPlaylistsPlaylistPrefix: env.AUTO_PLAYLISTS_PLAYLIST_PREFIX,
    autoPlaylistsPlaylistSuffix: env.AUTO_PLAYLISTS_PLAYLIST_SUFFIX,
    autoPlaylistsFrequentSyncIntervalMs: env.AUTO_PLAYLISTS_FREQUENT_SYNC_INTERVAL_MS,
    autoPlaylistsRareSyncIntervalMs: env.AUTO_PLAYLISTS_RARE_SYNC_INTERVAL_MS,
    autoPlaylistsSyncQueueGapMs: env.AUTO_PLAYLISTS_SYNC_QUEUE_GAP_MS,
    savedRecentCoverColor: env.SAVED_RECENT_COVER_COLOR,
    savedInYearCoverColor: env.SAVED_IN_YEAR_COVER_COLOR,
    recentFromPlaylistsCoverColor: env.RECENT_FROM_PLAYLISTS_COVER_COLOR,
    savedRecentWindows: env.SAVED_RECENT_WINDOWS,
    savedInYearYears: env.SAVED_IN_YEAR_YEARS,
    autoPlaylistsMergedPlaylists: env.AUTO_PLAYLISTS_MERGED_PLAYLISTS,
    autoPlaylistsRecentFromPlaylists: env.AUTO_PLAYLISTS_RECENT_FROM_PLAYLISTS,
    excludePlaylistTitle: env.EXCLUDE_PLAYLIST_TITLE,
    spotifyProxyUrl: env.SPOTIFY_PROXY_URL,
    appLocale: env.APP_LOCALE,
  };
}

function assertSpotifyCredentialsConfigured(env: NodeJS.ProcessEnv): void {
  const missingKeys = [
    isMissingEnvValue(env.SPOTIFY_CLIENT_ID) ? "SPOTIFY_CLIENT_ID" : null,
    isMissingEnvValue(env.SPOTIFY_CLIENT_SECRET) ? "SPOTIFY_CLIENT_SECRET" : null,
  ].filter((value): value is "SPOTIFY_CLIENT_ID" | "SPOTIFY_CLIENT_SECRET" => value !== null);

  if (missingKeys.length === 0) {
    return;
  }

  const locale = resolveAppLocale(env.APP_LOCALE);
  throw new Error(buildMissingSpotifyCredentialsMessage(locale, missingKeys));
}

function loadAppEnv(): void {
  if (process.env.NODE_ENV === "test" || process.env.VITEST_WORKER_ID) {
    return;
  }

  loadEnv({ quiet: true });
}

export function getSafeConfigForLogs(cfg: AppConfig): Record<string, string | number | boolean> {
  return {
    spotifyClientId: cfg.spotifyClientId,
    spotifyRedirectUri: cfg.spotifyRedirectUri,
    pollIntervalMs: cfg.pollIntervalMs,
    spotifyMinRequestGapMs: cfg.spotifyMinRequestGapMs,
    trackMonitoringEnabled: cfg.trackMonitoringEnabled,
    databaseConfigured: cfg.databaseUrl.length > 0,
    requestTimeoutMs: cfg.requestTimeoutMs,
    autoPlaylistsPlaylistPrefix: cfg.autoPlaylistsPlaylistPrefix,
    autoPlaylistsPlaylistSuffix: cfg.autoPlaylistsPlaylistSuffix,
    autoPlaylistsFrequentSyncIntervalMs: cfg.autoPlaylistsFrequentSyncIntervalMs,
    autoPlaylistsRareSyncIntervalMs: cfg.autoPlaylistsRareSyncIntervalMs,
    autoPlaylistsSyncQueueGapMs: cfg.autoPlaylistsSyncQueueGapMs,
    savedRecentCoverColor: cfg.savedRecentCoverColor,
    savedInYearCoverColor: cfg.savedInYearCoverColor,
    recentFromPlaylistsCoverColor: cfg.recentFromPlaylistsCoverColor,
    savedRecentWindows: cfg.savedRecentWindows.join(","),
    savedInYearYears: cfg.savedInYearYears.join(","),
    autoPlaylistsMergedPlaylists: cfg.autoPlaylistsMergedPlaylists
      .map((merge) => {
        const prefix = merge.order === "saved" ? MERGED_SAVED_ORDER_PREFIX : "";
        return `${prefix}${merge.targetName}=${merge.sourceNames.join("+")}`;
      })
      .join(";"),
    autoPlaylistsRecentFromPlaylists: cfg.autoPlaylistsRecentFromPlaylists
      .map((config) => `${config.sourceName}:${config.windows.join(",")}`)
      .join(";"),
    excludePlaylistTitle: cfg.excludePlaylistTitle,
    spotifyProxyConfigured: cfg.spotifyProxyUrl.length > 0,
    appLocale: cfg.appLocale,
  };
}

export function parseSavedRecentWindows(value: string | undefined): number[] {
  return parseIntegerList(value, {
    min: 1,
    max: 1000,
    emptyMessage: "SAVED_RECENT_WINDOWS must contain at least one window size.",
    invalidMessage: (num) => `Invalid saved recent window "${num}". Allowed range: 1..1000.`,
  });
}

export function parseSavedInYearYears(value: string | undefined): number[] {
  const currentYear = new Date().getUTCFullYear();
  return parseIntegerList(value, {
    min: 2006,
    max: currentYear + 1,
    emptyMessage: "SAVED_IN_YEAR_YEARS must contain at least one year.",
    invalidMessage: (num) => `Invalid saved-in-year value "${num}". Allowed range: 2006..${currentYear + 1}.`,
  });
}

export type MergedPlaylistSortOrder = "added-date" | "saved";

export interface MergedPlaylistConfig {
  targetName: string;
  sourceNames: string[];
  order: MergedPlaylistSortOrder;
}

const MERGED_SAVED_ORDER_PREFIX = "sortBySaved:";

export function stripMergedSavedOrderPrefix(targetName: string): {
  targetName: string;
  order: MergedPlaylistSortOrder;
} {
  if (targetName.startsWith(MERGED_SAVED_ORDER_PREFIX)) {
    return {
      targetName: targetName.slice(MERGED_SAVED_ORDER_PREFIX.length).trim(),
      order: "saved",
    };
  }
  return { targetName, order: "added-date" };
}

export interface PlaylistRecentConfig {
  sourceName: string;
  windows: number[];
}

export function parseMergedPlaylists(value: string | undefined): MergedPlaylistConfig[] {
  if (value === undefined || value.trim().length === 0) {
    return [];
  }

  const result: MergedPlaylistConfig[] = [];
  const seenTargets = new Set<string>();

  for (const rawEntry of value.split(";")) {
    const entry = rawEntry.trim();
    if (entry.length === 0) {
      throw new Error(
        'AUTO_PLAYLISTS_MERGED_PLAYLISTS contains an empty entry. Expected format "Target=Source1+Source2" separated by ";".',
      );
    }

    const separatorIndex = entry.indexOf("=");
    if (separatorIndex < 0) {
      throw new Error(`Invalid merged playlists entry "${entry}". Expected format "Target=Source1+Source2".`);
    }

    const rawTargetName = entry.slice(0, separatorIndex).trim();
    if (rawTargetName.length === 0) {
      throw new Error(`Invalid merged playlists entry "${entry}": target playlist name is empty.`);
    }

    const { targetName, order } = stripMergedSavedOrderPrefix(rawTargetName);
    if (targetName.length === 0) {
      throw new Error(`Invalid merged playlists entry "${entry}": target playlist name is empty.`);
    }

    const sourcesPart = entry.slice(separatorIndex + 1).trim();
    if (sourcesPart.length === 0) {
      throw new Error(`Invalid merged playlists entry "${entry}": at least one source playlist is required.`);
    }

    const sourceNames: string[] = [];
    for (const rawSource of sourcesPart.split("+")) {
      const sourceName = rawSource.trim();
      if (sourceName.length === 0) {
        throw new Error(`Invalid merged playlists entry "${entry}": source playlist name is empty.`);
      }
      if (!sourceNames.includes(sourceName)) {
        sourceNames.push(sourceName);
      }
    }

    if (seenTargets.has(targetName)) {
      throw new Error(`Invalid merged playlists entry "${entry}": duplicate target playlist "${targetName}".`);
    }
    seenTargets.add(targetName);

    result.push({ targetName, sourceNames, order });
  }

  return result;
}

export function parseRecentFromPlaylists(value: string | undefined): PlaylistRecentConfig[] {
  if (value === undefined || value.trim().length === 0) {
    return [];
  }

  const result: PlaylistRecentConfig[] = [];
  const seenSources = new Set<string>();

  for (const rawEntry of value.split(";")) {
    const entry = rawEntry.trim();
    if (entry.length === 0) {
      throw new Error(
        'AUTO_PLAYLISTS_RECENT_FROM_PLAYLISTS contains an empty entry. Expected format "Source:50,100" separated by ";".',
      );
    }

    const separatorIndex = entry.indexOf(":");
    if (separatorIndex < 0) {
      throw new Error(
        `Invalid recent from playlists entry "${entry}". Expected format "Source:50,100".`,
      );
    }

    const sourceName = entry.slice(0, separatorIndex).trim();
    if (sourceName.length === 0) {
      throw new Error(
        `Invalid recent from playlists entry "${entry}": source playlist name is empty.`,
      );
    }

    const windowsPart = entry.slice(separatorIndex + 1).trim();
    if (windowsPart.length === 0) {
      throw new Error(
        `AUTO_PLAYLISTS_RECENT_FROM_PLAYLISTS entry "${sourceName}" must contain at least one window size.`,
      );
    }

    const windows = parseIntegerList(windowsPart, {
      min: 1,
      max: 1000,
      emptyMessage: `AUTO_PLAYLISTS_RECENT_FROM_PLAYLISTS entry "${sourceName}" must contain at least one window size.`,
      invalidMessage: (num) => `Invalid recent from playlists window "${num}". Allowed range: 1..1000.`,
    });

    if (seenSources.has(sourceName)) {
      throw new Error(
        `Invalid recent from playlists entry: duplicate source playlist "${sourceName}".`,
      );
    }
    seenSources.add(sourceName);

    result.push({ sourceName, windows });
  }

  return result;
}

function parseIntegerList(
  value: string | undefined,
  options: {
    min: number;
    max: number;
    emptyMessage: string;
    invalidMessage: (num: number) => string;
  },
): number[] {
  if (value === undefined || value.trim().length === 0) {
    return [];
  }

  const tokens = value
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    throw new Error(options.emptyMessage);
  }

  const parsed = tokens.map((token) => Number(token));
  for (const num of parsed) {
    if (!Number.isInteger(num) || num < options.min || num > options.max) {
      throw new Error(options.invalidMessage(num));
    }
  }

  return Array.from(new Set(parsed)).sort((a, b) => a - b);
}

export function parseHexColor(value: string): string {
  const normalized = value.trim();
  const match = normalized.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!match) {
    throw new Error(`Invalid hex color "${value}". Use #RGB or #RRGGBB.`);
  }

  const rawGroup = match[1];
  if (!rawGroup) {
    throw new Error(`Invalid hex color "${value}". Use #RGB or #RRGGBB.`);
  }

  const raw = rawGroup.toUpperCase();
  if (raw.length === 3) {
    return `#${raw
      .split("")
      .map((char) => `${char}${char}`)
      .join("")}`;
  }

  return `#${raw}`;
}

function parseOptionalHexColor(value: string | undefined, defaultValue: string): string {
  if (value === undefined || value.trim().length === 0) {
    return parseHexColor(defaultValue);
  }

  return parseHexColor(value);
}

export function parsePlaylistSuffix(value: string | undefined): string {
  if (value === undefined) {
    return "[AUTO]";
  }

  const normalized = value.trim();
  return normalized.length === 0 ? "[AUTO]" : normalized;
}

function isMissingEnvValue(value: string | undefined): boolean {
  return value === undefined || value.trim().length === 0;
}

function resolveAppLocale(value: string | undefined): AppConfig["appLocale"] {
  return value === "RU" ? "RU" : "EN";
}

function buildMissingSpotifyCredentialsMessage(
  locale: AppConfig["appLocale"],
  missingKeys: ("SPOTIFY_CLIENT_ID" | "SPOTIFY_CLIENT_SECRET")[],
): string {
  if (locale === "RU") {
    return missingKeys.length === 1
      ? `Не указана обязательная переменная окружения ${missingKeys[0]}.`
      : `Не указаны обязательные переменные окружения ${missingKeys.join(" и ")}.`;
  }

  return missingKeys.length === 1
    ? `Required environment variable ${missingKeys[0]} is not set.`
    : `Required environment variables ${missingKeys.join(" and ")} are not set.`;
}
