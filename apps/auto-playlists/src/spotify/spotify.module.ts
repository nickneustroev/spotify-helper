import { Module } from "@nestjs/common";
import { AuthManager } from "./auth-manager.js";
import { type AppConfig } from "../core/config.js";
import { CoreModule } from "../core/core.module.js";
import { APP_CONFIG, APP_LOGGER, APP_STATE_REPOSITORY, AUTH_MANAGER, FETCH_IMPL, SPOTIFY_CLIENT } from "../core/nest.tokens.js";
import { PersistenceModule } from "../persistence/persistence.module.js";
import type { AppStateRepository } from "../persistence/types.js";
import type { Logger, SpotifyAuthConfig, SpotifyClientConfig } from "../shared/types.js";
import { AppStateOAuthTokenStore } from "./app-state-oauth-token-store.js";
import { SpotifyClient } from "./spotify-client.js";

const AUTO_PLAYLISTS_OAUTH_SCOPES = [
  "user-read-currently-playing",
  "user-library-read",
  "ugc-image-upload",
  "playlist-modify-private",
  "playlist-read-private",
  "playlist-read-collaborative",
] as const;

@Module({
  imports: [CoreModule, PersistenceModule],
  providers: [
    {
      provide: AUTH_MANAGER,
      inject: [APP_CONFIG, APP_STATE_REPOSITORY, APP_LOGGER, FETCH_IMPL],
      useFactory: (
        cfg: AppConfig,
        appStateRepository: AppStateRepository,
        log: Logger,
        fetchImpl: typeof fetch,
      ) =>
        new AuthManager(
          {
            spotifyClientId: cfg.spotifyClientId,
            spotifyClientSecret: cfg.spotifyClientSecret,
            spotifyRedirectUri: cfg.spotifyRedirectUri,
            requestTimeoutMs: cfg.requestTimeoutMs,
            oauthScopes: [...AUTO_PLAYLISTS_OAUTH_SCOPES],
          } satisfies SpotifyAuthConfig,
          new AppStateOAuthTokenStore(
            appStateRepository,
            log,
            {
              spotifyClientId: cfg.spotifyClientId,
              spotifyRedirectUri: cfg.spotifyRedirectUri,
              oauthScopes: [...AUTO_PLAYLISTS_OAUTH_SCOPES],
            },
          ),
          log,
          fetchImpl,
        ),
    },
    {
      provide: SPOTIFY_CLIENT,
      inject: [AUTH_MANAGER, APP_CONFIG, APP_LOGGER, FETCH_IMPL],
      useFactory: (
        authManager: AuthManager,
        cfg: AppConfig,
        log: Logger,
        fetchImpl: typeof fetch,
      ) =>
        new SpotifyClient(
          authManager,
          {
            requestTimeoutMs: cfg.requestTimeoutMs,
            minRequestGapMs: cfg.spotifyMinRequestGapMs,
            spotifyProxyUrl: cfg.spotifyProxyUrl,
          } satisfies SpotifyClientConfig,
          log,
          fetchImpl,
        ),
    },
  ],
  exports: [AUTH_MANAGER, SPOTIFY_CLIENT],
})
export class SpotifyModule {}
