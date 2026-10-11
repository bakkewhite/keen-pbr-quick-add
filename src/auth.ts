export type AuthMode = 'session' | 'local';

export class AuthSupersededError extends Error {}

export interface AuthArea {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  restrict(): Promise<void>;
}

interface StoredCredential {
  id: string;
  authorization: string;
  allowInsecureHttp: boolean;
}

export function basicAuthorization(password: string): string {
  const bytes = new TextEncoder().encode('admin:' + password);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return 'Basic ' + btoa(binary);
}

function isCredential(value: unknown): value is StoredCredential {
  return !!value && typeof value === 'object'
    && typeof (value as StoredCredential).id === 'string'
    && typeof (value as StoredCredential).authorization === 'string'
    && (value as StoredCredential).authorization.startsWith('Basic ')
    && typeof (value as StoredCredential).allowInsecureHttp === 'boolean';
}

export class AuthStore {
  private restriction: Promise<void> | null = null;
  private readonly blocked = new Set<string>();
  private readonly generations = new Map<string, number>();
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly session: AuthArea,
    private readonly local: AuthArea,
  ) {}

  private ready(): Promise<void> {
    this.restriction ??= Promise.all([
      this.session.restrict(),
      this.local.restrict(),
    ]).then(() => undefined);
    return this.restriction;
  }

  private key(origin: string): string {
    return 'auth.v1.' + encodeURIComponent(origin);
  }

  generation(origin: string): number {
    return this.generations.get(origin) ?? 0;
  }

  private async queue<T>(origin: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(origin) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(task);
    this.queues.set(origin, current);
    try {
      return await current;
    } finally {
      if (this.queues.get(origin) === current) this.queues.delete(origin);
    }
  }

  async get(origin: string): Promise<(StoredCredential & { mode: AuthMode }) | null> {
    await this.ready();
    if (this.blocked.has(origin)) return null;
    const key = this.key(origin);
    const session = await this.session.get(key);
    if (this.blocked.has(origin)) return null;
    if (isCredential(session)) return { ...session, mode: 'session' };
    const local = await this.local.get(key);
    if (this.blocked.has(origin)) return null;
    return isCredential(local) ? { ...local, mode: 'local' } : null;
  }

  async mode(origin: string): Promise<AuthMode | null> {
    return (await this.get(origin))?.mode ?? null;
  }

  async save(
    origin: string,
    authorization: string,
    remember: boolean,
    allowInsecureHttp: boolean,
    expectedGeneration = this.generation(origin),
  ): Promise<void> {
    await this.queue(origin, async () => {
      await this.ready();
      if (expectedGeneration !== this.generation(origin)) {
        throw new AuthSupersededError('Authentication attempt was superseded');
      }
      const key = this.key(origin);
      try {
        await this.session.remove(key);
        await this.local.remove(key);
        const area = remember ? this.local : this.session;
        await area.set(key, {
          id: crypto.randomUUID(), authorization, allowInsecureHttp,
        } satisfies StoredCredential);
        if (expectedGeneration !== this.generation(origin)) {
          throw new AuthSupersededError('Authentication attempt was superseded');
        }
        this.blocked.delete(origin);
      } catch (error) {
        this.blocked.add(origin);
        try {
          await Promise.all([this.session.remove(key), this.local.remove(key)]);
        } catch {
          // Keep this origin blocked in memory when disk cleanup is uncertain.
        }
        throw error;
      }
    });
  }

  async forget(origin: string): Promise<void> {
    this.blocked.add(origin);
    this.generations.set(origin, this.generation(origin) + 1);
    await this.queue(origin, async () => {
      await this.ready();
      const key = this.key(origin);
      await Promise.all([this.session.remove(key), this.local.remove(key)]);
    });
  }

  async forgetIfMatching(origin: string, id: string): Promise<boolean> {
    return this.queue(origin, async () => {
      await this.ready();
      const key = this.key(origin);
      const session = await this.session.get(key);
      const local = await this.local.get(key);
      const current = isCredential(session) ? session : local;
      if (!isCredential(current) || current.id !== id) return false;
      this.blocked.add(origin);
      await Promise.all([this.session.remove(key), this.local.remove(key)]);
      return true;
    });
  }
}
