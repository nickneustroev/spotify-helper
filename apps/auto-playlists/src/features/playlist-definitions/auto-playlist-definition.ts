import type { SavedTrackItem } from "../../shared/types.js";
import type { SpotifyClient } from "../../spotify/spotify-client.js";

export interface AutoPlaylistDefinition {
  key: string;
  playlistName: string;
  playlistDescription: string;
  resolveTrackUris(savedTracks: SavedTrackItem[]): string[];
  resolveTrackUrisAsync?(
    spotifyClient: SpotifyClient,
    savedTracks?: SavedTrackItem[],
  ): Promise<string[]>;
  buildCoverJpeg?(): Promise<Buffer>;
}
