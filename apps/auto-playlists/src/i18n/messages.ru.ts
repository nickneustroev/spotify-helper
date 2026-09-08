export const messages = {
  receivedSignalShuttingDown: (signal: string) => `Получен сигнал ${signal}, завершение работы.`,

  configLoaded: (config: string) => `Конфигурация загружена: ${config}`,
  spotifyAuthReady: "Авторизация Spotify готова.",
  stopping: (signal: string) => `Остановка (${signal}).`,

  trackWatcherStarted: (pollIntervalMs: number) =>
    `Мониторинг треков запущен. Интервал опроса: ${pollIntervalMs}мс`,
  trackWatcherStopped: "Мониторинг треков остановлен.",
  trackMonitoringDisabled: "Мониторинг треков отключен (TRACK_MONITORING_ENABLED=false).",
  spotifyRateLimitedBackingOff: (delayMs: number) =>
    `Spotify ограничил частоту запросов. Откладывание на ${delayMs}мс перед следующим опросом.`,
  spotifyRateLimitLongBan: (retryAfterSeconds: number, resumeAtIso: string) =>
    `Spotify ограничил запросы с долгим Retry-After (${retryAfterSeconds}с). Запросы приостановлены до ${resumeAtIso}.`,
  spotifyTransportRetry: (request: string, attempt: number, message: string) =>
    `Ошибка запроса к Spotify ${request} (попытка ${attempt}): ${message}. Повторяю...`,
  pollingFailed: (message: string, delayMs: number) =>
    `Ошибка опроса: ${message}. Следующая попытка через ${delayMs}мс.`,

  trackNotification: (artists: string, trackName: string) => `ТРЕК ${artists} - ${trackName}`,

  savedRecentPlaylistsLabel: "недавно сохранённого",
  savedInYearPlaylistsLabel: "по годам",
  mergedPlaylistsLabel: "сборных",
  playlistRecentPlaylistsLabel: "первых N треков плейлиста",
  mergedPlaylistSourceNotFound: (target: string, source: string) =>
    `Плейлист-источник "${source}" для сборного плейлиста "${target}" не найден. Он будет пропущен до следующей синхронизации.`,
  mergedPlaylistSourceFetchFailed: (target: string, source: string, message: string) =>
    `Не удалось получить треки плейлиста-источника "${source}" для сборного плейлиста "${target}": ${message}. Источник будет пропущен до следующей синхронизации.`,
  mergedPlaylistSavedOrderFetchFailed: (message: string) =>
    `Не удалось загрузить избранное для сборных плейлистов в режиме порядка избранного: ${message}. Затронутые сборные плейлисты будут упорядочены по датам добавления в источники до следующей синхронизации.`,
  recentFromPlaylistSourceNotFound: (source: string) =>
    `Плейлист-источник "${source}" не найден. Связанные автоплейлисты будут пропущены до следующей синхронизации.`,
  excludePlaylistNotFound: (name: string) =>
    `Плейлист исключений "${name}" не найден. Исключение треков пропущено до следующей синхронизации.`,
  excludePlaylistLookupFailed: (name: string, message: string) =>
    `Не удалось найти плейлист исключений "${name}": ${message}. Исключение треков пропущено до следующей синхронизации.`,
  excludePlaylistFetchFailed: (name: string, message: string) =>
    `Не удалось получить треки плейлиста исключений "${name}": ${message}. Исключение треков пропущено до следующей синхронизации.`,
  playlistTrackResolveFailed: (name: string, message: string) =>
    `Не удалось получить треки для плейлиста "${name}": ${message}`,
  playlistResolveEmpty: (name: string) =>
    `Для плейлиста "${name}" не получено ни одного трека. Плейлист оставлен без изменений, чтобы не очистить его содержимое.`,
  noPlaylistDefinitionsConfigured: "Автоплейлисты не настроены.",
  syncActive: (label: string, definitions: number, interval: number, initialDelay: number) =>
    `Будут обновляться автоплейлисты ${label} (плейлистов=${definitions}, интервал=${interval}мс, начальная задержка=${initialDelay}мс).`,
  syncStopped: (mode: string) => `Синхронизация остановлена (${mode}).`,
  syncCycleStarted: (label: string) => `Начато обновление плейлистов ${label}.`,
  playlistNoLongerAvailable: (name: string) =>
    `Плейлист "${name}" больше недоступен. Кэшированный ID удалён, будет создан заново при следующей синхронизации.`,
  playlistUpdated: (name: string) => `Плейлист "${name}" был обновлен.`,
  playlistDoesNotRequireUpdate: (name: string) => `Плейлист "${name}" не требует обновления.`,
  syncCycleCompleted: (label: string, updated: number, total: number, requests: number) =>
    `Обновлены плейлисты ${label} (обновлено=${updated}/${total}, запросов к Spotify: ${requests}).`,
  syncRateLimited: (retryAfter: number, nextAttempt: string) =>
    `Синхронизация ограничена по частоте. Повтор через ${retryAfter}с. Следующая попытка после ${nextAttempt}.`,
  syncFailed: (mode: string, message: string) => `Синхронизация не удалась (${mode}): ${message}`,
  playlistCreated: (name: string) => `Создан "${name}".`,
  coverUploaded: (name: string) => `Обложка загружена для "${name}".`,
  coverUploadFailed: (name: string, message: string) =>
    `Не удалось загрузить обложку для плейлиста ${name}: ${message}`,
  archivedRemovedTrack: (artist: string, track: string, trackId: string) =>
    `В архив добавлен удалённый трек: ${artist} - ${track} (${trackId}).`,
  savedTracksSnapshotInvalid:
    "Снимок сохранённых треков в AppState повреждён. Пересоздание снимка.",

  databaseUrlEmpty:
    "DATABASE_URL не указан. Приложение будет работать без функций, зависящих от БД: сохранение прослушанных треков и архив удалённых треков отключены.",
  databaseClientNotCreated:
    "Обнаружено подключение к БД, но клиент БД не создан. Приложение будет работать без функций, зависящих от БД.",
  databaseConnected:
    "Подключение к БД обнаружено и проверено. Приложение будет использовать функции, сохраняющие данные в БД.",
  databaseConnectionFailed: (message: string) =>
    `Подключение к БД обнаружено, но не удаётся подключиться: ${message}. Приложение будет работать без функций, зависящих от БД.`,

  prismaDisconnectFailed: (message: string) => `Ошибка отключения Prisma: ${message}`,

  spotifyTokenInvalid: (key: string) =>
    `Данные токена Spotify в ключе AppState "${key}" повреждены.`,
  spotifyTokenParseFailed: (key: string, message: string) =>
    `Не удалось разобрать данные токена Spotify из ключа AppState "${key}": ${message}`,
  spotifyTokensSaved: (key: string) => `Токены Spotify сохранены в ключ AppState "${key}".`,
  spotifyTokensResetDueToConfigChange: (key: string) =>
    `Токены Spotify в ключе AppState "${key}" сброшены из-за изменения настроек Spotify app.`,

  noStoredSpotifyTokens: "Сохранённые токены Spotify не найдены, запуск авторизации.",
  accessTokenNearExpiration: "Access token истекает скоро, обновление.",
  openingSpotifyAuthorization: "Открытие авторизации Spotify в браузере.",
  openSpotifyAuthorization: (url: string) =>
    `Откройте ${url} для начала авторизации Spotify.`,
  authorizationCallbackReceived:
    "Callback авторизации получен. Обмен кода на токены.",
  waitingForOAuthCallback: (host: string, port: number, path: string, redirectHost: string) =>
    `Ожидание OAuth callback на ${host}:${port} (${path}), хост redirect URI: ${redirectHost}`,
  authorizationEntrypoint: (url: string) => `Точка входа авторизации: ${url}`,
  spotifyTokenExchangeSuccess: "Обмен токена Spotify завершён успешно.",
  spotifyTokenExchangeFailed: (status: number, payload: string) =>
    `Не удалось обменять код Spotify на токен (${status}): ${payload}`,
  spotifyTokenRefreshFailed: (status: number, payload: string) =>
    `Не удалось обновить токен Spotify (${status}): ${payload}`,
  spotifyConnectionValidationMissingUserId:
    "Spotify ответил, но не вернул идентификатор пользователя.",
  spotifyProxyValidatedUsingProxy:
    "Указан прокси, прокси проверен, поэтому он будет использоваться.",
  spotifyProxyConfiguredButFailedUsingDirect: (message: string) =>
    `Указан прокси, но он не работает, поэтому будет использовано обычное подключение. Причина: ${message}`,
  spotifyDirectConnectionFailed: (message: string) =>
    `Обычное подключение к Spotify не прошло проверку. Spotify не отвечает полноценно или доступ ограничен по региону. Приложение остановлено. Причина: ${message}`,

  spotifyApi401:
    "Spotify API вернул 401, обновление токена и повторная попытка.",
  spotifyApi429: (requestDescription: string, retryAfter: number, retriesLeft: number) =>
    `Spotify API вернул 429 для ${requestDescription}. Ожидание ${retryAfter}с перед повтором (осталось попыток: ${retriesLeft}).`,
  spotifyGeoBlockProxy:
    "Обнаружена гео-блокировка Spotify (403). Повтор запроса через настроенный прокси.",
  spotifyGeoBlockNoProxy:
    "Обнаружена гео-блокировка Spotify, но прокси не настроен. Установите SPOTIFY_PROXY_URL=http://user:pass@host:port.",

  liveTrackSaved: (uri: string, at: string) => `Трек сохранён: ${uri} в ${at}.`,
  liveTrackAlreadyExists: (uri: string, at: string) =>
    `Трек уже существует, метаданные обновлены: ${uri} в ${at}.`,
} as const;
