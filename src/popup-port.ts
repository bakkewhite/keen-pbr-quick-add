import { parseUiLanguage, UI_LANGUAGE_STORAGE_KEY, type UiLanguage } from './i18n';
import type { BackgroundResponse, PopupRequest } from './messages';
import { toHostPattern } from './permissions';
import { normalizeApiOrigin } from './settings';

export interface PopupPort {
  send(request: PopupRequest): Promise<BackgroundResponse>;
  requestOriginPermission(origin: string): Promise<boolean>;
  hasOriginPermission(origin: string): Promise<boolean>;
  loadPendingOrigin(): string | null;
  savePendingOrigin(origin: string | null): void;
  loadPendingCredential(): string | null;
  savePendingCredential(origin: string | null): void;
  prepareLocalNetworkAccess(origin: string): Promise<void>;
  loadLanguage(): Promise<UiLanguage>;
  saveLanguage(language: UiLanguage): Promise<void>;
}

export const PENDING_ORIGIN_KEY = 'connection.pending-origin.v1';
export const PENDING_CREDENTIAL_KEY = 'connection.pending-credential-origin.v1';

export const realPopupPort: PopupPort = {
  send: async (request) => await chrome.runtime.sendMessage(request) as BackgroundResponse,
  requestOriginPermission: (origin) => chrome.permissions.request({ origins: [toHostPattern(origin)] }),
  hasOriginPermission: (origin) => chrome.permissions.contains({ origins: [toHostPattern(origin)] }),
  // Synchronous, origin-only checkpoint survives popup closure during Chrome's prompt.
  // Credentials and actual settings remain in the existing chrome.storage stores.
  loadPendingOrigin: () => localStorage.getItem(PENDING_ORIGIN_KEY),
  savePendingOrigin: (origin) => {
    if (origin === null) localStorage.removeItem(PENDING_ORIGIN_KEY);
    else localStorage.setItem(PENDING_ORIGIN_KEY, normalizeApiOrigin(origin));
  },
  // Origin-only ownership marker; the credential itself never enters localStorage.
  loadPendingCredential: () => localStorage.getItem(PENDING_CREDENTIAL_KEY),
  savePendingCredential: (origin) => {
    if (origin === null) localStorage.removeItem(PENDING_CREDENTIAL_KEY);
    else localStorage.setItem(PENDING_CREDENTIAL_KEY, normalizeApiOrigin(origin));
  },
  prepareLocalNetworkAccess: async (origin) => {
    await fetch(origin + '/api/health/service', {
      method: 'GET', cache: 'no-store', credentials: 'omit', redirect: 'error',
      signal: AbortSignal.timeout(7000),
    });
  },
  loadLanguage: async () => {
    const stored = await chrome.storage.local.get(UI_LANGUAGE_STORAGE_KEY);
    return parseUiLanguage(stored[UI_LANGUAGE_STORAGE_KEY]);
  },
  saveLanguage: async (language) => {
    await chrome.storage.local.set({ [UI_LANGUAGE_STORAGE_KEY]: language });
  },
};
