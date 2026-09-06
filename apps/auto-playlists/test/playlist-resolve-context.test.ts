import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPlaylistResolveContext } from "../src/features/playlist-definitions/playlist-resolve-context.js";
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

describe("createPlaylistResolveContext", () => {
  beforeEach(() => {
    initLocale("EN");
    vi.clearAllMocks();
  });

  it("caches playlist lookups by name", async () => {
    const spotifyClient = {
      findPlaylistByName: vi.fn().mockResolvedValue({ id: "playlist-1", name: "Rock" }),
      getPlaylistItems: vi.fn(),
    } as unknown as SpotifyClient;
    const context = createPlaylistResolveContext(spotifyClient, log);

    const first = await context.findPlaylistByName("Rock");
    const second = await context.findPlaylistByName("Rock");

    expect(first).toEqual({ id: "playlist-1", name: "Rock" });
    expect(second).toEqual(first);
    expect(spotifyClient.findPlaylistByName).toHaveBeenCalledTimes(1);
  });

  it("caches playlist items per playlist and max items", async () => {
    const spotifyClient = {
      findPlaylistByName: vi.fn(),
      getPlaylistItems: vi.fn().mockResolvedValue([buildItem("spotify:track:a")]),
    } as unknown as SpotifyClient;
    const context = createPlaylistResolveContext(spotifyClient, log);

    await context.getPlaylistItems("playlist-1", 10);
    await context.getPlaylistItems("playlist-1", 10);
    await context.getPlaylistItems("playlist-1", 20);
    await context.getPlaylistItems("playlist-2");

    expect(spotifyClient.getPlaylistItems).toHaveBeenCalledTimes(3);
    expect(spotifyClient.getPlaylistItems).toHaveBeenNthCalledWith(1, "playlist-1", 10);
    expect(spotifyClient.getPlaylistItems).toHaveBeenNthCalledWith(3, "playlist-2", undefined);
  });

  it("returns an empty exclude set without any client calls when the name is empty", async () => {
    const spotifyClient = {
      findPlaylistByName: vi.fn(),
      getPlaylistItems: vi.fn(),
    } as unknown as SpotifyClient;
    const context = createPlaylistResolveContext(spotifyClient, log);

    const ids = await context.getExcludedTrackIds("  ");

    expect(ids.size).toBe(0);
    expect(spotifyClient.findPlaylistByName).not.toHaveBeenCalled();
  });

  it("collects track ids from the exclude playlist and caches them", async () => {
    const spotifyClient = {
      findPlaylistByName: vi.fn().mockResolvedValue({ id: "playlist-exclude", name: "Excluded" }),
      getPlaylistItems: vi.fn().mockResolvedValue([
        buildItem("spotify:track:abc"),
        buildItem("spotify:track:def"),
        buildItem("spotify:album:xyz"),
      ]),
    } as unknown as SpotifyClient;
    const context = createPlaylistResolveContext(spotifyClient, log);

    const first = await context.getExcludedTrackIds("Excluded");
    const second = await context.getExcludedTrackIds("Excluded");

    expect(first).toEqual(new Set(["abc", "def"]));
    expect(second).toEqual(first);
    expect(spotifyClient.findPlaylistByName).toHaveBeenCalledTimes(1);
    expect(spotifyClient.getPlaylistItems).toHaveBeenCalledTimes(1);
  });

  it("warns and returns an empty set when the exclude playlist is missing", async () => {
    const spotifyClient = {
      findPlaylistByName: vi.fn().mockResolvedValue(null),
      getPlaylistItems: vi.fn(),
    } as unknown as SpotifyClient;
    const context = createPlaylistResolveContext(spotifyClient, log);

    const ids = await context.getExcludedTrackIds("Missing");

    expect(ids.size).toBe(0);
    expect(log.warn).toHaveBeenCalledWith(
      'Exclude playlist "Missing" was not found. Track exclusions are skipped until the next sync.',
    );
  });

  it("retries the lookup after a failed attempt instead of caching the error", async () => {
    const spotifyClient = {
      findPlaylistByName: vi
        .fn()
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValueOnce({ id: "playlist-exclude", name: "Excluded" }),
      getPlaylistItems: vi.fn().mockResolvedValue([buildItem("spotify:track:abc")]),
    } as unknown as SpotifyClient;
    const context = createPlaylistResolveContext(spotifyClient, log);

    const first = await context.getExcludedTrackIds("Excluded");
    const second = await context.getExcludedTrackIds("Excluded");

    expect(first.size).toBe(0);
    expect(second).toEqual(new Set(["abc"]));
    expect(spotifyClient.findPlaylistByName).toHaveBeenCalledTimes(2);
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to look up exclude playlist "Excluded": boom.'),
    );
  });
});
