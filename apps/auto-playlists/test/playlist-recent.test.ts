import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseRecentFromPlaylists } from "../src/core/config.js";
import {
  buildPlaylistRecentName,
  createPlaylistRecentDefinitions,
} from "../src/features/playlist-recent/playlist-recent-definition.js";
import type { PlaylistItem } from "../src/shared/types.js";
import type { Logger } from "../src/shared/types.js";
import type { SpotifyClient } from "../src/spotify/spotify-client.js";
import { initLocale } from "../src/i18n/index.js";

const log: Logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function buildItem(trackUri: string, addedAt: string | null): PlaylistItem {
  return {
    trackUri,
    addedAt: addedAt ? new Date(addedAt) : null,
  };
}

describe("parseRecentFromPlaylists", () => {
  it("returns empty list when the variable is missing or empty", () => {
    expect(parseRecentFromPlaylists(undefined)).toEqual([]);
    expect(parseRecentFromPlaylists("")).toEqual([]);
    expect(parseRecentFromPlaylists("   ")).toEqual([]);
  });

  it("parses a single entry with one window and trims the name", () => {
    expect(parseRecentFromPlaylists(" Hard Rock : 50 ")).toEqual([
      { sourceName: "Hard Rock", windows: [50] },
    ]);
  });

  it("parses several windows per source and several sources", () => {
    expect(parseRecentFromPlaylists("Hard Rock:100,50;Gym:30")).toEqual([
      { sourceName: "Hard Rock", windows: [50, 100] },
      { sourceName: "Gym", windows: [30] },
    ]);
  });

  it("deduplicates windows", () => {
    expect(parseRecentFromPlaylists("Rock:50,50,100")).toEqual([
      { sourceName: "Rock", windows: [50, 100] },
    ]);
  });

  it("keeps equals signs inside the source name", () => {
    expect(parseRecentFromPlaylists("Weird=name:50")).toEqual([
      { sourceName: "Weird=name", windows: [50] },
    ]);
  });

  it("throws when an entry has no colon", () => {
    expect(() => parseRecentFromPlaylists("Hard Rock 50")).toThrow(/Expected format/);
  });

  it("throws when an entry is empty", () => {
    expect(() => parseRecentFromPlaylists("Rock:50;;Gym:30")).toThrow(/empty entry/);
  });

  it("throws when the source name is empty", () => {
    expect(() => parseRecentFromPlaylists(":50")).toThrow(/source playlist name is empty/);
  });

  it("throws when there are no windows", () => {
    expect(() => parseRecentFromPlaylists("Rock:")).toThrow(
      /must contain at least one window size/,
    );
  });

  it("throws on invalid window values", () => {
    expect(() => parseRecentFromPlaylists("Rock:abc")).toThrow(/Invalid recent from playlists window/);
    expect(() => parseRecentFromPlaylists("Rock:0")).toThrow(/Invalid recent from playlists window/);
    expect(() => parseRecentFromPlaylists("Rock:1001")).toThrow(/Invalid recent from playlists window/);
  });

  it("throws on duplicate sources", () => {
    expect(() => parseRecentFromPlaylists("Rock:50;Rock:100")).toThrow(/duplicate source playlist/);
  });
});

describe("createPlaylistRecentDefinitions", () => {
  beforeEach(() => {
    initLocale("EN");
    vi.clearAllMocks();
  });

  it("creates one definition per source window with automatic name and encoded key", () => {
    const definitions = createPlaylistRecentDefinitions({
      configs: [{ sourceName: "Hard Rock", windows: [50, 100] }],
      playlistPrefix: "",
      playlistSuffix: "[AUTO]",
      coverColor: "14532D",
      logger: log,
    });

    expect(definitions).toHaveLength(2);
    expect(definitions[0].playlistName).toBe("Hard Rock 50 [AUTO]");
    expect(definitions[1].playlistName).toBe("Hard Rock 100 [AUTO]");
    expect(definitions[0].key).toBe(`playlist-recent:${encodeURIComponent("Hard Rock")}:50`);
    expect(definitions[1].key).toBe(`playlist-recent:${encodeURIComponent("Hard Rock")}:100`);
    expect(definitions[0].playlistDescription).toBe(
      'Auto-maintained top 50 tracks from playlist "Hard Rock".',
    );
  });

  it("builds the name with both prefix and suffix", () => {
    expect(buildPlaylistRecentName("MU", "Rock", 50, "[AUTO]")).toBe("MU Rock 50 [AUTO]");
  });

  it("returns the first tracks in playlist order limited to the window", async () => {
    const spotifyClient = {
      findPlaylistByName: vi.fn().mockResolvedValue({ id: "playlist-rock", name: "Hard Rock" }),
      getPlaylistItems: vi.fn().mockResolvedValue([
        buildItem("spotify:track:first", "2025-01-01T00:00:00Z"),
        buildItem("spotify:track:second", "2026-03-01T00:00:00Z"),
        buildItem("spotify:track:third", "2026-02-01T00:00:00Z"),
        buildItem("spotify:track:fourth", "2026-01-01T00:00:00Z"),
      ]),
    } as unknown as SpotifyClient;

    const definitions = createPlaylistRecentDefinitions({
      configs: [{ sourceName: "Hard Rock", windows: [3] }],
      playlistPrefix: "",
      playlistSuffix: "[AUTO]",
      coverColor: "14532D",
      logger: log,
    });

    const uris = await definitions[0].resolveTrackUrisAsync?.(spotifyClient);

    expect(uris).toEqual([
      "spotify:track:first",
      "spotify:track:second",
      "spotify:track:third",
    ]);
    expect(spotifyClient.findPlaylistByName).toHaveBeenCalledWith("Hard Rock");
    expect(spotifyClient.getPlaylistItems).toHaveBeenCalledWith("playlist-rock");
  });

  it("deduplicates tracks while filling the window", async () => {
    const spotifyClient = {
      findPlaylistByName: vi.fn().mockResolvedValue({ id: "playlist-rock", name: "Hard Rock" }),
      getPlaylistItems: vi.fn().mockResolvedValue([
        buildItem("spotify:track:a", "2026-01-01T00:00:00Z"),
        buildItem("spotify:track:b", "2026-02-01T00:00:00Z"),
        buildItem("spotify:track:a", "2026-03-01T00:00:00Z"),
        buildItem("spotify:track:c", "2025-06-01T00:00:00Z"),
      ]),
    } as unknown as SpotifyClient;

    const definitions = createPlaylistRecentDefinitions({
      configs: [{ sourceName: "Hard Rock", windows: [3] }],
      playlistPrefix: "",
      playlistSuffix: "[AUTO]",
      coverColor: "14532D",
      logger: log,
    });

    const uris = await definitions[0].resolveTrackUrisAsync?.(spotifyClient);

    expect(uris).toEqual(["spotify:track:a", "spotify:track:b", "spotify:track:c"]);
  });

  it("returns all tracks when the window is larger than the playlist", async () => {
    const spotifyClient = {
      findPlaylistByName: vi.fn().mockResolvedValue({ id: "playlist-rock", name: "Hard Rock" }),
      getPlaylistItems: vi
        .fn()
        .mockResolvedValue([buildItem("spotify:track:a", "2026-02-01T00:00:00Z")]),
    } as unknown as SpotifyClient;

    const definitions = createPlaylistRecentDefinitions({
      configs: [{ sourceName: "Hard Rock", windows: [50] }],
      playlistPrefix: "",
      playlistSuffix: "[AUTO]",
      coverColor: "14532D",
      logger: log,
    });

    const uris = await definitions[0].resolveTrackUrisAsync?.(spotifyClient);

    expect(uris).toEqual(["spotify:track:a"]);
  });

  it("returns an empty list with a warning when the source playlist is not found", async () => {
    const spotifyClient = {
      findPlaylistByName: vi.fn().mockResolvedValue(null),
      getPlaylistItems: vi.fn(),
    } as unknown as SpotifyClient;

    const definitions = createPlaylistRecentDefinitions({
      configs: [{ sourceName: "Missing", windows: [50] }],
      playlistPrefix: "",
      playlistSuffix: "[AUTO]",
      coverColor: "14532D",
      logger: log,
    });

    const uris = await definitions[0].resolveTrackUrisAsync?.(spotifyClient);

    expect(uris).toEqual([]);
    expect(spotifyClient.getPlaylistItems).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(
      'Source playlist "Missing" was not found. Related auto playlists will be skipped until the next sync.',
    );
  });
});
