import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config';
import { authenticatePlugin } from './plugins/authenticate';
import { authRoutes } from './routes/auth';
import { medicationRoutes } from './routes/medications';
import { interactionRoutes } from './routes/interactions';
import { userMedicationRoutes } from './routes/user-medications';

const app = Fastify({
  logger: true
});

const start = async () => {
  await app.register(cors, {
    origin: config.corsOrigin
  });

  await app.register(authenticatePlugin);

  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  await app.register(authRoutes, { prefix: '/api/v1' });
  await app.register(medicationRoutes, { prefix: '/api/v1' });
  await app.register(interactionRoutes, { prefix: '/api/v1' });
  await app.register(userMedicationRoutes, { prefix: '/api/v1' });

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
