import { expect, it, vi } from 'vitest';
import { KeenPbrApiError } from '../src/api';
import { createBackgroundHandler, registerBackgroundRuntime } from '../src/background';
import { makeConfig } from './fixtures/config';
import { mutateDomainList } from '../src/operation';

function makeDeps() {
  const api = {
    getConfig: vi.fn().mockResolvedValue({
      config: makeConfig(),
      is_draft: false,
    }),
    getServiceHealth: vi.fn().mockResolvedValue({
      status: 'running',
      version: '3.1.1',
    }),
    stageConfig: vi.fn().mockResolvedValue({ status: 'ok' }),
    saveConfig: vi.fn().mockResolvedValue({
      saved: true,
      applied: true,
      rolled_back: false,
    }),
    getRoutingHealth: vi.fn().mockResolvedValue({ overall: 'ok' }),
    testRouting: vi.fn().mockResolvedValue({ results: [{ ok: true }] }),
  };
  return {
    tabs: {
      getActive: vi.fn().mockResolvedValue({
        id: 7,
        url: 'https://www.example.com/path',
        title: 'Example',
      }),
    },
    settings: {
      remove: vi.fn().mockResolvedValue(undefined),
      connections: vi.fn().mockResolvedValue([]),
      load: vi.fn().mockResolvedValue({
        version: 1,
        apiOrigin: 'http://192.168.1.1:12121',
        defaultList: 'local',
      }),
      save: vi.fn().mockResolvedValue(undefined),
    },
    permissions: {
      contains: vi.fn().mockResolvedValue(true),
      request: vi.fn(),
      remove: vi.fn().mockResolvedValue(true),
    },
    clientFor: vi.fn().mockReturnValue(api),
    auth: {
      get: vi.fn().mockResolvedValue(null),
      mode: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      forget: vi.fn().mockResolvedValue(undefined),
      forgetIfMatching: vi.fn().mockResolvedValue(false),
      generation: vi.fn().mockReturnValue(0),
    },
    authClientFor: vi.fn().mockReturnValue(api),
    authStatusFor: vi.fn().mockResolvedValue({ enabled: true }),
    mutateDomain: vi.fn().mockResolvedValue({
      status: 'applied-and-verified',
      action: 'add',
      list: 'local',
      domain: 'example.com',
      memberships: ['local'],
    }),
    api,
  };
}

it('loads router lists on a blank tab and leaves the domain empty', async () => {
  const deps = makeDeps();
  deps.tabs.getActive.mockResolvedValue({ id: 7, url: 'chrome://newtab/', title: '' });
  expect(await createBackgroundHandler(deps)({ type: 'GET_CONTEXT' })).toMatchObject({
    ok: true, type: 'CONTEXT', domain: null, tabDomain: null, lists: ['google_ai', 'local'],
  });
  expect(deps.mutateDomain).not.toHaveBeenCalled();
  expect(deps.api.testRouting).not.toHaveBeenCalled();
});
it.each([
  ['https://gemini.google.com/app?hl=ru#chat', 'gemini.google.com'],
  ['https://www.youtube.com/watch?v=example', 'youtube.com'],
  ['https://www.gemini.google.com/app', 'gemini.google.com'],
  ['https://www.www.gemini.google.com/app', 'gemini.google.com'],
  ['https://www2.google.com/app', 'www2.google.com'],
  ['https://youtube.com/feed/subscriptions', 'youtube.com'],
])('preserves real subdomains for context and implicit mutation: %s', async (url, domain) => {
  const deps = makeDeps();
  deps.tabs.getActive.mockResolvedValue({ id: 7, url, title: '' });
  const config = makeConfig();
  config.lists.local!.domains = ['google.com', 'docs.google.com'];
  config.lists.google_ai!.domains = [domain];
  deps.api.getConfig.mockResolvedValue({ config, is_draft: false });
  const handle = createBackgroundHandler(deps);
  expect(await handle({ type: 'GET_CONTEXT' })).toMatchObject({
    domain, tabDomain: domain, memberships: ['google_ai'],
  });
  expect(await handle({ type: 'GET_CONTEXT', domainInput: 'openai.com/page' })).toMatchObject({
    domain: 'openai.com', tabDomain: domain,
  });
  for (const action of ['add', 'remove'] as const) {
    await handle({ type: 'MUTATE_DOMAIN', action, list: 'local' });
    expect(deps.mutateDomain).toHaveBeenLastCalledWith(deps.api, { action, list: 'local', domain });
  }
});
it('reads fresh membership evidence on every popup request rather than reusing a previous tab result', async () => {
  const deps = makeDeps();
  deps.tabs.getActive.mockResolvedValue({ id: 7, url: 'https://www.youtube.com/watch?v=example', title: 'YouTube' });
  const inline = makeConfig(); inline.lists.local!.domains = ['youtube.com'];
  const external = makeConfig();
  deps.api.getConfig.mockResolvedValueOnce({ config: inline, is_draft: false })
    .mockResolvedValueOnce({ config: external, is_draft: false });
  deps.api.testRouting.mockImplementation(async () => ({ target: 'youtube.com', is_domain: true,
    rule_diagnostics: [{ target_in_lists: true, target_match: { list: 'remote_domains', via: 'youtube.com' } }],
    results: [{ ok: true }] }));
  const handle = createBackgroundHandler(deps);
  expect(await handle({ type: 'GET_CONTEXT' })).toMatchObject({ type: 'CONTEXT', domain: 'youtube.com',
    memberships: ['local'], membershipInspection: { matchedLists: ['remote_domains'], status: 'partial' } });
  expect(await handle({ type: 'GET_CONTEXT', domainInput: 'youtube.com' })).toMatchObject({ type: 'CONTEXT',
    domain: 'youtube.com', memberships: [], membershipInspection: { matchedLists: ['remote_domains'], status: 'partial' } });
  expect(deps.api.stageConfig).not.toHaveBeenCalled();
  expect(deps.api.saveConfig).not.toHaveBeenCalled();
});

it('does not ask for a keen-pbr password when auth is disabled but the address returns 401', async () => {
  const deps = makeDeps();
  deps.api.getServiceHealth.mockRejectedValue(new KeenPbrApiError('auth', 'Access denied', 401));
  deps.authStatusFor.mockResolvedValue({ enabled: false });
  expect(await createBackgroundHandler(deps)({ type: 'CHECK_SETTINGS', apiOrigin: 'https://router.example' }))
    .toMatchObject({ ok: false, code: 'API_ACCESS_RESTRICTED' });
});

it('deletes a connection locally without touching router configuration', async () => {
  const deps = makeDeps();
  expect(await createBackgroundHandler(deps)({ type: 'REMOVE_CONNECTION', apiOrigin: 'https://router.example' }))
    .toMatchObject({ ok: true, type: 'CONNECTION_REMOVED' });
  expect(deps.auth.forget).toHaveBeenCalledExactlyOnceWith('https://router.example');
  expect(deps.settings.remove).toHaveBeenCalledExactlyOnceWith('https://router.example');
  expect(deps.api.stageConfig).not.toHaveBeenCalled();
  expect(deps.api.saveConfig).not.toHaveBeenCalled();
});

it('a credential deletion failure preserves the profile', async () => {
  const deps = makeDeps(); deps.auth.forget.mockRejectedValue(new Error('storage'));
  expect(await createBackgroundHandler(deps)({ type: 'REMOVE_CONNECTION', apiOrigin: 'https://router.example' }))
    .toMatchObject({ ok: false, code: 'AUTH_FORGET_FAILED' });
  expect(deps.settings.remove).not.toHaveBeenCalled();
});
it('a gateway page during password validation is not labeled an invalid keen-pbr password', async () => {
  const deps = makeDeps(); deps.api.getServiceHealth.mockRejectedValue(new KeenPbrApiError('gateway-auth', 'Sign in', 401));
  expect(await createBackgroundHandler(deps)({ type: 'AUTH_CONNECT', apiOrigin: 'https://router.example', password: 'test-only', remember: false, allowInsecureHttp: false }))
    .toMatchObject({ ok: false, code: 'API_GATEWAY_AUTH' });
  expect(deps.auth.save).not.toHaveBeenCalled();
});

it('keeps the tab domain separate from a manually checked domain', async () => {
  const deps = makeDeps();
  expect(await createBackgroundHandler(deps)({ type: 'GET_CONTEXT', domainInput: 'openai.com/path' })).toMatchObject({
    ok: true, domain: 'openai.com', tabDomain: 'example.com',
  });
});

it.each(['https://gemini.google.com/app', 'https://www.www.gemini.google.com/app'])(
  'checks and adds/removes only the requested subdomain, never its parent or siblings: %s', async (domainInput) => {
  const deps = makeDeps();
  let config = makeConfig();
  config.lists.local!.domains = ['google.com', 'docs.google.com'];
  config.lists.google_ai!.domains = ['gemini.google.com'];
  deps.api.getConfig.mockImplementation(async () => ({ config, is_draft: false }));
  deps.api.stageConfig.mockImplementation(async (next) => {
    config = next;
    return { status: 'ok' };
  });
  deps.api.getServiceHealth.mockResolvedValue({
    status: 'running', version: '3.3.1', config_is_draft: false,
    resolver_config_hash: 'test-hash', resolver_config_hash_actual: 'test-hash',
  });
  deps.mutateDomain.mockImplementation(mutateDomainList);
  const handle = createBackgroundHandler(deps);
  expect(await handle({ type: 'GET_CONTEXT', domainInput }))
    .toMatchObject({ domain: 'gemini.google.com', memberships: ['google_ai'] });
  expect(deps.api.stageConfig).not.toHaveBeenCalled();
  expect(await handle({ type: 'MUTATE_DOMAIN', domain: 'gemini.google.com', list: 'local', action: 'add' }))
    .toMatchObject({ type: 'MUTATION_RESULT', result: { domain: 'gemini.google.com', status: 'applied-and-verified' } });
  expect(config.lists.local!.domains).toEqual(['google.com', 'docs.google.com', 'gemini.google.com']);
  expect(deps.api.testRouting).toHaveBeenLastCalledWith('gemini.google.com');
  expect(await handle({ type: 'MUTATE_DOMAIN', domain: 'gemini.google.com', list: 'local', action: 'remove' }))
    .toMatchObject({ type: 'MUTATION_RESULT', result: { domain: 'gemini.google.com', status: 'applied-and-verified' } });
  expect(config.lists.local!.domains).toEqual(['google.com', 'docs.google.com']);
  expect(config.lists.google_ai!.domains).toEqual(['gemini.google.com']);
});

it('reports remote domain matches separately from editable inline membership', async () => {
  const deps = makeDeps();
  deps.api.testRouting.mockResolvedValue({
    target: 'youtube.com', is_domain: true,
    rule_diagnostics: [{ target_in_lists: true, target_match: { list: 'remote_domains', via: 'youtube.com' } }],
    results: [{ ok: true, list_match: { list: 'ip_only', via: '203.0.113.4' } }],
  });
  expect(await createBackgroundHandler(deps)({ type: 'GET_CONTEXT', domainInput: 'youtube.com' })).toMatchObject({
    ok: true, memberships: [], membershipInspection: { matchedLists: ['remote_domains'], status: 'partial' },
  });
  expect(deps.api.testRouting).toHaveBeenCalledExactlyOnceWith('youtube.com');
  expect(deps.api.stageConfig).not.toHaveBeenCalled();
  expect(deps.api.saveConfig).not.toHaveBeenCalled();
});

it('does not disguise an unavailable external check as absence from every list', async () => {
  const deps = makeDeps();
  deps.api.testRouting.mockRejectedValue(new KeenPbrApiError('timeout', 'Timed out'));
  expect(await createBackgroundHandler(deps)({ type: 'GET_CONTEXT' })).toMatchObject({
    ok: true, membershipInspection: { matchedLists: [], status: 'unavailable' },
  });
});

it.each([{}, { domainInput: 'https://youtube.com/watch?v=test' }])('finds selected inline membership for tab and manual checks: %j', async extra => {
  const deps = makeDeps();
  const config = makeConfig();
  config.lists.local!.domains = ['youtube.com'];
  config.lists.google_ai!.domains = ['*.YOUTUBE.COM.'];
  deps.api.getConfig.mockResolvedValue({ config, is_draft: false });
  deps.tabs.getActive.mockResolvedValue({ id: 7, url: 'https://www.youtube.com/feed/subscriptions', title: '' });
  expect(await createBackgroundHandler(deps)({ type: 'GET_CONTEXT', ...extra })).toMatchObject({
    ok: true, domain: 'youtube.com', memberships: ['google_ai', 'local'],
  });
});

it.each([
  [' Example.COM ', 'example.com'],
  ['https://shop.example.co.uk/cart', 'shop.example.co.uk'],
  ['пример.рф', 'xn--e1afmkfd.xn--p1ai'],
])('checks a manual domain %s without relying on the active tab', async (domainInput, domain) => {
  const deps = makeDeps();
  deps.tabs.getActive.mockRejectedValue(new Error('No active URL'));
  expect(await createBackgroundHandler(deps)({ type: 'GET_CONTEXT', domainInput })).toMatchObject({ ok: true, type: 'CONTEXT', domain });
  expect(deps.mutateDomain).not.toHaveBeenCalled();
});

it('writes the explicitly verified domain even if the user changed tabs', async () => {
  const deps = makeDeps();
  await createBackgroundHandler(deps)({ type: 'MUTATE_DOMAIN', domain: 'openai.com', action: 'add', list: 'local' });
  expect(deps.mutateDomain).toHaveBeenCalledWith(deps.api, { action: 'add', list: 'local', domain: 'openai.com' });
});

it.each(['', '192.168.1.1', 'localhost', 'javascript:alert(1)', 'https://user:pass@example.com', 'bad domain.com'])('rejects unsafe manual target %s before API access', async (domain) => {
  const deps = makeDeps();
  expect(await createBackgroundHandler(deps)({ type: 'MUTATE_DOMAIN', domain, action: 'add', list: 'local' })).toMatchObject({ ok: false, code: 'INVALID_DOMAIN' });
  expect(deps.clientFor).not.toHaveBeenCalled();
  expect(deps.mutateDomain).not.toHaveBeenCalled();
});

it('validates Basic against protected health before storing, without returning a secret', async () => {
  const deps = makeDeps();
  const response = await createBackgroundHandler(deps)({
    type: 'AUTH_CONNECT',
    apiOrigin: 'http://192.168.1.1:12121',
    password: ' test ',
    remember: false,
    allowInsecureHttp: true,
  });
  expect(response).toEqual({ ok: true, type: 'AUTH_CONNECTED', mode: 'session' });
  expect(deps.authClientFor).toHaveBeenCalledWith(
    'http://192.168.1.1:12121',
    'Basic YWRtaW46IHRlc3Qg',
  );
  expect(deps.auth.save).toHaveBeenCalledOnce();
  expect(JSON.stringify(response)).not.toContain('YWRtaW');
});

it('rejects a wrong password without storing it or reporting a 403 as wrong password', async () => {
  const deps = makeDeps();
  deps.api.getServiceHealth.mockRejectedValue(new KeenPbrApiError(
    'auth', 'forbidden', 403,
  ));
  const response = await createBackgroundHandler(deps)({
    type: 'AUTH_CONNECT', apiOrigin: 'https://router.example:12121',
    password: 'wrong', remember: true, allowInsecureHttp: false,
  });
  expect(response).toMatchObject({ ok: false, code: 'API_FORBIDDEN' });
  expect(deps.auth.save).not.toHaveBeenCalled();
});

it('reports a protected-health 401 as a rejected password without storing it', async () => {
  const deps = makeDeps();
  deps.api.getServiceHealth.mockRejectedValue(new KeenPbrApiError(
    'auth', 'unauthorized', 401,
  ));
  const response = await createBackgroundHandler(deps)({
    type: 'AUTH_CONNECT', apiOrigin: 'https://router.example:12121',
    password: 'wrong', remember: false, allowInsecureHttp: false,
  });
  expect(response).toMatchObject({ ok: false, code: 'AUTH_INVALID_PASSWORD' });
  expect(deps.auth.save).not.toHaveBeenCalled();
});

it('requires explicit consent before sending a password over HTTP', async () => {
  const deps = makeDeps();
  const response = await createBackgroundHandler(deps)({
    type: 'AUTH_CONNECT', apiOrigin: 'http://192.168.1.1:12121',
    password: 'test', remember: false, allowInsecureHttp: false,
  });
  expect(response).toMatchObject({ ok: false, code: 'INSECURE_HTTP_CONSENT_REQUIRED' });
  expect(deps.authClientFor).not.toHaveBeenCalled();
});

it('rejects unknown messages before creating an API client', async () => {
  const deps = makeDeps();
  const handle = createBackgroundHandler(deps);
  await expect(handle({
    type: 'FETCH_URL',
    url: 'http://192.168.1.1:12121/api/config',
  })).resolves.toEqual({
    ok: false,
    code: 'INVALID_MESSAGE',
    message: 'Запрос отклонён',
  });
  expect(deps.clientFor).not.toHaveBeenCalled();
});

it.each(['AUTH_CONNECT', 'AUTH_FORGET', 'REMOVE_CONNECTION', 'MUTATE_DOMAIN', 'SAVE_SETTINGS'] as const)('rejects %s sent from a content script even with the extension id', (type) => {
  const listener = vi.fn();
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'extension-id',
      getURL: (path: string) => 'chrome-extension://extension-id/' + path,
      onMessage: { addListener: listener },
    },
  });
  try {
    const handler = vi.fn().mockResolvedValue({ ok: true, type: 'AUTH_CONNECTED', mode: 'session' });
    registerBackgroundRuntime(handler);
    const callback = listener.mock.calls[0]?.[0] as (
      message: unknown,
      sender: { id: string; url: string },
      respond: (response: unknown) => void,
    ) => boolean;
    const respond = vi.fn();
    expect(callback(
      { type, password: 'not-sent', domain: 'openai.com', list: 'local', action: 'add' },
      { id: 'extension-id', url: 'https://example.com/' },
      respond,
    )).toBe(false);
    expect(respond).toHaveBeenCalledWith(expect.objectContaining({
      ok: false, code: 'UNTRUSTED_SENDER',
    }));
    expect(handler).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

it('returns exact subdomain membership rather than substituting the parent entry', async () => {
  const deps = makeDeps();
  const config = makeConfig();
  config.lists.local!.domains = ['google.com'];
  config.lists.google_ai!.domains = ['docs.google.com'];
  deps.api.getConfig.mockResolvedValue({ config, is_draft: false });
  deps.tabs.getActive.mockResolvedValue({
    id: 7,
    url: 'https://docs.google.com/page',
    title: 'Google Docs',
  });
  const handle = createBackgroundHandler(deps);
  await expect(handle({ type: 'GET_CONTEXT' })).resolves.toMatchObject({
    ok: true,
    type: 'CONTEXT',
    domain: 'docs.google.com',
    memberships: ['google_ai'],
    defaultList: 'local',
  });
});

it('returns a first-run setup context with a plausible active-tab origin', async () => {
  const deps = makeDeps();
  deps.settings.load.mockResolvedValue(null);
  deps.tabs.getActive.mockResolvedValue({
    id: 7,
    url: 'http://192.168.1.1:12121/dashboard',
    title: 'Router',
  });
  const handle = createBackgroundHandler(deps);

  await expect(handle({ type: 'GET_CONTEXT' })).resolves.toEqual({
    ok: true,
    type: 'SETUP_CONTEXT',
    apiOriginCandidate: 'http://192.168.1.1:12121',
  });
  expect(deps.clientFor).not.toHaveBeenCalled();
});

it('opens first-run setup without suggesting an unrelated active tab', async () => {
  const deps = makeDeps();
  deps.settings.load.mockResolvedValue(null);
  deps.tabs.getActive.mockResolvedValue({
    id: 7,
    url: 'https://example.com/',
    title: 'Example',
  });
  const handle = createBackgroundHandler(deps);

  await expect(handle({ type: 'GET_CONTEXT' })).resolves.toEqual({
    ok: true,
    type: 'SETUP_CONTEXT',
    apiOriginCandidate: null,
  });
  expect(deps.clientFor).not.toHaveBeenCalled();
});

it('opens first-run setup when Chrome does not expose a URL for the active tab', async () => {
  const deps = makeDeps();
  deps.settings.load.mockResolvedValue(null);
  deps.tabs.getActive.mockRejectedValue(new Error('Active tab is unavailable'));

  await expect(createBackgroundHandler(deps)({ type: 'GET_CONTEXT' })).resolves.toEqual({
    ok: true,
    type: 'SETUP_CONTEXT',
    apiOriginCandidate: null,
  });
  expect(deps.clientFor).not.toHaveBeenCalled();
});

it.each(['add', 'remove'] as const)(
  'derives the active domain for %s when no explicit target is provided',
  async (action) => {
    const deps = makeDeps();
    const handle = createBackgroundHandler(deps);
    await handle({
      type: 'MUTATE_DOMAIN',
      action,
      list: 'local',
    });
    expect(deps.mutateDomain).toHaveBeenCalledWith(expect.anything(), {
      action,
      list: 'local',
      domain: 'example.com',
    });
  },
);

it('rejects an invalid mutation action before API access', async () => {
  const deps = makeDeps();
  const handle = createBackgroundHandler(deps);
  await expect(handle({
    type: 'MUTATE_DOMAIN', action: 'delete-all', list: 'local',
  })).resolves.toMatchObject({ ok: false, code: 'INVALID_MESSAGE' });
  expect(deps.clientFor).not.toHaveBeenCalled();
});

it('rejects invalid list names before API access', async () => {
  const deps = makeDeps();
  const handle = createBackgroundHandler(deps);
  await handle({
    type: 'MUTATE_DOMAIN',
    action: 'add',
    list: '../local',
  });
  expect(deps.clientFor).not.toHaveBeenCalled();
});

it('refuses to save a missing default instead of choosing another list', async () => {
  const deps = makeDeps();
  const handle = createBackgroundHandler(deps);
  await expect(handle({
    type: 'SAVE_SETTINGS',
    apiOrigin: 'http://192.168.1.1:12121',
    defaultList: 'missing',
  })).resolves.toEqual({
    ok: false,
    code: 'DEFAULT_LIST_UNAVAILABLE',
    message: 'Выбранный список по умолчанию недоступен',
  });
  expect(deps.settings.save).not.toHaveBeenCalled();
});

it('saves a verified origin while retaining credentials and permission for saved connections', async () => {
  const deps = makeDeps();
  const handle = createBackgroundHandler(deps);
  await expect(handle({
    type: 'SAVE_SETTINGS',
    apiOrigin: 'http://192.168.2.1:12121',
    defaultList: 'local',
  })).resolves.toEqual({
    ok: true,
    type: 'SETTINGS_SAVED',
    oldPermissionRemoved: false,
  });
  expect(deps.settings.save).toHaveBeenCalledWith({
    version: 1,
    apiOrigin: 'http://192.168.2.1:12121',
    defaultList: 'local',
  });
  expect(deps.auth.forget).not.toHaveBeenCalled();
  expect(deps.permissions.remove).not.toHaveBeenCalled();
});

it('keeps saved connections available without removing old host permission', async () => {
  const deps = makeDeps();
  deps.permissions.remove.mockResolvedValue(false);
  const handle = createBackgroundHandler(deps);

  await expect(handle({
    type: 'SAVE_SETTINGS',
    apiOrigin: 'http://192.168.2.1:12121',
    defaultList: 'local',
  })).resolves.toEqual({
    ok: true,
    type: 'SETTINGS_SAVED',
    oldPermissionRemoved: false,
  });
  expect(deps.settings.save).toHaveBeenCalledTimes(1);
});

it('does not send a password when the address fails the native API auth preflight', async () => {
  const deps = makeDeps();
  deps.authStatusFor.mockRejectedValue(new KeenPbrApiError('gateway-auth', 'Proxy login page'));
  const result = await createBackgroundHandler(deps)({ type: 'AUTH_CONNECT', apiOrigin: 'https://router.example', password: 'fake', remember: false, allowInsecureHttp: false });
  expect(result).toMatchObject({ ok: false, code: 'API_GATEWAY_AUTH' });
  expect(deps.authClientFor).not.toHaveBeenCalled();
  expect(deps.auth.save).not.toHaveBeenCalled();
});

it('refuses to mutate another router after the saved connection changes', async () => {
  const deps = makeDeps();
  const result = await createBackgroundHandler(deps)({ type: 'MUTATE_DOMAIN', action: 'add', list: 'local', expectedOrigin: 'https://router.example' });
  expect(result).toMatchObject({ ok: false, code: 'CONNECTION_CHANGED' });
  expect(deps.mutateDomain).not.toHaveBeenCalled();
});

it('rejects the removed tab-reload request', async () => {
  const deps = makeDeps();
  const handle = createBackgroundHandler(deps);
  await expect(handle({ type: 'RELOAD_ACTIVE_TAB' } as never)).resolves.toEqual({
    ok: false,
    code: 'INVALID_MESSAGE',
    message: 'Запрос отклонён',
  });
  expect(deps.clientFor).not.toHaveBeenCalled();
});

it('rejects an incompatible API major before exposing lists', async () => {
  const deps = makeDeps();
  deps.api.getServiceHealth.mockResolvedValue({
    status: 'running',
    version: '2.9.9',
  });
  const handle = createBackgroundHandler(deps);

  await expect(handle({
    type: 'CHECK_SETTINGS',
    apiOrigin: 'http://192.168.1.1:12121',
  })).resolves.toEqual({
    ok: false,
    code: 'API_INCOMPATIBLE',
    message: 'Требуется совместимый API keen-pbr 3.x',
  });
  expect(deps.api.getConfig).not.toHaveBeenCalled();
});

it('returns a safe browser-fetch diagnostic when the API is unreachable', async () => {
  const deps = makeDeps();
  deps.api.getServiceHealth.mockRejectedValue(new KeenPbrApiError(
    'network',
    'keen-pbr is unreachable',
    undefined,
    false,
    'TypeError: Failed to fetch',
  ));
  const handle = createBackgroundHandler(deps);

  await expect(handle({
    type: 'CHECK_SETTINGS',
    apiOrigin: 'http://192.168.1.1:12121',
  })).resolves.toEqual({
    ok: false,
    code: 'API_UNAVAILABLE',
    message: 'API keen-pbr недоступен [network; TypeError: Failed to fetch]',
    diagnostic: 'network; TypeError: Failed to fetch',
  });
});
