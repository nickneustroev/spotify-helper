import { describe, expect, it, vi } from "vitest";
import { readFreshSavedTracksSnapshot } from "../src/features/playlist-definitions/auto-playlists-sync-service.js";
import type { AppStateRepository } from "../src/persistence/types.js";

function buildAppState(values: Record<string, string>): AppStateRepository {
  return {
    getValue: vi.fn(async (key: string) => values[key] ?? null),
  } as unknown as AppStateRepository;
}

const SNAPSHOT_KEY = "auto_playlists:saved_tracks_snapshot";
const UPDATED_AT_KEY = "auto_playlists:saved_tracks_snapshot:updated_at";

const snapshotPayload = JSON.stringify([
  {
    trackId: "b1",
    trackUri: "spotify:track:b1",
    trackName: "B",
    artistName: "Artist",
    addedAtIso: "2026-05-01T00:00:00.000Z",
  },
  {
    trackId: "a1",
    trackUri: "spotify:track:a1",
    trackName: "A",
    artistName: "Artist",
    addedAtIso: "2026-04-01T00:00:00.000Z",
  },
]);

describe("readFreshSavedTracksSnapshot", () => {
  it("returns tracks sorted by added date desc when the snapshot is fresh", async () => {
    const appState = buildAppState({
      [SNAPSHOT_KEY]: snapshotPayload,
      [UPDATED_AT_KEY]: new Date(Date.now() - 60_000).toISOString(),
    });

    const tracks = await readFreshSavedTracksSnapshot(appState, 3_600_000);

    expect(tracks?.map((track) => track.trackId)).toEqual(["b1", "a1"]);
  });

  it("returns null when the snapshot is older than max age", async () => {
    const appState = buildAppState({
      [SNAPSHOT_KEY]: snapshotPayload,
      [UPDATED_AT_KEY]: new Date(Date.now() - 7_200_000).toISOString(),
    });

    expect(await readFreshSavedTracksSnapshot(appState, 3_600_000)).toBeNull();
  });

  it("returns null when the updated-at key is missing", async () => {
    const appState = buildAppState({ [SNAPSHOT_KEY]: snapshotPayload });

    expect(await readFreshSavedTracksSnapshot(appState, 3_600_000)).toBeNull();
  });

  it("returns null when the snapshot payload is invalid json", async () => {
    const appState = buildAppState({
      [SNAPSHOT_KEY]: "{not json",
      [UPDATED_AT_KEY]: new Date().toISOString(),
    });

    expect(await readFreshSavedTracksSnapshot(appState, 3_600_000)).toBeNull();
  });

  it("returns null when the snapshot has no valid tracks", async () => {
    const appState = buildAppState({
      [SNAPSHOT_KEY]: "[]",
      [UPDATED_AT_KEY]: new Date().toISOString(),
    });

    expect(await readFreshSavedTracksSnapshot(appState, 3_600_000)).toBeNull();
  });
});
