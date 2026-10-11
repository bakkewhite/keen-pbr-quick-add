export interface SettingsV1 {
  version: 1;
  apiOrigin: string;
  defaultList: string;
}

export type SavedConnection = Pick<SettingsV1, 'apiOrigin' | 'defaultList'>;

export interface StoragePort {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  setMany(values: Record<string, unknown>): Promise<void>;
}

const SETTINGS_KEY = 'settings.v1';
const CONNECTIONS_KEY = 'connections.v1';

export function normalizeApiOrigin(input: string): string {
  const url = new URL(input.trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('API address must use HTTP or HTTPS');
  }
  if (url.username || url.password) {
    throw new Error('Credentials are not allowed in the API address');
  }
  const suffix = url.href.slice(url.origin.length);
  if (suffix !== '/') {
    throw new Error('API address must contain origin only');
  }
  return url.origin;
}

export class SettingsStore {
  constructor(private readonly storage: StoragePort) {}

  async connections(): Promise<SavedConnection[]> {
    const raw = await this.storage.get(CONNECTIONS_KEY);
    const active = await this.load();
    const result: SavedConnection[] = [];
    for (const value of [active, ...(Array.isArray(raw) ? raw : [])]) {
      if (!value || typeof value.apiOrigin !== 'string' || typeof value.defaultList !== 'string') continue;
      try {
        const apiOrigin = normalizeApiOrigin(value.apiOrigin);
        if (!result.some((item) => item.apiOrigin === apiOrigin)) {
          result.push({ apiOrigin, defaultList: value.defaultList });
        }
      } catch { /* Ignore malformed saved addresses. */ }
    }
    return result;
  }

  async load(): Promise<SettingsV1 | null> {
    const value = await this.storage.get(SETTINGS_KEY);
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Partial<SettingsV1>;
    if (
      candidate.version !== 1
      || typeof candidate.apiOrigin !== 'string'
      || typeof candidate.defaultList !== 'string'
    ) return null;
    try {
      return {
        version: 1,
        apiOrigin: normalizeApiOrigin(candidate.apiOrigin),
        defaultList: candidate.defaultList,
      };
    } catch {
      return null;
    }
  }

  async save(settings: SettingsV1): Promise<void> {
    const apiOrigin = normalizeApiOrigin(settings.apiOrigin);
    const previous = await this.connections();
    await this.storage.setMany({ [CONNECTIONS_KEY]: [
      { apiOrigin, defaultList: settings.defaultList },
      ...previous.filter((item) => item.apiOrigin !== apiOrigin),
    ], [SETTINGS_KEY]: {
      version: 1,
      apiOrigin,
      defaultList: settings.defaultList,
    } });
  }

  async remove(input: string): Promise<void> {
    const origin = normalizeApiOrigin(input);
    const [active, profiles] = await Promise.all([this.load(), this.connections()]);
    await this.storage.setMany({
      [CONNECTIONS_KEY]: profiles.filter(p => p.apiOrigin !== origin),
      ...(active?.apiOrigin === origin ? { [SETTINGS_KEY]: null } : {}),
    });
  }
}
