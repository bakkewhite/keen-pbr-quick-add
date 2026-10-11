import { KeenPbrApiError, KeenPbrClient } from './api';
import { AuthStore, AuthSupersededError, basicAuthorization } from './auth';
import { deriveApiOriginCandidate } from './api-origin-candidate';
import {
  chromeHostPermissionPort,
  chromeLocalAuthArea,
  chromeSessionAuthArea,
  chromeStoragePort,
  chromeTabsPort,
  type TabsPort,
} from './chrome-adapter';
import {
  getDomainMemberships,
  getEligibleDomainLists,
} from './config';
import { deriveDomainInput } from './domain';
import { inspectMemberships } from './membership-inspection';
import {
  isPopupRequest,
  type BackgroundResponse,
} from './messages';
import {
  mutateDomainList,
  type OperationApi,
} from './operation';
import {
  toHostPattern,
  type HostPermissionPort,
} from './permissions';
import {
  normalizeApiOrigin,
  SettingsStore,
} from './settings';

export interface BackgroundDependencies {
  tabs: TabsPort;
  settings: Pick<SettingsStore, 'load' | 'save' | 'connections' | 'remove'>;
  permissions: HostPermissionPort;
  clientFor(origin: string): OperationApi;
  authClientFor(origin: string, authorization: string): OperationApi;
  authStatusFor(origin: string): Promise<{ enabled: boolean }>;
  auth: Pick<AuthStore, 'get' | 'mode' | 'save' | 'forget' | 'forgetIfMatching' | 'generation'>;
  mutateDomain: typeof mutateDomainList;
}

class PublicError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

function failure(
  code: string,
  message: string,
  diagnostic?: string,
): BackgroundResponse {
  return diagnostic
    ? { ok: false, code, message, diagnostic }
    : { ok: false, code, message };
}

function normalizeOrigin(value: string): string {
  try {
    return normalizeApiOrigin(value);
  } catch {
    throw new PublicError(
      'INVALID_API_ORIGIN',
      'Введите HTTP/HTTPS origin API без пути',
    );
  }
}

async function requirePermission(
  permissions: HostPermissionPort,
  origin: string,
): Promise<void> {
  if (!await permissions.contains(toHostPattern(origin))) {
    throw new PublicError(
      'HOST_PERMISSION_REQUIRED',
      'Предоставьте доступ к адресу API',
    );
  }
}

function supportedVersion(value: unknown): value is string {
  return typeof value === 'string'
    && /^3\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value);
}

async function inspectApi(api: OperationApi): Promise<{
  lists: string[];
  version: string;
}> {
  const version = await requireCompatibleApi(api);
  const envelope = await api.getConfig();
  return {
    lists: getEligibleDomainLists(envelope.config).map(({ name }) => name),
    version,
  };
}

async function requireCompatibleApi(api: OperationApi): Promise<string> {
  const health = await api.getServiceHealth();
  if (!supportedVersion(health.version)) {
    throw new PublicError(
      'API_INCOMPATIBLE',
      'Требуется совместимый API keen-pbr 3.x',
    );
  }
  return health.version;
}

function mapError(error: unknown): BackgroundResponse {
  if (error instanceof PublicError) {
    return failure(error.code, error.message);
  }
  if (error instanceof KeenPbrApiError) {
    if (error.kind === 'gateway-auth') {
      return failure('API_GATEWAY_AUTH', 'Адрес вернул веб-страницу вместо API. Проверьте адрес keen-pbr и отдельный вход KeenDNS/прокси.');
    }
    if (error.kind === 'auth') {
      if (error.status === 403) {
        return failure('API_FORBIDDEN', 'API отказал в доступе (403); проверьте адрес и разрешения');
      }
      return failure(
        'API_AUTH_REQUIRED',
        'Требуется пароль keen-pbr',
      );
    }
    if (error.kind === 'protocol') {
      return failure('API_INCOMPATIBLE', 'Неожиданный ответ API keen-pbr');
    }
    if (error.kind === 'conflict') {
      return failure(
        'API_BUSY',
        'В keen-pbr есть draft или выполняется другая операция',
      );
    }
    if (error.kind === 'network' || error.kind === 'timeout') {
      const diagnostic = [error.kind, error.diagnostic]
        .filter((value): value is string => Boolean(value))
        .join('; ');
      return failure(
        'API_UNAVAILABLE',
        'API keen-pbr недоступен [' + diagnostic + ']',
        diagnostic,
      );
    }
    return failure('API_ERROR', 'Ошибка запроса к API keen-pbr');
  }
  return failure('INTERNAL_ERROR', 'Операция не выполнена');
}

export function createBackgroundHandler(
  deps: BackgroundDependencies,
): (message: unknown) => Promise<BackgroundResponse> {
  return async (message: unknown): Promise<BackgroundResponse> => {
    if (!isPopupRequest(message)) {
      return failure('INVALID_MESSAGE', 'Запрос отклонён');
    }

    let requestOrigin: string | null = null;
    try {
      if (message.type === 'GET_CONNECTIONS') {
        const connections = await deps.settings.connections();
        return { ok: true, type: 'CONNECTIONS', connections: await Promise.all(connections.map(async (connection) => ({
          ...connection, authMode: await deps.auth.mode(connection.apiOrigin).catch(() => null),
        }))) };
      }
      if (message.type === 'GET_LOCAL_STATE') {
        const settings = await deps.settings.load();
        let authMode: 'session' | 'local' | null = null;
        if (settings) {
          try {
            authMode = await deps.auth.mode(settings.apiOrigin);
          } catch {
            // Keep the saved origin visible even if secret storage is unavailable.
          }
        }
        return {
          ok: true,
          type: 'LOCAL_STATE',
          apiOrigin: settings?.apiOrigin ?? null,
          defaultList: settings?.defaultList ?? null,
          authMode,
        };
      }

      if (message.type === 'REMOVE_CONNECTION') {
        const origin = normalizeOrigin(message.apiOrigin);
        try { await deps.auth.forget(origin); }
        catch { throw new PublicError('AUTH_FORGET_FAILED', 'Не удалось удалить сохранённый пароль'); }
        try { await deps.settings.remove(origin); }
        catch { throw new PublicError('CONNECTION_REMOVE_FAILED', 'Не удалось удалить подключение'); }
        return { ok: true, type: 'CONNECTION_REMOVED' };
      }

      if (message.type === 'AUTH_FORGET') {
        const origin = normalizeOrigin(message.apiOrigin);
        try {
          await deps.auth.forget(origin);
        } catch {
          throw new PublicError('AUTH_FORGET_FAILED', 'Не удалось удалить сохранённый пароль');
        }
        return { ok: true, type: 'AUTH_FORGOTTEN' };
      }

      if (message.type === 'AUTH_CONNECT') {
        const origin = normalizeOrigin(message.apiOrigin);
        if (!message.password) {
          throw new PublicError('PASSWORD_REQUIRED', 'Введите пароль keen-pbr');
        }
        if (origin.startsWith('http://') && !message.allowInsecureHttp) {
          throw new PublicError(
            'INSECURE_HTTP_CONSENT_REQUIRED',
            'Подтвердите передачу пароля по HTTP без шифрования',
          );
        }
        await requirePermission(deps.permissions, origin);
        const authStatus = await deps.authStatusFor(origin);
        if (!authStatus.enabled) throw new PublicError('API_AUTH_UNAVAILABLE', 'По этому адресу пароль API не требуется. Проверьте подключение без пароля.');
        const authorization = basicAuthorization(message.password);
        const generation = deps.auth.generation(origin);
        try {
          await requireCompatibleApi(deps.authClientFor(origin, authorization));
        } catch (error) {
          if (error instanceof KeenPbrApiError && error.kind === 'auth' && error.status === 401) {
            throw new PublicError('AUTH_INVALID_PASSWORD', 'Пароль не принят keen-pbr');
          }
          throw error;
        }
        try {
          await deps.auth.save(
            origin, authorization, message.remember, message.allowInsecureHttp,
            generation,
          );
        } catch (error) {
          if (error instanceof AuthSupersededError) {
            throw new PublicError('AUTH_CANCELLED', 'Вход был отменён');
          }
          throw new PublicError('AUTH_STORAGE_FAILED', 'Не удалось безопасно сохранить пароль');
        }
        return {
          ok: true,
          type: 'AUTH_CONNECTED',
          mode: message.remember ? 'local' : 'session',
        };
      }

      if (message.type === 'CHECK_SETTINGS') {
        const origin = normalizeOrigin(message.apiOrigin);
        requestOrigin = origin;
        await requirePermission(deps.permissions, origin);
        const inspected = await inspectApi(deps.clientFor(origin));
        return {
          ok: true,
          type: 'CONNECTION',
          lists: inspected.lists,
          version: inspected.version,
        };
      }

      if (message.type === 'SAVE_SETTINGS') {
        const origin = normalizeOrigin(message.apiOrigin);
        requestOrigin = origin;
        await requirePermission(deps.permissions, origin);
        const inspected = await inspectApi(deps.clientFor(origin));
        if (!inspected.lists.includes(message.defaultList)) {
          throw new PublicError(
            'DEFAULT_LIST_UNAVAILABLE',
            'Выбранный список по умолчанию недоступен',
          );
        }
        await deps.settings.save({
          version: 1,
          apiOrigin: origin,
          defaultList: message.defaultList,
        });
        return {
          ok: true,
          type: 'SETTINGS_SAVED',
          oldPermissionRemoved: false,
        };
      }

      const settings = await deps.settings.load();
      requestOrigin = settings?.apiOrigin ?? null;
      if (!settings) {
        if (message.type === 'GET_CONTEXT') {
          let apiOriginCandidate: string | null = null;
          try {
            apiOriginCandidate = deriveApiOriginCandidate(await deps.tabs.getActive());
          } catch {
            // A tab URL is only an optional setup suggestion.
          }
          return {
            ok: true,
            type: 'SETUP_CONTEXT',
            apiOriginCandidate,
          };
        }
        throw new PublicError('SETUP_REQUIRED', 'Откройте настройки расширения');
      }

      let domain: string | null = null;
      let tabDomain: string | null = null;
      const manual = message.type === 'GET_CONTEXT' ? message.domainInput
        : message.type === 'MUTATE_DOMAIN' ? message.domain : undefined;
      if (manual !== undefined) {
        const result = deriveDomainInput(manual);
        if (!result.ok) throw new PublicError('INVALID_DOMAIN', 'Введите публичный домен или HTTP/HTTPS-адрес без логина и пароля');
        domain = result.domain;
      }
      if (manual === undefined || message.type === 'GET_CONTEXT') {
        try {
          const result = deriveDomainInput((await deps.tabs.getActive()).url);
          if (result.ok) {
            tabDomain = result.domain;
            if (manual === undefined) domain = result.domain;
          }
        } catch { /* A restricted tab can still use manual input. */ }
      }
      if (message.type === 'MUTATE_DOMAIN' && !domain) {
        throw new PublicError('INVALID_DOMAIN', 'Введите домен и проверьте его перед добавлением');
      }

      const origin = normalizeOrigin(settings.apiOrigin);
      if ((message.type === 'GET_CONTEXT' || message.type === 'MUTATE_DOMAIN')
        && message.expectedOrigin && message.expectedOrigin !== origin) {
        throw new PublicError('CONNECTION_CHANGED', 'Подключение изменилось. Обновите состояние перед добавлением домена.');
      }
      await requirePermission(deps.permissions, origin);
      const api = deps.clientFor(origin);

      if (message.type === 'MUTATE_DOMAIN') {
        if (message.expectedOrigin && message.expectedOrigin !== origin) {
          throw new PublicError('CONNECTION_CHANGED', 'Подключение изменилось. Обновите состояние перед добавлением домена.');
        }
        return {
          ok: true,
          type: 'MUTATION_RESULT',
          result: await deps.mutateDomain(api, {
            action: message.action,
            list: message.list,
            domain: domain as string,
          }),
        };
      }

      const envelope = await api.getConfig();
      const eligibleLists = getEligibleDomainLists(envelope.config);
      return {
        ok: true,
        type: 'CONTEXT',
        domain,
        tabDomain,
        lists: eligibleLists.map(({ name }) => name),
        memberships: domain ? getDomainMemberships(
          envelope.config,
          domain,
        ) : [],
        ...(domain ? { membershipInspection: await inspectMemberships(api, envelope.config, domain) } : {}),
        defaultList: settings.defaultList,
        apiOrigin: origin,
      };
    } catch (error) {
      if (error instanceof KeenPbrApiError && error.kind === 'auth' && error.status === 401 && requestOrigin) {
        try {
          if (!(await deps.authStatusFor(requestOrigin)).enabled) {
            return failure('API_ACCESS_RESTRICTED', 'Пароль keen-pbr отключён, но адрес отказал в доступе к API. Проверьте KeenDNS/прокси и разрешения API.');
          }
        } catch (statusError) { return mapError(statusError); }
      }
      return mapError(error);
    }
  };
}

const settings = new SettingsStore(chromeStoragePort);
const auth = new AuthStore(chromeSessionAuthArea, chromeLocalAuthArea);
const realDependencies: BackgroundDependencies = {
  tabs: chromeTabsPort,
  settings,
  auth,
  permissions: chromeHostPermissionPort,
  clientFor: (origin) => new KeenPbrClient(
    origin,
    fetch,
    7000,
    async () => {
      const credential = await auth.get(origin);
      return origin.startsWith('http://') && !credential?.allowInsecureHttp
        ? null
        : credential;
    },
    async (credential) => {
      if (credential.id) await auth.forgetIfMatching(origin, credential.id);
    },
  ),
  authClientFor: (origin, authorization) => new KeenPbrClient(
    origin, fetch, 7000, async () => authorization,
  ),
  authStatusFor: (origin) => new KeenPbrClient(origin).getAuthStatus(),
  mutateDomain: mutateDomainList,
};

export function registerBackgroundRuntime(
  handler = createBackgroundHandler(realDependencies),
): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) {
      sendResponse(failure('UNTRUSTED_SENDER', 'Запрос отклонён'));
      return false;
    }
    if (
      (message?.type === 'AUTH_CONNECT' || message?.type === 'AUTH_FORGET'
        || message?.type === 'REMOVE_CONNECTION' || message?.type === 'MUTATE_DOMAIN' || message?.type === 'SAVE_SETTINGS')
      && sender.url !== chrome.runtime.getURL('popup.html')
    ) {
      sendResponse(failure('UNTRUSTED_SENDER', 'Запрос отклонён'));
      return false;
    }
    void handler(message)
      .then(sendResponse)
      .catch(() => sendResponse(failure('INTERNAL_ERROR', 'Операция не выполнена')));
    return true;
  });
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  registerBackgroundRuntime();
}
