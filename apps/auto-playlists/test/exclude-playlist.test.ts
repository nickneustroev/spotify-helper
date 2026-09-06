import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractTrackId, fetchExcludedTrackIds } from "../src/features/exclude-playlist/exclude-playlist.js";
import { initLocale } from "../src/i18n/index.js";
import type { Logger, PlaylistItem } from "../src/shared/types.js";
import type { SpotifyClient } from "../src/spotify/spotify-client.js";

const log: Logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function buildItem(trackUri: string): PlaylistItem {
  return { trackUri, addedAt: null };
}

describe("extractTrackId", () => {
  it("extracts the track id from a spotify track uri", () => {
    expect(extractTrackId("spotify:track:4uLU6hMCjMI75M1A2tKUQC")).toBe(
      "4uLU6hMCjMI75M1A2tKUQC",
    );
  });

  it("returns null for non-track uris", () => {
    expect(extractTrackId("spotify:album:4aawyAB9vmqN3uQ7FjRGTy")).toBeNull();
    expect(extractTrackId("not-a-uri")).toBeNull();
    expect(extractTrackId("")).toBeNull();
  });
});

describe("fetchExcludedTrackIds", () => {
  beforeEach(() => {
    initLocale("EN");
    vi.clearAllMocks();
  });

  it("returns an empty set when the playlist name is empty", async () => {
    const spotifyClient = {
      findPlaylistByName: vi.fn(),
      getPlaylistItems: vi.fn(),
    } as unknown as SpotifyClient;

    const ids = await fetchExcludedTrackIds(spotifyClient, "", log);

    expect(ids.size).toBe(0);
    expect(spotifyClient.findPlaylistByName).not.toHaveBeenCalled();
  });

  it("collects track ids from the playlist", async () => {
    const spotifyClient = {
      findPlaylistByName: vi.fn().mockResolvedValue({ id: "pl-1", name: "Excluded" }),
      getPlaylistItems: vi.fn().mockResolvedValue([
        buildItem("spotify:track:abc123"),
        buildItem("spotify:track:def456"),
        buildItem("spotify:album:aaa"),
      ]),
    } as unknown as SpotifyClient;

    const ids = await fetchExcludedTrackIds(spotifyClient, "Excluded", log);

    expect(ids).toEqual(new Set(["abc123", "def456"]));
  });

  it("returns an empty set with a warning when the playlist is not found", async () => {
    const spotifyClient = {
      findPlaylistByName: vi.fn().mockResolvedValue(null),
      getPlaylistItems: vi.fn(),
    } as unknown as SpotifyClient;

    const ids = await fetchExcludedTrackIds(spotifyClient, "Missing", log);

    expect(ids.size).toBe(0);
    expect(spotifyClient.getPlaylistItems).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(
      'Exclude playlist "Missing" was not found. Track exclusions are skipped until the next sync.',
    );
  });

  it("returns an empty set with a warning when fetching items fails", async () => {
    const spotifyClient = {
      findPlaylistByName: vi.fn().mockResolvedValue({ id: "pl-1", name: "Excluded" }),
      getPlaylistItems: vi.fn().mockRejectedValue(new Error("boom")),
    } as unknown as SpotifyClient;

    const ids = await fetchExcludedTrackIds(spotifyClient, "Excluded", log);

    expect(ids.size).toBe(0);
    expect(log.warn).toHaveBeenCalledWith(
      'Failed to fetch tracks of exclude playlist "Excluded": boom. Track exclusions are skipped until the next sync.',
    );
  });
});
