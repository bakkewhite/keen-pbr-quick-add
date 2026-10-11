import type { HostPermissionPort } from './permissions';
import type { StoragePort } from './settings';
import type { AuthArea } from './auth';

export interface ActiveTab {
  id: number;
  url: string;
  title: string;
}

export interface TabsPort {
  getActive(): Promise<ActiveTab>;
}

export const chromeStoragePort: StoragePort = {
  async get(key) {
    const result = await chrome.storage.local.get(key);
    return result[key];
  },
  async set(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },
  async setMany(values) {
    await chrome.storage.local.set(values);
  },
};

function authArea(name: 'session' | 'local'): AuthArea {
  const area = () => chrome.storage[name];
  return {
    async get(key) {
      const values = await area().get(key);
      return values[key];
    },
    set: (key, value) => area().set({ [key]: value }),
    remove: (key) => area().remove(key),
    restrict: () => area().setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  };
}

export const chromeSessionAuthArea = authArea('session');
export const chromeLocalAuthArea = authArea('local');

export const chromeHostPermissionPort: HostPermissionPort = {
  contains: (pattern) => chrome.permissions.contains({ origins: [pattern] }),
  request: (pattern) => chrome.permissions.request({ origins: [pattern] }),
  remove: (pattern) => chrome.permissions.remove({ origins: [pattern] }),
};

export const chromeTabsPort: TabsPort = {
  async getActive() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined || !tab.url) throw new Error('Active tab is unavailable');
    return { id: tab.id, url: tab.url, title: tab.title ?? '' };
  },
};
