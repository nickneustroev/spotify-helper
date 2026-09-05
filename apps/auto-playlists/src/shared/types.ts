export type ItemType = "track" | "episode" | "ad" | "unknown";

export interface PlaybackSnapshot {
  isPlaying: boolean;
  itemType: ItemType;
  trackId: string | null;
  trackUri: string | null;
  trackName: string | null;
  artists: string[];
  progressMs: number | null;
  fetchedAtEpochMs: number;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAtEpochMs: number;
}

export interface SpotifyTokenBinding {
  spotifyClientId: string;
  spotifyRedirectUri: string;
  oauthScopes: string[];
}

export interface OAuthTokenStore {
  loadTokens(): Promise<OAuthTokens | null>;
  saveTokens(tokens: OAuthTokens): Promise<void>;
}

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface RecentlyPlayedItem {
  trackUri: string;
  trackName: string | null;
  artistName: string | null;
  playedAt: Date;
}

export interface SavedTrackItem {
  trackId: string;
  trackUri: string;
  trackName: string | null;
  artistName: string | null;
  addedAt: Date;
}

export interface PlaylistItem {
  trackUri: string;
  addedAt: Date | null;
}

export interface SpotifyAuthConfig {
  spotifyClientId: string;
  spotifyClientSecret: string;
  spotifyRedirectUri: string;
  requestTimeoutMs: number;
  oauthScopes: string[];
}

export interface SpotifyClientConfig {
  requestTimeoutMs: number;
  minRequestGapMs: number;
  spotifyProxyUrl: string;
}
