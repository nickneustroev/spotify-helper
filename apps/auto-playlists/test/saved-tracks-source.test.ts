import { describe, expect, it, vi } from "vitest";
import {
  filterSavedTracks,
  SavedTracksSource,
} from "../src/features/playlist-definitions/saved-tracks-source.js";
import type { SavedTrackItem } from "../src/shared/types.js";
import type { SpotifyClient } from "../src/spotify/spotify-client.js";

function buildSavedTrack(trackId: string, addedAt: string): SavedTrackItem {
  return {
    trackId,
    trackUri: `spotify:track:${trackId}`,
    trackName: trackId,
    artistName: "Artist",
    addedAt: new Date(addedAt),
  };
}

describe("SavedTracksSource", () => {
  it("loads all tracks from Spotify across pages", async () => {
    const getSavedTracksPage = vi
      .fn()
      .mockResolvedValueOnce({
        tracks: [
          buildSavedTrack("a", "2024-05-01T10:00:00.000Z"),
          buildSavedTrack("b", "2024-04-01T10:00:00.000Z"),
        ],
        total: 3,
      })
      .mockResolvedValueOnce({
        tracks: [buildSavedTrack("c", "2024-03-01T10:00:00.000Z")],
        total: 3,
      })
      .mockResolvedValueOnce({
        tracks: [
          buildSavedTrack("a", "2024-05-01T10:00:00.000Z"),
          buildSavedTrack("b", "2024-04-01T10:00:00.000Z"),
        ],
        total: 3,
      });

    const source = new SavedTracksSource({ getSavedTracksPage } as unknown as SpotifyClient, 2);
    const tracks = await source.getAllSavedTracks();

    expect(getSavedTracksPage).toHaveBeenCalledTimes(3);
    expect(tracks.map((track) => track.trackId)).toEqual(["a", "b", "c"]);
  });

  it("retries the full scan when saved tracks shift during offset pagination", async () => {
    const getSavedTracksPage = vi
      .fn()
      .mockResolvedValueOnce({
        tracks: [
          buildSavedTrack("a", "2024-05-01T10:00:00.000Z"),
          buildSavedTrack("b", "2024-04-01T10:00:00.000Z"),
        ],
        total: 4,
      })
      .mockResolvedValueOnce({
        tracks: [
          buildSavedTrack("b", "2024-04-01T10:00:00.000Z"),
          buildSavedTrack("c", "2024-03-01T10:00:00.000Z"),
        ],
        total: 4,
      })
      .mockResolvedValueOnce({
        tracks: [
          buildSavedTrack("x", "2024-06-01T10:00:00.000Z"),
          buildSavedTrack("a", "2024-05-01T10:00:00.000Z"),
        ],
        total: 5,
      })
      .mockResolvedValueOnce({
        tracks: [
          buildSavedTrack("x", "2024-06-01T10:00:00.000Z"),
          buildSavedTrack("a", "2024-05-01T10:00:00.000Z"),
        ],
        total: 5,
      })
      .mockResolvedValueOnce({
        tracks: [
          buildSavedTrack("b", "2024-04-01T10:00:00.000Z"),
          buildSavedTrack("c", "2024-03-01T10:00:00.000Z"),
        ],
        total: 5,
      })
      .mockResolvedValueOnce({
        tracks: [buildSavedTrack("d", "2024-02-01T10:00:00.000Z")],
        total: 5,
      })
      .mockResolvedValueOnce({
        tracks: [
          buildSavedTrack("x", "2024-06-01T10:00:00.000Z"),
          buildSavedTrack("a", "2024-05-01T10:00:00.000Z"),
        ],
        total: 5,
      });

    const source = new SavedTracksSource({ getSavedTracksPage } as unknown as SpotifyClient, 2, 3);
    const tracks = await source.getAllSavedTracks();

    expect(tracks.map((track) => track.trackId)).toEqual(["x", "a", "b", "c", "d"]);
    expect(getSavedTracksPage).toHaveBeenCalledTimes(7);
  });

  it("loads only the required recent pages for partial sync", async () => {
    const getSavedTracksPage = vi
      .fn()
      .mockResolvedValueOnce({
        tracks: [
          buildSavedTrack("a", "2024-05-01T10:00:00.000Z"),
          buildSavedTrack("b", "2024-04-01T10:00:00.000Z"),
        ],
        total: 5,
      })
      .mockResolvedValueOnce({
        tracks: [
          buildSavedTrack("c", "2024-03-01T10:00:00.000Z"),
          buildSavedTrack("d", "2024-02-01T10:00:00.000Z"),
        ],
        total: 5,
      });

    const source = new SavedTracksSource({ getSavedTracksPage } as unknown as SpotifyClient, 2);
    const tracks = await source.getSavedTracks({ maxRecentTracks: 4 });

    expect(tracks.map((track) => track.trackId)).toEqual(["a", "b", "c", "d"]);
    expect(getSavedTracksPage).toHaveBeenCalledTimes(2);
    expect(getSavedTracksPage).toHaveBeenNthCalledWith(1, 2, 0);
    expect(getSavedTracksPage).toHaveBeenNthCalledWith(2, 2, 2);
  });

  it("stops scanning saved tracks after reaching tracks older than the minimum year", async () => {
    const getSavedTracksPage = vi
      .fn()
      .mockResolvedValueOnce({
        tracks: [
          buildSavedTrack("a", "2024-05-01T10:00:00.000Z"),
          buildSavedTrack("b", "2023-04-01T10:00:00.000Z"),
        ],
        total: 6,
      })
      .mockResolvedValueOnce({
        tracks: [
          buildSavedTrack("c", "2023-03-01T10:00:00.000Z"),
          buildSavedTrack("d", "2022-12-01T10:00:00.000Z"),
        ],
        total: 6,
      });

    const source = new SavedTracksSource({ getSavedTracksPage } as unknown as SpotifyClient, 2);
    const tracks = await source.getSavedTracks({ minSavedYear: 2023 });

    expect(tracks.map((track) => track.trackId)).toEqual(["a", "b", "c"]);
    expect(getSavedTracksPage).toHaveBeenCalledTimes(2);
    expect(getSavedTracksPage).toHaveBeenNthCalledWith(1, 2, 0);
    expect(getSavedTracksPage).toHaveBeenNthCalledWith(2, 2, 2);
  });
});

describe("filterSavedTracks", () => {
  const tracks = [
    buildSavedTrack("a", "2024-07-01T10:00:00.000Z"),
    buildSavedTrack("b", "2024-06-01T10:00:00.000Z"),
    buildSavedTrack("c", "2023-03-01T10:00:00.000Z"),
    buildSavedTrack("d", "2022-12-01T10:00:00.000Z"),
  ];

  it("returns most recent tracks when only recent requirement is present", () => {
    expect(filterSavedTracks(tracks, { maxRecentTracks: 2 }).map((track) => track.trackId)).toEqual(["a", "b"]);
  });

  it("filters by minimum year when only yearly requirement is present", () => {
    expect(filterSavedTracks(tracks, { minSavedYear: 2023 }).map((track) => track.trackId)).toEqual(["a", "b", "c"]);
  });

  it("unions recent and yearly filters when both are provided", () => {
    expect(filterSavedTracks(tracks, { maxRecentTracks: 2, minSavedYear: 2023 }).map((track) => track.trackId)).toEqual(["a", "b", "c"]);
  });

  it("returns all tracks when no requirements are provided", () => {
    expect(filterSavedTracks(tracks).map((track) => track.trackId)).toEqual(["a", "b", "c", "d"]);
  });
});
