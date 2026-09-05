import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AutoPlaylistsSyncService,
  hashTrackUris,
} from "../src/features/playlist-definitions/auto-playlists-sync-service.js";
import type { AutoPlaylistDefinition } from "../src/features/playlist-definitions/auto-playlist-definition.js";
import type { SavedTracksSource } from "../src/features/playlist-definitions/saved-tracks-source.js";
import type { AppStateRepository, ArchiveRepository } from "../src/persistence/types.js";
import type { Logger, SavedTrackItem } from "../src/shared/types.js";
import type { SpotifyClient } from "../src/spotify/spotify-client.js";
import { SpotifyRateLimitError } from "../src/shared/errors.js";
import { initLocale } from "../src/i18n/index.js";

const log: Logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const archiveRepository: ArchiveRepository = {
  upsertArchivedTrack: vi.fn(),
  getArchivedTrack: vi.fn().mockResolvedValue(null),
  getAllArchivedTracks: vi.fn(),
  getAllArchivedTrackIds: vi.fn(),
  getArchivedTrackCount: vi.fn(),
  close: vi.fn(),
};

const appStateRepository: AppStateRepository = {
  getValue: vi.fn().mockResolvedValue(null),
  setValue: vi.fn().mockResolvedValue(undefined),
  deleteValue: vi.fn(),
  close: vi.fn(),
};

function buildSavedTrack(trackId: string): SavedTrackItem {
  return {
    trackId,
    trackUri: `spotify:track:${trackId}`,
    trackName: trackId,
    artistName: "Artist",
    addedAt: new Date(`2026-03-28T00:00:0${trackId.length}.000Z`),
  };
}

describe("AutoPlaylistsSyncService", () => {
  beforeEach(() => {
    initLocale("EN");
    vi.clearAllMocks();
  });

  it("skips replace calls when playlist content did not change", async () => {
    const getCurrentUserId = vi.fn().mockResolvedValue("user-1");
    const findPlaylistByName = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const createPlaylist = vi
      .fn()
      .mockResolvedValueOnce({ id: "p2", name: "LIKED RECENT 2 [AUTO]" })
      .mockResolvedValueOnce({ id: "p3", name: "LIKED RECENT 3 [AUTO]" });
    const replacePlaylistItems = vi.fn().mockResolvedValue(undefined);
    const uploadPlaylistCoverImage = vi.fn().mockResolvedValue(undefined);

    const spotifyClient = {
      getCurrentUserId,
      hasPlaylistInLibrary: vi.fn().mockRejectedValue(new Error("unexpected hasPlaylistInLibrary call")),
      getPlaylist: vi.fn().mockRejectedValue(new Error("unexpected getPlaylist call")),
      findPlaylistByName,
      createPlaylist,
      replacePlaylistItems,
      uploadPlaylistCoverImage,
    } as unknown as SpotifyClient;

    const savedTracksSource = {
      getSavedTracks: vi
        .fn()
        .mockResolvedValueOnce([buildSavedTrack("a"), buildSavedTrack("bb"), buildSavedTrack("ccc")])
        .mockResolvedValueOnce([buildSavedTrack("a"), buildSavedTrack("bb"), buildSavedTrack("ccc")]),
    } as unknown as SavedTracksSource;

    const definitions: AutoPlaylistDefinition[] = [
      {
        key: "saved-recent:2",
        playlistName: "SAVED RECENT 2 [AUTO]",
        playlistDescription: "Auto-maintained recent saved tracks (2).",
        resolveTrackUris: (savedTracks) => savedTracks.slice(0, 2).map((track) => track.trackUri),
        buildCoverJpeg: async () => Buffer.from("cover-2"),
      },
      {
        key: "saved-recent:3",
        playlistName: "SAVED RECENT 3 [AUTO]",
        playlistDescription: "Auto-maintained recent saved tracks (3).",
        resolveTrackUris: (savedTracks) => savedTracks.slice(0, 3).map((track) => track.trackUri),
        buildCoverJpeg: async () => Buffer.from("cover-3"),
      },
    ];

    const service = new AutoPlaylistsSyncService(
      spotifyClient,
      savedTracksSource,
      archiveRepository,
      appStateRepository,
      log,
      {
        definitions,
        syncIntervalMs: 15000,
        playlistPrivate: true,
        syncModeName: "frequent",
      },
    );

    service.start();
    await vi.waitFor(() => {
      expect(replacePlaylistItems).toHaveBeenCalledTimes(2);
    });
    await service.syncNow();
    service.stop();

    expect(replacePlaylistItems).toHaveBeenCalledTimes(2);
    expect(uploadPlaylistCoverImage).toHaveBeenCalledTimes(2);
    expect(appStateRepository.setValue).toHaveBeenCalledTimes(2);
    expect(log.info).toHaveBeenCalledWith("Started updating playlists for frequent.");
    expect(log.info).toHaveBeenCalledWith('Playlist "SAVED RECENT 2 [AUTO]" does not require an update.');
    expect(log.info).toHaveBeenCalledWith('Playlist "SAVED RECENT 3 [AUTO]" does not require an update.');
    expect(log.info).toHaveBeenCalledWith("Updated playlists for frequent (updated=0/2).");
  });

  it("archives removed tracks from previous snapshot", async () => {
    const spotifyClient = {
      getCurrentUserId: vi.fn().mockResolvedValue("user-1"),
      hasPlaylistInLibrary: vi.fn().mockResolvedValue(true),
      getPlaylist: vi.fn().mockResolvedValue({ id: "p2", name: "SAVED RECENT 2 [AUTO]" }),
      findPlaylistByName: vi.fn().mockResolvedValue({ id: "p2", name: "SAVED RECENT 2 [AUTO]" }),
      createPlaylist: vi.fn(),
      replacePlaylistItems: vi.fn().mockResolvedValue(undefined),
      uploadPlaylistCoverImage: vi.fn(),
    } as unknown as SpotifyClient;

    const savedTracksSource = {
      getSavedTracks: vi.fn().mockResolvedValue([buildSavedTrack("a")]),
    } as unknown as SavedTracksSource;

    const localAppState: AppStateRepository = {
      ...appStateRepository,
      getValue: vi.fn().mockResolvedValue(
        JSON.stringify([
          {
            trackId: "a",
            trackUri: "spotify:track:a",
            trackName: "a",
            artistName: "Artist",
            addedAtIso: new Date("2026-03-28T00:00:01.000Z").toISOString(),
          },
          {
            trackId: "bb",
            trackUri: "spotify:track:bb",
            trackName: "bb",
            artistName: "Artist",
            addedAtIso: new Date("2026-03-28T00:00:02.000Z").toISOString(),
          },
        ]),
      ),
      setValue: vi.fn().mockResolvedValue(undefined),
    };

    const localArchive: ArchiveRepository = {
      ...archiveRepository,
      getArchivedTrack: vi.fn().mockResolvedValue(null),
      upsertArchivedTrack: vi.fn().mockResolvedValue(undefined),
    };

    const service = new AutoPlaylistsSyncService(
      spotifyClient,
      savedTracksSource,
      localArchive,
      localAppState,
      log,
      {
        definitions: [
          {
            key: "saved-recent:2",
            playlistName: "SAVED RECENT 2 [AUTO]",
            playlistDescription: "Auto-maintained recent saved tracks (2).",
            resolveTrackUris: (savedTracks) => savedTracks.slice(0, 2).map((track) => track.trackUri),
          },
        ],
        syncIntervalMs: 15000,
        playlistPrivate: true,
        syncModeName: "rare",
        syncRemovedTracksArchive: true,
      },
    );

    (service as unknown as { stopped: boolean }).stopped = false;
    await service.syncNow();

    expect(localArchive.upsertArchivedTrack).toHaveBeenCalledTimes(1);
    expect(localArchive.upsertArchivedTrack).toHaveBeenCalledWith(
      expect.objectContaining({ trackId: "bb", trackUri: "spotify:track:bb" }),
    );
    expect(log.info).toHaveBeenCalledWith("Archived removed track: Artist - bb (bb).");
  });

  it("skips removed tracks archive when DB persistence is disabled", async () => {
    const spotifyClient = {
      getCurrentUserId: vi.fn().mockResolvedValue("user-1"),
      hasPlaylistInLibrary: vi.fn().mockResolvedValue(true),
      getPlaylist: vi.fn().mockResolvedValue({ id: "p2", name: "SAVED RECENT 2 [AUTO]" }),
      findPlaylistByName: vi.fn().mockResolvedValue({ id: "p2", name: "SAVED RECENT 2 [AUTO]" }),
      createPlaylist: vi.fn(),
      replacePlaylistItems: vi.fn().mockResolvedValue(undefined),
      uploadPlaylistCoverImage: vi.fn(),
    } as unknown as SpotifyClient;

    const savedTracksSource = {
      getSavedTracks: vi.fn().mockResolvedValue([buildSavedTrack("a")]),
    } as unknown as SavedTracksSource;

    const localAppState: AppStateRepository = {
      ...appStateRepository,
      getValue: vi.fn().mockResolvedValue(null),
      setValue: vi.fn().mockResolvedValue(undefined),
    };

    const localArchive: ArchiveRepository = {
      ...archiveRepository,
      getArchivedTrack: vi.fn().mockResolvedValue(null),
      upsertArchivedTrack: vi.fn().mockResolvedValue(undefined),
    };

    const service = new AutoPlaylistsSyncService(
      spotifyClient,
      savedTracksSource,
      localArchive,
      localAppState,
      log,
      {
        definitions: [
          {
            key: "saved-recent:2",
            playlistName: "SAVED RECENT 2 [AUTO]",
            playlistDescription: "Auto-maintained recent saved tracks (2).",
            resolveTrackUris: (savedTracks) => savedTracks.slice(0, 2).map((track) => track.trackUri),
          },
        ],
        syncIntervalMs: 15000,
        playlistPrivate: true,
        syncModeName: "rare",
        syncRemovedTracksArchive: true,
        isDatabasePersistenceEnabled: () => false,
        savedTracksRequirements: { minSavedYear: 2024 },
      },
    );

    (service as unknown as { stopped: boolean }).stopped = false;
    await service.syncNow();

    expect(localArchive.upsertArchivedTrack).not.toHaveBeenCalled();
    expect(savedTracksSource.getSavedTracks).toHaveBeenCalledWith({ minSavedYear: 2024 });
    expect(localAppState.setValue).toHaveBeenCalledTimes(1);
    expect(localAppState.setValue).toHaveBeenCalledWith("auto_playlists:playlist_id:saved-recent:2", "p2");
  });

  it("fetches a full saved tracks snapshot when removed tracks archive is enabled", async () => {
    const spotifyClient = {
      getCurrentUserId: vi.fn().mockResolvedValue("user-1"),
      hasPlaylistInLibrary: vi.fn().mockResolvedValue(true),
      getPlaylist: vi.fn().mockResolvedValue({ id: "p2", name: "2024 [AUTO]" }),
      findPlaylistByName: vi.fn().mockResolvedValue({ id: "p2", name: "2024 [AUTO]" }),
      createPlaylist: vi.fn(),
      replacePlaylistItems: vi.fn().mockResolvedValue(undefined),
      uploadPlaylistCoverImage: vi.fn(),
    } as unknown as SpotifyClient;

    const savedTracksSource = {
      getSavedTracks: vi.fn().mockResolvedValue([buildSavedTrack("a")]),
    } as unknown as SavedTracksSource;

    const service = new AutoPlaylistsSyncService(
      spotifyClient,
      savedTracksSource,
      archiveRepository,
      appStateRepository,
      log,
      {
        definitions: [
          {
            key: "saved-in-year:2024",
            playlistName: "2024 [AUTO]",
            playlistDescription: "Auto-maintained saved tracks from 2024.",
            resolveTrackUris: (savedTracks) => savedTracks.map((track) => track.trackUri),
          },
        ],
        syncIntervalMs: 15000,
        playlistPrivate: true,
        syncModeName: "rare",
        syncRemovedTracksArchive: true,
        isDatabasePersistenceEnabled: () => true,
        savedTracksRequirements: { minSavedYear: 2024 },
      },
    );

    (service as unknown as { stopped: boolean }).stopped = false;
    await service.syncNow();

    expect(savedTracksSource.getSavedTracks).toHaveBeenCalledWith(undefined);
  });

  it("hashes uri arrays deterministically", () => {
    expect(hashTrackUris(["a", "b"])).toBe(hashTrackUris(["a", "b"]));
    expect(hashTrackUris(["a", "b"])).not.toBe(hashTrackUris(["b", "a"]));
  });

  it("logs completed sync with updated playlist count", async () => {
    const spotifyClient = {
      getCurrentUserId: vi.fn().mockResolvedValue("user-1"),
      hasPlaylistInLibrary: vi.fn().mockResolvedValue(true),
      getPlaylist: vi.fn().mockResolvedValue({ id: "p2", name: "SAVED RECENT 2 [AUTO]" }),
      findPlaylistByName: vi.fn().mockResolvedValue({ id: "p2", name: "SAVED RECENT 2 [AUTO]" }),
      createPlaylist: vi.fn(),
      replacePlaylistItems: vi.fn().mockResolvedValue(undefined),
      uploadPlaylistCoverImage: vi.fn(),
    } as unknown as SpotifyClient;

    const savedTracksSource = {
      getSavedTracks: vi.fn().mockResolvedValue([buildSavedTrack("a")]),
    } as unknown as SavedTracksSource;

    const service = new AutoPlaylistsSyncService(
      spotifyClient,
      savedTracksSource,
      archiveRepository,
      appStateRepository,
      log,
      {
        definitions: [
          {
            key: "saved-recent:2",
            playlistName: "SAVED RECENT 2 [AUTO]",
            playlistDescription: "Auto-maintained recent saved tracks (2).",
            resolveTrackUris: (savedTracks) => savedTracks.slice(0, 2).map((track) => track.trackUri),
          },
        ],
        syncIntervalMs: 15000,
        playlistPrivate: true,
        syncModeName: "rare",
        syncRemovedTracksArchive: true,
      },
    );

    (service as unknown as { stopped: boolean }).stopped = false;
    await service.syncNow();

    expect(log.info).toHaveBeenCalledWith("Started updating playlists for rare.");
    expect(log.info).toHaveBeenCalledWith('Playlist "SAVED RECENT 2 [AUTO]" was updated.');
    expect(log.info).toHaveBeenCalledWith("Updated playlists for rare (updated=1/1).");
  });

  it("reuses cached playlist ids from app state without searching by name", async () => {
    const spotifyClient = {
      getCurrentUserId: vi.fn().mockResolvedValue("user-1"),
      hasPlaylistInLibrary: vi.fn().mockResolvedValue(true),
      getPlaylist: vi.fn().mockResolvedValue({ id: "cached-playlist-id", name: "SAVED RECENT 2 [AUTO]" }),
      findPlaylistByName: vi.fn(),
      createPlaylist: vi.fn(),
      replacePlaylistItems: vi.fn().mockResolvedValue(undefined),
      uploadPlaylistCoverImage: vi.fn(),
    } as unknown as SpotifyClient;

    const savedTracksSource = {
      getSavedTracks: vi.fn().mockResolvedValue([buildSavedTrack("a")]),
    } as unknown as SavedTracksSource;

    const localAppState: AppStateRepository = {
      ...appStateRepository,
      getValue: vi
        .fn()
        .mockResolvedValueOnce("cached-playlist-id")
        .mockResolvedValueOnce(null),
      setValue: vi.fn().mockResolvedValue(undefined),
    };

    const service = new AutoPlaylistsSyncService(
      spotifyClient,
      savedTracksSource,
      archiveRepository,
      localAppState,
      log,
      {
        definitions: [
          {
            key: "saved-recent:2",
            playlistName: "SAVED RECENT 2 [AUTO]",
            playlistDescription: "Auto-maintained recent saved tracks (2).",
            resolveTrackUris: (savedTracks) => savedTracks.map((track) => track.trackUri),
          },
        ],
        syncIntervalMs: 15000,
        playlistPrivate: true,
        syncModeName: "frequent",
      },
    );

    (service as unknown as { stopped: boolean }).stopped = false;
    await service.syncNow();

    expect(localAppState.getValue).toHaveBeenCalledWith("auto_playlists:playlist_id:saved-recent:2");
    expect((spotifyClient as { getPlaylist: ReturnType<typeof vi.fn> }).getPlaylist).toHaveBeenCalledWith("cached-playlist-id");
    expect((spotifyClient as { hasPlaylistInLibrary: ReturnType<typeof vi.fn> }).hasPlaylistInLibrary).toHaveBeenCalledWith("cached-playlist-id");
    expect((spotifyClient as { findPlaylistByName: ReturnType<typeof vi.fn> }).findPlaylistByName).not.toHaveBeenCalled();
    expect((spotifyClient as { createPlaylist: ReturnType<typeof vi.fn> }).createPlaylist).not.toHaveBeenCalled();
    expect(
      (spotifyClient as { replacePlaylistItems: ReturnType<typeof vi.fn> }).replacePlaylistItems,
    ).toHaveBeenCalledWith("cached-playlist-id", ["spotify:track:a"]);
  });

  it("recreates a cached playlist when it is no longer present in the Spotify library", async () => {
    const createPlaylist = vi.fn().mockResolvedValue({ id: "replacement-playlist-id", name: "SAVED RECENT 2 [AUTO]" });
    const replacePlaylistItems = vi.fn().mockResolvedValue(undefined);
    const spotifyClient = {
      getCurrentUserId: vi.fn().mockResolvedValue("user-1"),
      hasPlaylistInLibrary: vi.fn().mockResolvedValue(false),
      getPlaylist: vi.fn().mockResolvedValue({ id: "cached-playlist-id", name: "SAVED RECENT 2 [AUTO]" }),
      findPlaylistByName: vi.fn().mockResolvedValue(null),
      createPlaylist,
      replacePlaylistItems,
      uploadPlaylistCoverImage: vi.fn(),
    } as unknown as SpotifyClient;

    const savedTracksSource = {
      getSavedTracks: vi.fn().mockResolvedValue([buildSavedTrack("a")]),
    } as unknown as SavedTracksSource;

    const localAppState: AppStateRepository = {
      ...appStateRepository,
      getValue: vi
        .fn()
        .mockResolvedValueOnce("cached-playlist-id")
        .mockResolvedValueOnce(null),
      setValue: vi.fn().mockResolvedValue(undefined),
      deleteValue: vi.fn().mockResolvedValue(undefined),
    };

    const service = new AutoPlaylistsSyncService(
      spotifyClient,
      savedTracksSource,
      archiveRepository,
      localAppState,
      log,
      {
        definitions: [
          {
            key: "saved-recent:2",
            playlistName: "SAVED RECENT 2 [AUTO]",
            playlistDescription: "Auto-maintained recent saved tracks (2).",
            resolveTrackUris: (savedTracks) => savedTracks.map((track) => track.trackUri),
          },
        ],
        syncIntervalMs: 15000,
        playlistPrivate: true,
        syncModeName: "frequent",
      },
    );

    (service as unknown as { stopped: boolean }).stopped = false;
    await service.syncNow();

    expect((spotifyClient as { getPlaylist: ReturnType<typeof vi.fn> }).getPlaylist).toHaveBeenCalledWith("cached-playlist-id");
    expect((spotifyClient as { hasPlaylistInLibrary: ReturnType<typeof vi.fn> }).hasPlaylistInLibrary).toHaveBeenCalledWith("cached-playlist-id");
    expect(createPlaylist).toHaveBeenCalledWith(
      "SAVED RECENT 2 [AUTO]",
      "Auto-maintained recent saved tracks (2).",
      true,
    );
    expect(replacePlaylistItems).toHaveBeenCalledWith("replacement-playlist-id", ["spotify:track:a"]);
  });

  it("reuses an existing playlist by name in the same sync cycle after cached playlist id fails", async () => {
    const replacePlaylistItems = vi.fn().mockResolvedValue(undefined);
    const findPlaylistByName = vi.fn().mockResolvedValue({ id: "recovered-playlist-id", name: "SAVED RECENT 2 [AUTO]" });
    const spotifyClient = {
      getCurrentUserId: vi.fn().mockResolvedValue("user-1"),
      hasPlaylistInLibrary: vi.fn(),
      getPlaylist: vi.fn().mockRejectedValue(new Error("Spotify request failed (404): not found")),
      findPlaylistByName,
      createPlaylist: vi.fn(),
      replacePlaylistItems,
      uploadPlaylistCoverImage: vi.fn(),
    } as unknown as SpotifyClient;

    const savedTracksSource = {
      getSavedTracks: vi.fn().mockResolvedValue([buildSavedTrack("a")]),
    } as unknown as SavedTracksSource;

    const localAppState: AppStateRepository = {
      ...appStateRepository,
      getValue: vi
        .fn()
        .mockResolvedValueOnce("missing-playlist-id")
        .mockResolvedValueOnce(null),
      setValue: vi.fn().mockResolvedValue(undefined),
      deleteValue: vi.fn().mockResolvedValue(undefined),
    };

    const service = new AutoPlaylistsSyncService(
      spotifyClient,
      savedTracksSource,
      archiveRepository,
      localAppState,
      log,
      {
        definitions: [
          {
            key: "saved-recent:2",
            playlistName: "SAVED RECENT 2 [AUTO]",
            playlistDescription: "Auto-maintained recent saved tracks (2).",
            resolveTrackUris: (savedTracks) => savedTracks.map((track) => track.trackUri),
          },
        ],
        syncIntervalMs: 15000,
        playlistPrivate: true,
        syncModeName: "frequent",
      },
    );

    (service as unknown as { stopped: boolean }).stopped = false;
    await service.syncNow();

    expect(
      (spotifyClient as { getPlaylist: ReturnType<typeof vi.fn> }).getPlaylist,
    ).toHaveBeenCalledWith("missing-playlist-id");
    expect(findPlaylistByName).toHaveBeenCalledWith("SAVED RECENT 2 [AUTO]");
    expect(replacePlaylistItems).toHaveBeenCalledTimes(1);
    expect(replacePlaylistItems).toHaveBeenNthCalledWith(1, "recovered-playlist-id", ["spotify:track:a"]);
    expect(log.info).toHaveBeenCalledWith('Playlist "SAVED RECENT 2 [AUTO]" was updated.');
  });

  it("creates a replacement playlist in the same sync cycle after cached playlist id fails", async () => {
    const replacePlaylistItems = vi.fn().mockResolvedValue(undefined);
    const createPlaylist = vi.fn().mockResolvedValue({ id: "created-playlist-id", name: "SAVED RECENT 2 [AUTO]" });
    const uploadPlaylistCoverImage = vi.fn().mockResolvedValue(undefined);
    const spotifyClient = {
      getCurrentUserId: vi.fn().mockResolvedValue("user-1"),
      hasPlaylistInLibrary: vi.fn(),
      getPlaylist: vi.fn().mockRejectedValue(new Error("Spotify request failed (404): not found")),
      findPlaylistByName: vi.fn().mockResolvedValue(null),
      createPlaylist,
      replacePlaylistItems,
      uploadPlaylistCoverImage,
    } as unknown as SpotifyClient;

    const savedTracksSource = {
      getSavedTracks: vi.fn().mockResolvedValue([buildSavedTrack("a")]),
    } as unknown as SavedTracksSource;

    const localAppState: AppStateRepository = {
      ...appStateRepository,
      getValue: vi
        .fn()
        .mockResolvedValueOnce("missing-playlist-id")
        .mockResolvedValueOnce(null),
      setValue: vi.fn().mockResolvedValue(undefined),
      deleteValue: vi.fn().mockResolvedValue(undefined),
    };

    const service = new AutoPlaylistsSyncService(
      spotifyClient,
      savedTracksSource,
      archiveRepository,
      localAppState,
      log,
      {
        definitions: [
          {
            key: "saved-recent:2",
            playlistName: "SAVED RECENT 2 [AUTO]",
            playlistDescription: "Auto-maintained recent saved tracks (2).",
            resolveTrackUris: (savedTracks) => savedTracks.map((track) => track.trackUri),
            buildCoverJpeg: async () => Buffer.from("cover-2"),
          },
        ],
        syncIntervalMs: 15000,
        playlistPrivate: true,
        syncModeName: "frequent",
      },
    );

    (service as unknown as { stopped: boolean }).stopped = false;
    await service.syncNow();

    expect(createPlaylist).toHaveBeenCalledWith(
      "SAVED RECENT 2 [AUTO]",
      "Auto-maintained recent saved tracks (2).",
      true,
    );
    expect(uploadPlaylistCoverImage).toHaveBeenCalledWith("created-playlist-id", Buffer.from("cover-2").toString("base64"));
    expect(replacePlaylistItems).toHaveBeenCalledTimes(1);
    expect(replacePlaylistItems).toHaveBeenNthCalledWith(1, "created-playlist-id", ["spotify:track:a"]);
    expect(log.info).toHaveBeenCalledWith('Created "SAVED RECENT 2 [AUTO]".');
    expect(log.info).toHaveBeenCalledWith('Playlist "SAVED RECENT 2 [AUTO]" was updated.');
  });

  it("creates a new playlist when lookup by name returns the same forbidden id", async () => {
    const replacePlaylistItems = vi.fn().mockResolvedValue(undefined);
    const findPlaylistByName = vi.fn().mockResolvedValue({ id: "forbidden-playlist-id", name: "SAVED RECENT 2 [AUTO]" });
    const createPlaylist = vi.fn().mockResolvedValue({ id: "replacement-playlist-id", name: "SAVED RECENT 2 [AUTO]" });
    const spotifyClient = {
      getCurrentUserId: vi.fn().mockResolvedValue("user-1"),
      hasPlaylistInLibrary: vi.fn(),
      getPlaylist: vi.fn().mockRejectedValue(new Error('Spotify API error during GET /v1/playlists/forbidden-playlist-id (403): {"error":{"status":403,"message":"Forbidden"}}')),
      findPlaylistByName,
      createPlaylist,
      replacePlaylistItems,
      uploadPlaylistCoverImage: vi.fn().mockResolvedValue(undefined),
    } as unknown as SpotifyClient;

    const savedTracksSource = {
      getSavedTracks: vi.fn().mockResolvedValue([buildSavedTrack("a")]),
    } as unknown as SavedTracksSource;

    const localAppState: AppStateRepository = {
      ...appStateRepository,
      getValue: vi
        .fn()
        .mockResolvedValueOnce("forbidden-playlist-id")
        .mockResolvedValueOnce(null),
      setValue: vi.fn().mockResolvedValue(undefined),
      deleteValue: vi.fn().mockResolvedValue(undefined),
    };

    const service = new AutoPlaylistsSyncService(
      spotifyClient,
      savedTracksSource,
      archiveRepository,
      localAppState,
      log,
      {
        definitions: [
          {
            key: "saved-recent:2",
            playlistName: "SAVED RECENT 2 [AUTO]",
            playlistDescription: "Auto-maintained recent saved tracks (2).",
            resolveTrackUris: (savedTracks) => savedTracks.map((track) => track.trackUri),
          },
        ],
        syncIntervalMs: 15000,
        playlistPrivate: true,
        syncModeName: "frequent",
      },
    );

    (service as unknown as { stopped: boolean }).stopped = false;
    await service.syncNow();

    expect(findPlaylistByName).toHaveBeenCalledWith("SAVED RECENT 2 [AUTO]");
    expect(createPlaylist).toHaveBeenCalledWith(
      "SAVED RECENT 2 [AUTO]",
      "Auto-maintained recent saved tracks (2).",
      true,
    );
    expect(replacePlaylistItems).toHaveBeenCalledTimes(1);
    expect(replacePlaylistItems).toHaveBeenNthCalledWith(1, "replacement-playlist-id", ["spotify:track:a"]);
    expect(log.info).toHaveBeenCalledWith('Created "SAVED RECENT 2 [AUTO]".');
    expect(log.info).toHaveBeenCalledWith('Playlist "SAVED RECENT 2 [AUTO]" was updated.');
  });

  it("retries in the same cycle on new-format 404 Spotify API errors", async () => {
    const replacePlaylistItems = vi
      .fn()
      .mockRejectedValueOnce(new Error('Spotify API error during PUT /v1/playlists/missing-playlist-id/items (404): {"error":{"status":404,"message":"Not found"}}'))
      .mockResolvedValueOnce(undefined);
    const spotifyClient = {
      getCurrentUserId: vi.fn().mockResolvedValue("user-1"),
      hasPlaylistInLibrary: vi.fn().mockResolvedValue(true),
      getPlaylist: vi.fn().mockResolvedValue({ id: "missing-playlist-id", name: "SAVED RECENT 2 [AUTO]" }),
      findPlaylistByName: vi.fn().mockResolvedValue({ id: "recovered-playlist-id", name: "SAVED RECENT 2 [AUTO]" }),
      createPlaylist: vi.fn(),
      replacePlaylistItems,
      uploadPlaylistCoverImage: vi.fn(),
    } as unknown as SpotifyClient;

    const savedTracksSource = {
      getSavedTracks: vi.fn().mockResolvedValue([buildSavedTrack("a")]),
    } as unknown as SavedTracksSource;

    const localAppState: AppStateRepository = {
      ...appStateRepository,
      getValue: vi
        .fn()
        .mockResolvedValueOnce("missing-playlist-id")
        .mockResolvedValueOnce(null),
      setValue: vi.fn().mockResolvedValue(undefined),
      deleteValue: vi.fn().mockResolvedValue(undefined),
    };

    const service = new AutoPlaylistsSyncService(
      spotifyClient,
      savedTracksSource,
      archiveRepository,
      localAppState,
      log,
      {
        definitions: [
          {
            key: "saved-recent:2",
            playlistName: "SAVED RECENT 2 [AUTO]",
            playlistDescription: "Auto-maintained recent saved tracks (2).",
            resolveTrackUris: (savedTracks) => savedTracks.map((track) => track.trackUri),
          },
        ],
        syncIntervalMs: 15000,
        playlistPrivate: true,
        syncModeName: "frequent",
      },
    );

    (service as unknown as { stopped: boolean }).stopped = false;
    await service.syncNow();

    expect(replacePlaylistItems).toHaveBeenNthCalledWith(1, "missing-playlist-id", ["spotify:track:a"]);
    expect(replacePlaylistItems).toHaveBeenNthCalledWith(2, "recovered-playlist-id", ["spotify:track:a"]);
  });

  it("uses saved track requirements instead of forcing full catalog fetch", async () => {
    const spotifyClient = {
      getCurrentUserId: vi.fn().mockResolvedValue("user-1"),
      hasPlaylistInLibrary: vi.fn().mockResolvedValue(true),
      getPlaylist: vi.fn().mockResolvedValue({ id: "p2", name: "SAVED RECENT 2 [AUTO]" }),
      findPlaylistByName: vi.fn().mockResolvedValue({ id: "p2", name: "SAVED RECENT 2 [AUTO]" }),
      createPlaylist: vi.fn(),
      replacePlaylistItems: vi.fn().mockResolvedValue(undefined),
      uploadPlaylistCoverImage: vi.fn(),
    } as unknown as SpotifyClient;

    const getSavedTracks = vi.fn().mockResolvedValue([buildSavedTrack("a"), buildSavedTrack("bb")]);
    const savedTracksSource = {
      getSavedTracks,
      getAllSavedTracks: vi.fn(),
    } as unknown as SavedTracksSource;

    const service = new AutoPlaylistsSyncService(
      spotifyClient,
      savedTracksSource,
      archiveRepository,
      appStateRepository,
      log,
      {
        definitions: [
          {
            key: "saved-recent:2",
            playlistName: "SAVED RECENT 2 [AUTO]",
            playlistDescription: "Auto-maintained recent saved tracks (2).",
            resolveTrackUris: (savedTracks) => savedTracks.slice(0, 2).map((track) => track.trackUri),
          },
        ],
        syncIntervalMs: 15000,
        playlistPrivate: true,
        syncModeName: "frequent",
        savedTracksRequirements: { maxRecentTracks: 2 },
      },
    );

    (service as unknown as { stopped: boolean }).stopped = false;
    await service.syncNow();

    expect(getSavedTracks).toHaveBeenCalledWith({ maxRecentTracks: 2 });
  });

  it("resolves track uris asynchronously and skips saved tracks fetch when disabled", async () => {
    const replacePlaylistItems = vi.fn().mockResolvedValue(undefined);
    const spotifyClient = {
      getCurrentUserId: vi.fn().mockResolvedValue("user-1"),
      hasPlaylistInLibrary: vi.fn().mockResolvedValue(true),
      getPlaylist: vi.fn().mockResolvedValue({ id: "p2", name: "MERGED [AUTO]" }),
      findPlaylistByName: vi.fn().mockResolvedValue({ id: "p2", name: "MERGED [AUTO]" }),
      createPlaylist: vi.fn(),
      replacePlaylistItems,
      uploadPlaylistCoverImage: vi.fn(),
    } as unknown as SpotifyClient;

    const getSavedTracks = vi.fn();
    const savedTracksSource = {
      getSavedTracks,
    } as unknown as SavedTracksSource;

    const service = new AutoPlaylistsSyncService(
      spotifyClient,
      savedTracksSource,
      archiveRepository,
      appStateRepository,
      log,
      {
        definitions: [
          {
            key: "merged:merge",
            playlistName: "MERGED [AUTO]",
            playlistDescription: "Auto-maintained merge.",
            resolveTrackUris: () => {
              throw new Error("unexpected resolveTrackUris call");
            },
            resolveTrackUrisAsync: async () => ["spotify:track:a", "spotify:track:bb"],
          },
        ],
        syncIntervalMs: 15000,
        playlistPrivate: true,
        syncModeName: "merged",
        fetchSavedTracks: false,
      },
    );

    (service as unknown as { stopped: boolean }).stopped = false;
    await service.syncNow();

    expect(getSavedTracks).not.toHaveBeenCalled();
    expect(replacePlaylistItems).toHaveBeenCalledWith("p2", ["spotify:track:a", "spotify:track:bb"]);
    expect(log.info).toHaveBeenCalledWith('Playlist "MERGED [AUTO]" was updated.');
  });

  it("keeps playlist untouched and continues sync when async track resolution fails", async () => {
    const replacePlaylistItems = vi.fn().mockResolvedValue(undefined);
    const spotifyClient = {
      getCurrentUserId: vi.fn().mockResolvedValue("user-1"),
      hasPlaylistInLibrary: vi.fn().mockResolvedValue(true),
      getPlaylist: vi.fn().mockResolvedValue({ id: "p2", name: "MERGED [AUTO]" }),
      findPlaylistByName: vi.fn().mockResolvedValue({ id: "p2", name: "MERGED [AUTO]" }),
      createPlaylist: vi.fn(),
      replacePlaylistItems,
      uploadPlaylistCoverImage: vi.fn(),
    } as unknown as SpotifyClient;

    const savedTracksSource = {
      getSavedTracks: vi.fn().mockResolvedValue([]),
    } as unknown as SavedTracksSource;

    const service = new AutoPlaylistsSyncService(
      spotifyClient,
      savedTracksSource,
      archiveRepository,
      appStateRepository,
      log,
      {
        definitions: [
          {
            key: "merged:merge",
            playlistName: "MERGED [AUTO]",
            playlistDescription: "Auto-maintained merge.",
            resolveTrackUris: () => [],
            resolveTrackUrisAsync: async () => {
              throw new Error("source lookup failed");
            },
          },
        ],
        syncIntervalMs: 15000,
        playlistPrivate: true,
        syncModeName: "merged",
      },
    );

    (service as unknown as { stopped: boolean }).stopped = false;
    await service.syncNow();

    expect(replacePlaylistItems).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith('Failed to resolve tracks for playlist "MERGED [AUTO]": source lookup failed');
    expect(log.info).toHaveBeenCalledWith("Updated playlists for merged (updated=0/1).");
  });

  it("backs off when Spotify rate limits the current sync mode", async () => {
    const spotifyClient = {
      getCurrentUserId: vi.fn(),
      hasPlaylistInLibrary: vi.fn(),
      getPlaylist: vi.fn(),
      findPlaylistByName: vi.fn().mockRejectedValue(new SpotifyRateLimitError(30)),
      createPlaylist: vi.fn(),
      replacePlaylistItems: vi.fn(),
      uploadPlaylistCoverImage: vi.fn(),
    } as unknown as SpotifyClient;

    const savedTracksSource = {
      getSavedTracks: vi.fn(),
    } as unknown as SavedTracksSource;

    const service = new AutoPlaylistsSyncService(
      spotifyClient,
      savedTracksSource,
      archiveRepository,
      appStateRepository,
      log,
      {
        definitions: [
          {
            key: "saved-recent:2",
            playlistName: "SAVED RECENT 2 [AUTO]",
            playlistDescription: "Auto-maintained recent saved tracks (2).",
            resolveTrackUris: () => [],
          },
        ],
        syncIntervalMs: 15000,
        playlistPrivate: true,
        syncModeName: "frequent",
      },
    );

    (service as unknown as { stopped: boolean }).stopped = false;
    await service.syncNow();

    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("Sync rate-limited. Retry after 30s."));
  });

  it("logs localized start message with playlist category label", async () => {
    initLocale("RU");

    const spotifyClient = {
      getCurrentUserId: vi.fn().mockResolvedValue("user-1"),
      hasPlaylistInLibrary: vi.fn().mockResolvedValue(true),
      getPlaylist: vi.fn().mockResolvedValue({ id: "p2", name: "SAVED RECENT 2 [AUTO]" }),
      findPlaylistByName: vi.fn().mockResolvedValue({ id: "p2", name: "SAVED RECENT 2 [AUTO]" }),
      createPlaylist: vi.fn(),
      replacePlaylistItems: vi.fn().mockResolvedValue(undefined),
      uploadPlaylistCoverImage: vi.fn(),
    } as unknown as SpotifyClient;

    const savedTracksSource = {
      getSavedTracks: vi.fn().mockResolvedValue([buildSavedTrack("a")]),
    } as unknown as SavedTracksSource;

    const service = new AutoPlaylistsSyncService(
      spotifyClient,
      savedTracksSource,
      archiveRepository,
      appStateRepository,
      log,
      {
        definitions: [
          {
            key: "saved-recent:2",
            playlistName: "SAVED RECENT 2 [AUTO]",
            playlistDescription: "Auto-maintained recent saved tracks (2).",
            resolveTrackUris: (savedTracks) => savedTracks.slice(0, 1).map((track) => track.trackUri),
          },
        ],
        syncIntervalMs: 600000,
        playlistPrivate: true,
        syncModeName: "frequent",
        syncLogLabel: "недавно сохранённого",
      },
    );

    service.start();
    await vi.waitFor(() => {
      expect(log.info).toHaveBeenCalledWith(
        "Будут обновляться автоплейлисты недавно сохранённого (плейлистов=1, интервал=600000мс, начальная задержка=0мс).",
      );
      expect(log.info).toHaveBeenCalledWith("Начато обновление плейлистов недавно сохранённого.");
      expect(log.info).toHaveBeenCalledWith(
        "Обновлены плейлисты недавно сохранённого (обновлено=1/1).",
      );
    });
    service.stop();
  });
});
