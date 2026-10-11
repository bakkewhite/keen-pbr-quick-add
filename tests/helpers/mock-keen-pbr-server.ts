import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RecordedRequest {
  method: string;
  path: string;
  body: unknown;
}

export async function createMockKeenPbrServer(
  responder: (request: RecordedRequest) => {
    status?: number;
    body: unknown;
    delayMs?: number;
  },
) {
  const requests: RecordedRequest[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const text = Buffer.concat(chunks).toString('utf8');
    const request = {
      method: req.method ?? 'GET',
      path: req.url ?? '/',
      body: text ? JSON.parse(text) : null,
    };
    requests.push(request);
    const reply = responder(request);
    if (reply.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, reply.delayMs));
    }
    res.statusCode = reply.status ?? 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(reply.body));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return {
    origin: 'http://127.0.0.1:' + address.port,
    requests,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}
