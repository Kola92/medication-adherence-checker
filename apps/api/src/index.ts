import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config';
import { authRoutes } from './routes/auth';
import { medicationRoutes } from './routes/medications';
import { interactionRoutes } from './routes/interactions';

const app = Fastify({
  logger: true
});

app.register(cors, {
  origin: config.corsOrigin
});

app.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

app.register(authRoutes, { prefix: '/api/v1' });
app.register(medicationRoutes, { prefix: '/api/v1' });
app.register(interactionRoutes, { prefix: '/api/v1' });

const start = async () => {
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
