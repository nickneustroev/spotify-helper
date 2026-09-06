export const messages = {
  receivedSignalShuttingDown: (signal: string) => `Received ${signal}, shutting down.`,

  configLoaded: (config: string) => `Config loaded: ${config}`,
  spotifyAuthReady: "Spotify auth is ready.",
  stopping: (signal: string) => `Stopping (${signal}).`,

  trackWatcherStarted: (pollIntervalMs: number) =>
    `Track watcher started. Poll interval: ${pollIntervalMs}ms`,
  trackWatcherStopped: "Track watcher stopped.",
  trackMonitoringDisabled: "Track monitoring is disabled (TRACK_MONITORING_ENABLED=false).",
  spotifyRateLimitedBackingOff: (delayMs: number) =>
    `Spotify rate limited requests. Backing off for ${delayMs}ms before next poll.`,
  pollingFailed: (message: string, delayMs: number) =>
    `Polling failed: ${message}. Next attempt in ${delayMs}ms.`,

  trackNotification: (artists: string, trackName: string) => `TRACK ${artists} - ${trackName}`,

  savedRecentPlaylistsLabel: "recently saved",
  savedInYearPlaylistsLabel: "by year",
  mergedPlaylistsLabel: "merged playlists",
  derivedPlaylistsLabel: "derived playlists",
  mergedPlaylistSourceNotFound: (target: string, source: string) =>
    `Source playlist "${source}" for merged playlist "${target}" was not found. It will be skipped until the next sync.`,
  mergedPlaylistSourceFetchFailed: (target: string, source: string, message: string) =>
    `Failed to fetch tracks of source playlist "${source}" for merged playlist "${target}": ${message}. The source will be skipped until the next sync.`,
  mergedPlaylistSavedOrderFetchFailed: (message: string) =>
    `Failed to load saved tracks for saved-order merged playlists: ${message}. Affected merged playlists will be ordered by source added dates until the next sync.`,
  recentFromPlaylistSourceNotFound: (source: string) =>
    `Source playlist "${source}" was not found. Related auto playlists will be skipped until the next sync.`,
  excludePlaylistNotFound: (name: string) =>
    `Exclude playlist "${name}" was not found. Track exclusions are skipped until the next sync.`,
  excludePlaylistLookupFailed: (name: string, message: string) =>
    `Failed to look up exclude playlist "${name}": ${message}. Track exclusions are skipped until the next sync.`,
  excludePlaylistFetchFailed: (name: string, message: string) =>
    `Failed to fetch tracks of exclude playlist "${name}": ${message}. Track exclusions are skipped until the next sync.`,
  playlistTrackResolveFailed: (name: string, message: string) =>
    `Failed to resolve tracks for playlist "${name}": ${message}`,
  noPlaylistDefinitionsConfigured: "Auto playlists are not configured.",
  syncActive: (label: string, definitions: number, interval: number, initialDelay: number) =>
    `Auto playlists are now running for ${label} (playlists=${definitions}, interval=${interval}ms, initialDelay=${initialDelay}ms).`,
  syncStopped: (mode: string) => `Sync stopped (${mode}).`,
  syncCycleStarted: (label: string) => `Started updating playlists for ${label}.`,
  playlistNoLongerAvailable: (name: string) =>
    `Playlist "${name}" is no longer available. Cached id dropped, will recreate on next sync.`,
  playlistUpdated: (name: string) => `Playlist "${name}" was updated.`,
  playlistDoesNotRequireUpdate: (name: string) => `Playlist "${name}" does not require an update.`,
  syncCycleCompleted: (label: string, updated: number, total: number) =>
    `Updated playlists for ${label} (updated=${updated}/${total}).`,
  syncRateLimited: (retryAfter: number, nextAttempt: string) =>
    `Sync rate-limited. Retry after ${retryAfter}s. Next attempt after ${nextAttempt}.`,
  syncFailed: (mode: string, message: string) => `Sync failed (${mode}): ${message}`,
  playlistCreated: (name: string) => `Created "${name}".`,
  coverUploaded: (name: string) => `Cover uploaded "${name}".`,
  coverUploadFailed: (name: string, message: string) =>
    `Failed to upload cover for playlist ${name}: ${message}`,
  archivedRemovedTrack: (artist: string, track: string, trackId: string) =>
    `Archived removed track: ${artist} - ${track} (${trackId}).`,
  savedTracksSnapshotInvalid: "Saved tracks snapshot in AppState is invalid. Rebuilding snapshot.",

  databaseUrlEmpty:
    "DATABASE_URL is not set. The application will run without DB-dependent features: saved tracks and removed tracks archive are disabled.",
  databaseClientNotCreated:
    "Database connection detected but DB client was not created. The application will run without DB-dependent features.",
  databaseConnected:
    "Database connection detected and verified. The application will use features that store data in the database.",
  databaseConnectionFailed: (message: string) =>
    `Database connection detected but unable to connect: ${message}. The application will run without DB-dependent features.`,

  prismaDisconnectFailed: (message: string) => `Prisma disconnect failed: ${message}`,

  spotifyTokenInvalid: (key: string) =>
    `Spotify token payload in AppState key "${key}" is invalid.`,
  spotifyTokenParseFailed: (key: string, message: string) =>
    `Unable to parse Spotify token payload from AppState key "${key}": ${message}`,
  spotifyTokensSaved: (key: string) => `Spotify tokens saved to AppState key "${key}".`,
  spotifyTokensResetDueToConfigChange: (key: string) =>
    `Spotify tokens in AppState key "${key}" were reset because the Spotify app configuration changed.`,

  noStoredSpotifyTokens: "No stored Spotify tokens found, starting login.",
  accessTokenNearExpiration: "Access token is near expiration, refreshing.",
  openingSpotifyAuthorization: "Opening Spotify authorization in browser.",
  openSpotifyAuthorization: (url: string) =>
    `Open ${url} to start Spotify authorization.`,
  authorizationCallbackReceived: "Authorization callback received. Exchanging code for tokens.",
  waitingForOAuthCallback: (host: string, port: number, path: string, redirectHost: string) =>
    `Waiting for OAuth callback on ${host}:${port} (${path}), redirect URI host: ${redirectHost}`,
  authorizationEntrypoint: (url: string) => `Authorization entrypoint: ${url}`,
  spotifyTokenExchangeSuccess: "Spotify token exchange completed successfully.",
  spotifyTokenExchangeFailed: (status: number, payload: string) =>
    `Token exchange failed (${status}): ${payload}`,
  spotifyTokenRefreshFailed: (status: number, payload: string) =>
    `Token refresh failed (${status}): ${payload}`,
  spotifyConnectionValidationMissingUserId:
    "Spotify responded, but did not return a user id.",
  spotifyProxyValidatedUsingProxy:
    "A proxy is configured and validated, so it will be used.",
  spotifyProxyConfiguredButFailedUsingDirect: (message: string) =>
    `A proxy is configured but not working, so a direct connection will be used. Reason: ${message}`,
  spotifyDirectConnectionFailed: (message: string) =>
    `Direct Spotify connection validation failed. Spotify is not responding fully or access is region-blocked. The application is stopping. Reason: ${message}`,

  spotifyApi401: "Spotify API returned 401, refreshing token and retrying once.",
  spotifyApi429: (requestDescription: string, retryAfter: number, retriesLeft: number) =>
    `Spotify API returned 429 for ${requestDescription}. Waiting ${retryAfter}s before retry (${retriesLeft} retries left).`,
  spotifyGeoBlockProxy: "Spotify API geo-block detected (403). Retrying request via configured proxy.",
  spotifyGeoBlockNoProxy:
    "Spotify geo-block detected but proxy is not configured. Set SPOTIFY_PROXY_URL=http://user:pass@host:port.",

  liveTrackSaved: (uri: string, at: string) => `Live track saved: ${uri} at ${at}.`,
  liveTrackAlreadyExists: (uri: string, at: string) =>
    `Live track already exists, refreshed metadata: ${uri} at ${at}.`,
} as const;
