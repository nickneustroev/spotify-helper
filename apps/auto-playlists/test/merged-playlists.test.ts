import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseMergedPlaylists } from "../src/core/config.js";
import {
  buildMergedPlaylistName,
  createMergedPlaylistDefinitions,
  mergePlaylistItems,
} from "../src/features/merged-playlists/merged-playlists-definition.js";
import type { PlaylistItem } from "../src/shared/types.js";
import type { SpotifyClient } from "../src/spotify/spotify-client.js";
import type { Logger } from "../src/shared/types.js";
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

describe("parseMergedPlaylists", () => {
  it("returns empty list when the variable is missing or empty", () => {
    expect(parseMergedPlaylists(undefined)).toEqual([]);
    expect(parseMergedPlaylists("")).toEqual([]);
    expect(parseMergedPlaylists("   ")).toEqual([]);
  });

  it("parses a single entry and trims names", () => {
    expect(parseMergedPlaylists(" Мой Мегамикс = RECENT 50 [AUTO] + 2024 [AUTO] ")).toEqual([
      {
        targetName: "Мой Мегамикс",
        sourceNames: ["RECENT 50 [AUTO]", "2024 [AUTO]"],
      },
    ]);
  });

  it("parses several entries separated by semicolons", () => {
    expect(parseMergedPlaylists("Mix=A+B;Gym=C")).toEqual([
      { targetName: "Mix", sourceNames: ["A", "B"] },
      { targetName: "Gym", sourceNames: ["C"] },
    ]);
  });

  it("keeps only the first occurrence of a duplicated source", () => {
    expect(parseMergedPlaylists("Mix=A+B+A")).toEqual([
      { targetName: "Mix", sourceNames: ["A", "B"] },
    ]);
  });

  it("splits target from sources only at the first equals sign", () => {
    expect(parseMergedPlaylists("Weird=name with = sign")).toEqual([
      { targetName: "Weird", sourceNames: ["name with = sign"] },
    ]);
  });

  it("throws when an entry has no equals sign", () => {
    expect(() => parseMergedPlaylists("Mix A+B")).toThrow(/Expected format/);
  });

  it("throws when an entry is empty", () => {
    expect(() => parseMergedPlaylists("Mix=A;;Gym=C")).toThrow(/empty entry/);
  });

  it("throws when the target name is empty", () => {
    expect(() => parseMergedPlaylists("=A+B")).toThrow(/target playlist name is empty/);
  });

  it("throws when there are no sources", () => {
    expect(() => parseMergedPlaylists("Mix=")).toThrow(/at least one source playlist is required/);
  });

  it("throws when a source name is empty", () => {
    expect(() => parseMergedPlaylists("Mix=A++B")).toThrow(/source playlist name is empty/);
  });

  it("throws on duplicate targets", () => {
    expect(() => parseMergedPlaylists("Mix=A;Mix=B")).toThrow(/duplicate target playlist/);
  });
});

describe("mergePlaylistItems", () => {
  it("sorts by added date descending and deduplicates by uri", () => {
    const uris = mergePlaylistItems([
      buildItem("spotify:track:a", "2026-01-01T00:00:00Z"),
      buildItem("spotify:track:b", "2026-03-01T00:00:00Z"),
      buildItem("spotify:track:a", "2026-02-01T00:00:00Z"),
    ]);

    expect(uris).toEqual(["spotify:track:b", "spotify:track:a"]);
  });

  it("keeps items with unknown added date at the end", () => {
    const uris = mergePlaylistItems([
      buildItem("spotify:track:no-date", null),
      buildItem("spotify:track:b", "2026-03-01T00:00:00Z"),
      buildItem("spotify:track:a", "2025-01-01T00:00:00Z"),
    ]);

    expect(uris).toEqual(["spotify:track:b", "spotify:track:a", "spotify:track:no-date"]);
  });

  it("keeps source order for items with equal added dates", () => {
    const addedAt = "2026-03-01T00:00:00Z";
    const uris = mergePlaylistItems([
      buildItem("spotify:track:first", addedAt),
      buildItem("spotify:track:second", addedAt),
    ]);

    expect(uris).toEqual(["spotify:track:first", "spotify:track:second"]);
  });
});

describe("createMergedPlaylistDefinitions", () => {
  beforeEach(() => {
    initLocale("EN");
    vi.clearAllMocks();
  });

  it("applies prefix and suffix to the target playlist name and encodes the key", () => {
    const definitions = createMergedPlaylistDefinitions({
      merges: [{ targetName: "Мой Мегамикс", sourceNames: ["A"] }],
      playlistPrefix: "",
      playlistSuffix: "[AUTO]",
      logger: log,
    });

    expect(definitions).toHaveLength(1);
    expect(definitions[0].playlistName).toBe("Мой Мегамикс [AUTO]");
    expect(definitions[0].key).toBe(`merged:${encodeURIComponent("Мой Мегамикс")}`);
  });

  it("builds the name with both prefix and suffix", () => {
    expect(buildMergedPlaylistName("MU", "[AUTO]", "Mix")).toBe("MU Mix [AUTO]");
  });

  it("merges track uris from all found source playlists", async () => {
    const spotifyClient = {
      findPlaylistByName: vi
        .fn()
        .mockResolvedValueOnce({ id: "playlist-a", name: "A" })
        .mockResolvedValueOnce({ id: "playlist-b", name: "B" }),
      getPlaylistItems: vi
        .fn()
        .mockResolvedValueOnce([buildItem("spotify:track:a1", "2026-02-01T00:00:00Z")])
        .mockResolvedValueOnce([
          buildItem("spotify:track:b1", "2026-03-01T00:00:00Z"),
          buildItem("spotify:track:a1", "2026-01-01T00:00:00Z"),
        ]),
    } as unknown as SpotifyClient;

    const definitions = createMergedPlaylistDefinitions({
      merges: [{ targetName: "Mix", sourceNames: ["A", "B"] }],
      playlistPrefix: "",
      playlistSuffix: "[AUTO]",
      logger: log,
    });

    const uris = await definitions[0].resolveTrackUrisAsync?.(spotifyClient);

    expect(uris).toEqual(["spotify:track:b1", "spotify:track:a1"]);
    expect(spotifyClient.findPlaylistByName).toHaveBeenNthCalledWith(1, "A");
    expect(spotifyClient.findPlaylistByName).toHaveBeenNthCalledWith(2, "B");
  });

  it("skips a missing source playlist with a warning and keeps the rest", async () => {
    const spotifyClient = {
      findPlaylistByName: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: "playlist-b", name: "B" }),
      getPlaylistItems: vi
        .fn()
        .mockResolvedValue([buildItem("spotify:track:b1", "2026-03-01T00:00:00Z")]),
    } as unknown as SpotifyClient;

    const definitions = createMergedPlaylistDefinitions({
      merges: [{ targetName: "Mix", sourceNames: ["Missing", "B"] }],
      playlistPrefix: "",
      playlistSuffix: "[AUTO]",
      logger: log,
    });

    const uris = await definitions[0].resolveTrackUrisAsync?.(spotifyClient);

    expect(uris).toEqual(["spotify:track:b1"]);
    expect(log.warn).toHaveBeenCalledWith(
      'Source playlist "Missing" for merged playlist "Mix" was not found. It will be skipped until the next sync.',
    );
  });

  it("returns an empty list when none of the sources is found", async () => {
    const spotifyClient = {
      findPlaylistByName: vi.fn().mockResolvedValue(null),
      getPlaylistItems: vi.fn(),
    } as unknown as SpotifyClient;

    const definitions = createMergedPlaylistDefinitions({
      merges: [{ targetName: "Mix", sourceNames: ["Missing"] }],
      playlistPrefix: "",
      playlistSuffix: "[AUTO]",
      logger: log,
    });

    const uris = await definitions[0].resolveTrackUrisAsync?.(spotifyClient);

    expect(uris).toEqual([]);
    expect(spotifyClient.getPlaylistItems).not.toHaveBeenCalled();
  });

  it("skips a source whose tracks cannot be fetched and keeps the rest", async () => {
    const spotifyClient = {
      findPlaylistByName: vi
        .fn()
        .mockResolvedValueOnce({ id: "playlist-a", name: "A" })
        .mockResolvedValueOnce({ id: "playlist-b", name: "B" }),
      getPlaylistItems: vi
        .fn()
        .mockRejectedValueOnce(new Error("Spotify API error during GET /tracks (403): Forbidden"))
        .mockResolvedValueOnce([buildItem("spotify:track:b1", "2026-03-01T00:00:00Z")]),
    } as unknown as SpotifyClient;

    const definitions = createMergedPlaylistDefinitions({
      merges: [{ targetName: "Mix", sourceNames: ["A", "B"] }],
      playlistPrefix: "",
      playlistSuffix: "[AUTO]",
      logger: log,
    });

    const uris = await definitions[0].resolveTrackUrisAsync?.(spotifyClient);

    expect(uris).toEqual(["spotify:track:b1"]);
    expect(log.warn).toHaveBeenCalledWith(
      'Failed to fetch tracks of source playlist "A" for merged playlist "Mix": Spotify API error during GET /tracks (403): Forbidden. The source will be skipped until the next sync.',
    );
  });

  it("returns an empty list when every source fails to be fetched", async () => {
    const spotifyClient = {
      findPlaylistByName: vi.fn().mockResolvedValue({ id: "playlist-a", name: "A" }),
      getPlaylistItems: vi.fn().mockRejectedValue(new Error("403 Forbidden")),
    } as unknown as SpotifyClient;

    const definitions = createMergedPlaylistDefinitions({
      merges: [{ targetName: "Mix", sourceNames: ["A"] }],
      playlistPrefix: "",
      playlistSuffix: "[AUTO]",
      logger: log,
    });

    const uris = await definitions[0].resolveTrackUrisAsync?.(spotifyClient);

    expect(uris).toEqual([]);
  });
});
