import { FastifyInstance } from 'fastify';
import {
  registerUser,
  loginUser,
  refreshAccessToken,
  revokeRefreshToken,
  AuthError
} from '../services/auth';

const emailPasswordNameSchema = {
  body: {
    type: 'object',
    required: ['email', 'password', 'name'],
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 8 },
      name: { type: 'string', minLength: 1, maxLength: 255 },
      timezone: { type: 'string', minLength: 1, maxLength: 50 }
    }
  }
};

const emailPasswordSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string' }
    }
  }
};

const refreshTokenSchema = {
  body: {
    type: 'object',
    required: ['refreshToken'],
    properties: {
      refreshToken: { type: 'string' }
    }
  }
};

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', { schema: emailPasswordNameSchema }, async (request, reply) => {
    const { email, password, name, timezone } = request.body as {
      email: string;
      password: string;
      name: string;
      timezone?: string;
    };

    try {
      const result = await registerUser(email, password, name, timezone);
      return reply.status(201).send(result);
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      request.log.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  app.post('/auth/login', { schema: emailPasswordSchema }, async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    try {
      const result = await loginUser(email, password);
      return reply.status(200).send(result);
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      request.log.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  app.post('/auth/refresh', { schema: refreshTokenSchema }, async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken: string };

    try {
      const result = await refreshAccessToken(refreshToken);
      return reply.status(200).send(result);
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      request.log.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  app.post('/auth/logout', { schema: refreshTokenSchema }, async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken: string };

    await revokeRefreshToken(refreshToken);
    return reply.status(204).send();
  });
}
