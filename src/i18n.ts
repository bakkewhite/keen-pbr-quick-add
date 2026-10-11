import type { DomainMutationAction } from './config';

export type UiLanguage = 'ru' | 'en';

export const UI_LANGUAGE_STORAGE_KEY = 'ui.language.v1';

export interface PopupCopy {
  mainTitle: string;
  settingsTitle: string;
  connectionsTitle: string;
  activeConnectionLabel: string;
  noConnection: string;
  addConnection: string;
  chooseConnection: string;
  useSaved: string;
  editSaved: string;
  removeSaved: string;
  removeConnectionTitle: string;
  removeConnectionHelp: string;
  defaultListHelp: string;
  rootDomainLabel: string;
  domainInputLabel: string;
  checkDomain: string;
  domainFromTab: string;
  enterDomain: string;
  domainNeedsCheck: string;
  invalidDomain: string;
  connectionInfo: string;
  listLabel: string;
  chooseList: string;
  add(list: string): string;
  remove(list: string): string;
  adding: string;
  removing: string;
  checking: string;
  connectionLabel: string;
  connectedSummary: string;
  changeConnection: string;
  cancelConnection: string;
  connectionHelp: string;
  savedConnections: string;
  newConnection: string;
  connectionScenario: string;
  authHelp: string;
  openAddress: string;
  retryConnection: string;
  useCurrentTab: string;
  useKeeneticOrigin: string;
  openWebUi: string;
  checkConnection: string;
  authTitle: string;
  passwordLabel: string;
  rememberLabel: string;
  rememberHelp: string;
  httpWarning: string;
  httpConsent: string;
  connectAuth: string;
  forgetAuth: string;
  authSession: string;
  authLocal: string;
  authConnected: string;
  authForgotten: string;
  defaultListLabel: string;
  save: string;
  settingsAction: string;
  backAction: string;
  languageAction: string;
  dismissConnectionResult: string;
  ready: string;
  otherListsLabel: string;
  membershipHelpLabel: string;
  externalPartial: string;
  externalUnavailable: string;
  absentFromSelected(list: string): string;
  defaultUnavailable: string;
  requestFailed: string;
  stateLoadFailed: string;
  unexpectedResponse: string;
  invalidOrigin: string;
  accessDenied: string;
  settingsSaved: string;
  oldPermissionRetained: string;
  languagePersistenceFailed: string;
  connected(version: string | null): string;
  routingConfirmed(domain: string): string;
  appliedUnverified(reason: string): string;
  readyInOtherLists(lists: string[]): string;
  presentInSelected(list: string): string;
  addedTo(list: string): string;
  removedStillIn(list: string, otherLists: string[]): string;
  removedReady(list: string): string;
  changedVerificationPending(
    action: DomainMutationAction,
    reason: string,
  ): string;
  alreadyPresent(list: string): string;
  draftBlocked: string;
  listUnavailable: string;
  saveUnknown: string;
  stageUncertain(reason: string): string;
  writeFailed(reason: string): string;
  operationFailed(reason: string): string;
  backgroundFailure(
    code: string,
    fallback: string,
    diagnostic?: string,
  ): string;
}

const reasons: Record<UiLanguage, Record<string, string>> = {
  ru: {
    network: 'сетевая ошибка',
    timeout: 'тайм-аут',
    auth: 'требуется авторизация',
    protocol: 'несовместимый ответ API',
    conflict: 'конфликт или занятая операция',
    http: 'ошибка HTTP',
    unknown: 'неизвестная ошибка',
    'rolled-back': 'keen-pbr отменил изменения',
    'not-applied': 'конфигурация не применена',
    'health-not-converged': 'состояние сервиса не сошлось',
    'routing-not-confirmed': 'маршрутизация не подтверждена',
    'verification-unavailable': 'проверка недоступна',
    'save-outcome-unknown': 'результат save неизвестен',
  },
  en: {
    network: 'network error',
    timeout: 'timeout',
    auth: 'authentication required',
    protocol: 'incompatible API response',
    conflict: 'conflict or busy operation',
    http: 'HTTP error',
    unknown: 'unknown error',
    'rolled-back': 'keen-pbr rolled the change back',
    'not-applied': 'configuration was not applied',
    'health-not-converged': 'service health did not converge',
    'routing-not-confirmed': 'routing is not confirmed',
    'verification-unavailable': 'verification is unavailable',
    'save-outcome-unknown': 'save outcome is unknown',
  },
};

const backgroundErrors: Record<UiLanguage, Record<string, string>> = {
  ru: {
    INVALID_API_ORIGIN: 'Введите HTTP/HTTPS origin API без пути',
    INVALID_DOMAIN: 'Введите домен',
    HOST_PERMISSION_REQUIRED: 'Предоставьте доступ к адресу API',
    API_INCOMPATIBLE: 'Требуется совместимый API keen-pbr 3.x',
    API_AUTH_REQUIRED: 'Требуется пароль keen-pbr. Откройте настройки для входа.',
    API_GATEWAY_AUTH: 'Доступ к API закрыт внешней страницей входа или прокси. Проверьте адрес keen-pbr и вход KeenDNS/прокси.',
    API_ACCESS_RESTRICTED: 'Пароль keen-pbr отключён, но адрес отказал в доступе к API. Проверьте KeenDNS/прокси и разрешения API.',
    CONNECTION_REMOVE_FAILED: 'Не удалось удалить подключение. Проверьте его текущее состояние.',
    API_AUTH_UNAVAILABLE: 'По этому адресу пароль API не требуется. Проверьте подключение без пароля.',
    CONNECTION_CHANGED: 'Подключение изменилось. Обновите состояние перед добавлением домена.',
    API_FORBIDDEN: 'API отказал в доступе (403); проверьте адрес и разрешения',
    PASSWORD_REQUIRED: 'Введите пароль keen-pbr',
    AUTH_INVALID_PASSWORD: 'Пароль не принят keen-pbr',
    INSECURE_HTTP_CONSENT_REQUIRED: 'Подтвердите передачу пароля по HTTP без шифрования',
    AUTH_FORGET_FAILED: 'Не удалось удалить сохранённый пароль',
    AUTH_STORAGE_FAILED: 'Не удалось безопасно сохранить пароль',
    AUTH_CANCELLED: 'Вход был отменён',
    API_BUSY: 'В keen-pbr есть draft или выполняется другая операция',
    API_UNAVAILABLE: 'API keen-pbr недоступен',
    API_ERROR: 'Ошибка запроса к API keen-pbr',
    INTERNAL_ERROR: 'Операция не выполнена',
    UNSUPPORTED_TAB: 'Откройте HTTP/HTTPS-страницу с регистрируемым доменом',
    SETUP_REQUIRED: 'Откройте настройки расширения',
    DEFAULT_LIST_UNAVAILABLE: 'Выбранный список по умолчанию недоступен',
    INVALID_MESSAGE: 'Запрос отклонён',
    UNTRUSTED_SENDER: 'Запрос отклонён',
  },
  en: {
    INVALID_API_ORIGIN: 'Enter an HTTP/HTTPS API origin without a path',
    INVALID_DOMAIN: 'Enter a domain',
    HOST_PERMISSION_REQUIRED: 'Grant access to the API address',
    API_INCOMPATIBLE: 'A compatible keen-pbr 3.x API is required',
    API_AUTH_REQUIRED: 'keen-pbr password required. Open Settings to sign in.',
    API_GATEWAY_AUTH: 'API access is blocked by an external sign-in page or proxy. Check the keen-pbr address and KeenDNS/proxy sign-in.',
    API_ACCESS_RESTRICTED: 'keen-pbr password protection is off, but this address denied API access. Check KeenDNS/proxy and API permissions.',
    CONNECTION_REMOVE_FAILED: 'Could not remove the connection. Check its current state.',
    API_AUTH_UNAVAILABLE: 'This API does not require a password. Check the connection without a password.',
    CONNECTION_CHANGED: 'The connection changed. Refresh the state before adding a domain.',
    API_FORBIDDEN: 'API access denied (403); check address and permissions',
    PASSWORD_REQUIRED: 'Enter your keen-pbr password',
    AUTH_INVALID_PASSWORD: 'keen-pbr did not accept the password',
    INSECURE_HTTP_CONSENT_REQUIRED: 'Confirm unencrypted password transmission over HTTP',
    AUTH_FORGET_FAILED: 'Could not remove the saved password',
    AUTH_STORAGE_FAILED: 'Could not securely store the password',
    AUTH_CANCELLED: 'Sign-in was cancelled',
    API_BUSY: 'keen-pbr has a draft or another operation is running',
    API_UNAVAILABLE: 'keen-pbr API is unavailable',
    API_ERROR: 'keen-pbr API request failed',
    INTERNAL_ERROR: 'The operation was not completed',
    UNSUPPORTED_TAB: 'Open an HTTP/HTTPS page with a registrable domain',
    SETUP_REQUIRED: 'Open extension settings',
    DEFAULT_LIST_UNAVAILABLE: 'The selected default list is unavailable',
    INVALID_MESSAGE: 'The request was rejected',
    UNTRUSTED_SENDER: 'The request was rejected',
  },
};

export function parseUiLanguage(value: unknown): UiLanguage {
  return value === 'en' ? 'en' : 'ru';
}

function localReason(language: UiLanguage, reason: string): string {
  return reasons[language][reason] ?? reason;
}

function localBackgroundFailure(
  language: UiLanguage,
  code: string,
  fallback: string,
  diagnostic?: string,
): string {
  const base = language === 'ru' && code !== 'INVALID_DOMAIN'
    ? fallback
    : backgroundErrors[language][code] ?? fallback;
  return diagnostic && !base.includes(diagnostic)
    ? base + ' [' + diagnostic + ']'
    : base;
}

const copies: Record<UiLanguage, PopupCopy> = {
  ru: {
    mainTitle: 'Добавить в keen-pbr',
    settingsTitle: 'Настройки',
    connectionsTitle: 'Подключения',
    activeConnectionLabel: 'Активно',
    noConnection: 'Нет активного подключения',
    addConnection: 'Добавить подключение',
    chooseConnection: 'Выберите подключение',
    useSaved: 'Сделать активным',
    editSaved: 'Изменить',
    removeSaved: 'Удалить',
    removeConnectionTitle: 'Удалить подключение?',
    removeConnectionHelp: 'Адрес и сохранённый пароль будут удалены только из расширения. Настройки роутера не изменятся. При удалении активного подключения другое не выбирается автоматически.',
    defaultListHelp: 'Сюда будут добавляться домены. На главном экране список можно менять для каждой операции.',
    rootDomainLabel: 'Корневой домен',
    domainInputLabel: 'Домен или URL',
    checkDomain: 'Проверить',
    domainFromTab: 'Из вкладки',
    enterDomain: 'Введите домен',
    domainNeedsCheck: 'Нажмите «Проверить»',
    invalidDomain: 'Введите домен',
    connectionInfo: 'Справка о подключении',
    listLabel: 'Список',
    chooseList: 'Выберите список',
    add: (list) => list ? 'Добавить в ' + list : 'Добавить',
    remove: (list) => list ? 'Удалить из ' + list : 'Удалить из списка',
    adding: 'Добавление…',
    removing: 'Удаление…',
    checking: 'Проверка…',
    connectionLabel: 'Подключение к keen-pbr',
    connectedSummary: 'Подключено',
    changeConnection: 'Изменить',
    cancelConnection: 'Отмена',
    connectionHelp: 'Web UI и API keen-pbr используют один адрес',
    savedConnections: 'Сохранённые подключения',
    newConnection: 'Другой адрес…',
    connectionScenario: 'HTTPS-адрес KeenDNS можно использовать и дома, и удалённо, если API доступен. Локальный адрес работает только в сети роутера или через VPN. Адреса переключаются вручную; пароль и список запоминаются отдельно для каждого.',
    authHelp: 'Это пароль keen-pbr, а не учётной записи Keenetic. Вход в открытой вкладке Web UI не заменяет вход расширения. Отдельная страница входа KeenDNS/прокси требует прямого доступа к API; её cookies расширение не использует.',
    openAddress: 'Открыть этот адрес',
    retryConnection: 'Проверить снова',
    useCurrentTab: 'Использовать текущую вкладку',
    useKeeneticOrigin: 'Использовать локальный адрес',
    openWebUi: 'Открыть Web UI keen-pbr',
    checkConnection: 'Подтвердить',
    authTitle: 'Вход в keen-pbr',
    passwordLabel: 'Пароль keen-pbr',
    rememberLabel: 'Запомнить на этом компьютере',
    rememberHelp: 'Пароль сохранится в профиле Chrome без синхронизации; программы с доступом к профилю смогут его прочитать.',
    httpWarning: 'По HTTP пароль передаётся без шифрования. Используйте доверенную сеть или HTTPS.',
    httpConsent: 'Подтверждаю передачу пароля на этот адрес по HTTP',
    connectAuth: 'Подключиться',
    forgetAuth: 'Забыть пароль',
    authSession: 'Пароль хранится до закрытия браузера',
    authLocal: 'Пароль сохранён в профиле Chrome',
    authConnected: 'Вход выполнен',
    authForgotten: 'Пароль удалён из расширения',
    defaultListLabel: 'Список по умолчанию',
    save: 'Сохранить и продолжить',
    settingsAction: 'Настройки',
    backAction: 'Назад',
    languageAction: 'Язык интерфейса',
    dismissConnectionResult: 'Закрыть результат проверки',
    ready: 'Готово к добавлению',
    otherListsLabel: 'Найдено в других списках:',
    membershipHelpLabel: 'Сведения о проверке списков',
    externalPartial: 'Перечень внешних совпадений неполный: API возвращает только первое совпадение в каждом правиле. Подписки здесь не редактируются.',
    externalUnavailable: 'Внешние источники проверить не удалось. Их отсутствие не подтверждено; нажмите «Проверить» ещё раз.',
    absentFromSelected: (_list) => 'Отсутствует в списке, доступно для добавления',
    defaultUnavailable:
      'Список по умолчанию недоступен. Выберите список для этой операции или измените настройку.',
    requestFailed: 'Не удалось выполнить запрос расширения',
    stateLoadFailed: 'Не удалось получить состояние расширения',
    unexpectedResponse: 'Получен неожиданный ответ расширения',
    invalidOrigin: 'Введите HTTP/HTTPS origin без пути, query и fragment',
    accessDenied: 'Доступ к адресу не предоставлен',
    settingsSaved: 'Настройки сохранены',
    oldPermissionRetained: 'Настройки сохранены, но разрешение для старого адреса осталось',
    languagePersistenceFailed: 'Не удалось сохранить язык интерфейса',
    connected: (version) => 'Подключено к keen-pbr ' + (version ?? '3.x'),
    routingConfirmed: (domain) => 'Маршрутизация подтверждена для ' + domain,
    appliedUnverified: (reason) =>
      'Сохранено и применено, но проверка пока не подтверждена: '
      + localReason('ru', reason),
    readyInOtherLists: (lists) =>
      'Готово к добавлению · уже есть в: ' + lists.join(', '),
    presentInSelected: (list) => 'Уже в списке ' + list,
    addedTo: (list) => 'Добавлено в ' + list,
    removedStillIn: (list, others) =>
      'Удалено из ' + list + ' · остаётся в: ' + others.join(', '),
    removedReady: (list) =>
      'Удалено из ' + list + ' · готово к добавлению',
    changedVerificationPending: (action, reason) =>
      (action === 'add' ? 'Добавлено' : 'Удалено')
      + ', но проверка пока не подтверждена: '
      + localReason('ru', reason),
    alreadyPresent: (list) => 'Домен уже находится в списке ' + list,
    draftBlocked: 'В keen-pbr уже есть несохранённый draft',
    listUnavailable: 'Выбранный список больше недоступен',
    saveUnknown: 'Не удалось подтвердить результат save; POST не повторялся',
    stageUncertain: (reason) =>
      'Ответ stage не получен; в keen-pbr мог остаться draft. POST не повторялся: '
      + localReason('ru', reason),
    writeFailed: (reason) =>
      'Сохранение или применение завершилось ошибкой; staged draft мог остаться: '
      + localReason('ru', reason),
    operationFailed: (reason) => 'Операция не выполнена: ' + localReason('ru', reason),
    backgroundFailure: (code, fallback, diagnostic) =>
      localBackgroundFailure('ru', code, fallback, diagnostic),
  },
  en: {
    mainTitle: 'Add to keen-pbr',
    settingsTitle: 'Settings',
    connectionsTitle: 'Connections',
    activeConnectionLabel: 'Active',
    noConnection: 'No active connection',
    addConnection: 'Add connection',
    chooseConnection: 'Choose a connection',
    useSaved: 'Make active',
    editSaved: 'Edit',
    removeSaved: 'Delete',
    removeConnectionTitle: 'Delete connection?',
    removeConnectionHelp: 'Only the address and saved password in this extension will be removed. Router settings stay unchanged. Deleting the active connection does not automatically select another one.',
    defaultListHelp: 'New domains go here. You can choose another list for each operation on the main screen.',
    rootDomainLabel: 'Root domain',
    domainInputLabel: 'Domain or URL',
    checkDomain: 'Check',
    domainFromTab: 'From tab',
    enterDomain: 'Enter a domain',
    domainNeedsCheck: 'Click Check',
    invalidDomain: 'Enter a domain',
    connectionInfo: 'Connection help',
    listLabel: 'List',
    chooseList: 'Choose a list',
    add: (list) => list ? 'Add to ' + list : 'Add',
    remove: (list) => list ? 'Remove from ' + list : 'Remove from list',
    adding: 'Adding…',
    removing: 'Removing…',
    checking: 'Checking…',
    connectionLabel: 'keen-pbr connection',
    connectedSummary: 'Connected',
    changeConnection: 'Change',
    cancelConnection: 'Cancel',
    connectionHelp: 'The keen-pbr Web UI and API use the same address',
    savedConnections: 'Saved connections',
    newConnection: 'Another address…',
    connectionScenario: 'A reachable KeenDNS HTTPS API can be used both at home and remotely. A local address needs the router network or a VPN. Switch addresses explicitly; credentials and default lists stay separate for each address.',
    authHelp: 'Use the keen-pbr password, not your Keenetic account. Signing into the Web UI does not sign the extension in. A separate KeenDNS/proxy login page needs direct API access; the extension does not use its cookies.',
    openAddress: 'Open this address',
    retryConnection: 'Check again',
    useCurrentTab: 'Use current tab',
    useKeeneticOrigin: 'Use local address',
    openWebUi: 'Open keen-pbr Web UI',
    checkConnection: 'Confirm',
    authTitle: 'Sign in to keen-pbr',
    passwordLabel: 'keen-pbr password',
    rememberLabel: 'Remember on this computer',
    rememberHelp: 'The password stays in this Chrome profile without sync; programs with profile access can read it.',
    httpWarning: 'HTTP sends the password without encryption. Use a trusted network or HTTPS.',
    httpConsent: 'I agree to send the password to this address over HTTP',
    connectAuth: 'Connect',
    forgetAuth: 'Forget password',
    authSession: 'Password stored until the browser closes',
    authLocal: 'Password saved in the Chrome profile',
    authConnected: 'Signed in',
    authForgotten: 'Password removed from the extension',
    defaultListLabel: 'Default list',
    save: 'Save and continue',
    settingsAction: 'Settings',
    backAction: 'Back',
    languageAction: 'Interface language',
    dismissConnectionResult: 'Dismiss connection result',
    ready: 'Ready to add',
    otherListsLabel: 'Found in other lists:',
    membershipHelpLabel: 'About list checks',
    externalPartial: 'External matches are incomplete: the API returns only the first match per rule. Subscriptions cannot be edited here.',
    externalUnavailable: 'Could not check external sources. Absence is not confirmed; click Check to retry.',
    absentFromSelected: (_list) => 'Not in this list, available to add',
    defaultUnavailable:
      'The default list is unavailable. Choose a list for this operation or change the setting.',
    requestFailed: 'Could not complete the extension request',
    stateLoadFailed: 'Could not load extension state',
    unexpectedResponse: 'Unexpected extension response',
    invalidOrigin: 'Enter an HTTP/HTTPS origin without a path, query, or fragment',
    accessDenied: 'Access to this address was not granted',
    settingsSaved: 'Settings saved',
    oldPermissionRetained: 'Settings saved, but access to the previous address remains',
    languagePersistenceFailed: 'Could not save the interface language',
    connected: (version) => 'Connected to keen-pbr ' + (version ?? '3.x'),
    routingConfirmed: (domain) => 'Routing confirmed for ' + domain,
    appliedUnverified: (reason) =>
      'Saved and applied, but verification is not confirmed yet: '
      + localReason('en', reason),
    readyInOtherLists: (lists) =>
      'Ready to add · already in: ' + lists.join(', '),
    presentInSelected: (list) => 'Already in ' + list,
    addedTo: (list) => 'Added to ' + list,
    removedStillIn: (list, others) =>
      'Removed from ' + list + ' · still in: ' + others.join(', '),
    removedReady: (list) =>
      'Removed from ' + list + ' · ready to add',
    changedVerificationPending: (action, reason) =>
      (action === 'add' ? 'Added' : 'Removed')
      + ', but verification is not confirmed yet: '
      + localReason('en', reason),
    alreadyPresent: (list) => 'The domain is already in list ' + list,
    draftBlocked: 'keen-pbr already has an unsaved draft',
    listUnavailable: 'The selected list is no longer available',
    saveUnknown: 'Could not confirm the save result; POST was not retried',
    stageUncertain: (reason) =>
      'The stage response was not received; keen-pbr may retain a draft. '
      + 'POST was not retried: ' + localReason('en', reason),
    writeFailed: (reason) =>
      'Save or apply failed; a staged draft may remain: ' + localReason('en', reason),
    operationFailed: (reason) => 'Operation failed: ' + localReason('en', reason),
    backgroundFailure: (code, fallback, diagnostic) =>
      localBackgroundFailure('en', code, fallback, diagnostic),
  },
};

export function getPopupCopy(language: UiLanguage): PopupCopy {
  return copies[language];
}
