import http from 'http';
import { config } from './config';

// Render's free tier only offers a Background Worker service type on paid
// plans - the free tier only has Web Service, Postgres, Redis, and static
// sites. This bare http server exists solely so Render has an HTTP surface
// to health-check; it carries no application logic of its own. Deliberately
// plain node:http rather than Express/Fastify - a single route doesn't
// justify a new dependency in a process that otherwise has none.
export function startHealthServer(): void {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(config.port, '0.0.0.0', () => {
    console.log(`Health check server listening on 0.0.0.0:${config.port}`);
  });
}
