import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { config } from './config';
import { authenticatePlugin } from './plugins/authenticate';
import { authRoutes } from './routes/auth';
import { medicationRoutes } from './routes/medications';
import { interactionRoutes } from './routes/interactions';
import { userMedicationRoutes } from './routes/user-medications';
import { doseLogRoutes } from './routes/dose-logs';
import { adherenceRoutes } from './routes/adherence';

const app = Fastify({
  logger: true
});

const start = async () => {
  await app.register(cors, {
    origin: config.corsOrigin,
    // Required for the browser to send/receive the httpOnly refreshToken
    // cookie on cross-origin requests (localhost:3000 -> localhost:4000
    // locally, Vercel -> Render once deployed). Without this, the browser
    // silently drops Set-Cookie on the response and never attaches the
    // cookie on subsequent requests - no error, it just quietly doesn't work.
    credentials: true
  });

  await app.register(cookie);

  await app.register(authenticatePlugin);

  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  await app.register(authRoutes, { prefix: '/api/v1' });
  await app.register(medicationRoutes, { prefix: '/api/v1' });
  await app.register(interactionRoutes, { prefix: '/api/v1' });
  await app.register(userMedicationRoutes, { prefix: '/api/v1' });
  await app.register(doseLogRoutes, { prefix: '/api/v1' });
  await app.register(adherenceRoutes, { prefix: '/api/v1' });

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
