import { createServer } from 'node:http';

let activeConfig = {
  lists: {
    local: { domains: ['alpha.example'], ip_cidrs: [], url: '', file: '' },
    microsoft: { domains: ['office.example'], ip_cidrs: [], url: '', file: '' },
  },
  route: {
    rules: [
      { list: ['local'], outbound: 'vpn_auto' },
      { list: ['microsoft'], outbound: 'vpn_auto' },
    ],
  },
};
let draftConfig = null;

function reply(response, status, body) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString('utf8');
  let body;
  try { body = text ? JSON.parse(text) : null; }
  catch { return reply(response, 400, { error: 'Invalid JSON' }); }
  const key = (request.method ?? 'GET') + ' ' + (request.url ?? '/');
  console.log(key);

  if (key === 'GET /api/auth/status') {
    return reply(response, 200, { enabled: false, authenticated: false });
  }

  if (key === 'GET /api/config') {
    return reply(response, 200, {
      config: draftConfig ?? activeConfig,
      is_draft: draftConfig !== null,
    });
  }
  if (key === 'POST /api/config') {
    if (!body || typeof body !== 'object' || !body.lists) {
      return reply(response, 400, { error: 'Validation failed' });
    }
    draftConfig = structuredClone(body);
    return reply(response, 200, { status: 'ok', message: 'Config staged' });
  }
  if (key === 'POST /api/config/save') {
    if (!draftConfig) {
      return reply(response, 400, {
        error: 'No staged config',
        saved: false,
        applied: false,
        rolled_back: false,
      });
    }
    activeConfig = draftConfig;
    draftConfig = null;
    return reply(response, 200, {
      saved: true,
      applied: true,
      rolled_back: false,
    });
  }
  if (key === 'GET /api/health/service') {
    return reply(response, 200, {
      version: '3.1.1-mock',
      status: 'running',
      config_is_draft: false,
      resolver_config_hash: 'same-hash',
      resolver_config_hash_actual: 'same-hash',
    });
  }
  if (key === 'GET /api/health/routing') {
    return reply(response, 200, { overall: 'ok' });
  }
  if (key === 'POST /api/routing/test') {
    const target = typeof body?.target === 'string' ? body.target : '';
    const matched = Object.entries(activeConfig.lists).some(([, list]) =>
      Array.isArray(list.domains) && list.domains.includes(target));
    const confirmed = matched && target !== 'example.net';
    return reply(response, 200, {
      target,
      results: [{
        ok: confirmed,
        expected_outbound: 'vpn_auto',
        actual_outbound: confirmed ? 'vpn_auto' : 'direct',
      }],
    });
  }
  return reply(response, 404, { error: 'Not found' });
});

server.listen(Number(process.env.KEEN_PBR_MOCK_PORT ?? 12122), '127.0.0.1', () => {
  console.log('Mock keen-pbr API: http://127.0.0.1:' + server.address().port);
});
