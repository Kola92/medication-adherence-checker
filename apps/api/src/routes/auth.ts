import { FastifyInstance, FastifyReply } from 'fastify';
import {
  registerUser,
  loginUser,
  refreshAccessToken,
  revokeRefreshToken,
  AuthError
} from '../services/auth';
import { config } from '../config';
import { pool } from '../db';

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

const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

function setRefreshCookie(reply: FastifyReply, refreshToken: string) {
  reply.setCookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: REFRESH_COOKIE_PATH,
    maxAge: config.jwtRefreshExpiresInDays * 24 * 60 * 60
  });
}

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
      setRefreshCookie(reply, result.refreshToken);
      return reply.status(201).send({ user: result.user, accessToken: result.accessToken });
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
      setRefreshCookie(reply, result.refreshToken);
      return reply.status(200).send({ user: result.user, accessToken: result.accessToken });
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      request.log.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  app.post('/auth/refresh', async (request, reply) => {
    const refreshToken = request.cookies[REFRESH_COOKIE_NAME];

    if (!refreshToken) {
      return reply.status(401).send({ error: 'No refresh token cookie present' });
    }

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

  app.post('/auth/logout', async (request, reply) => {
    const refreshToken = request.cookies[REFRESH_COOKIE_NAME];

    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }

    reply.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
    return reply.status(204).send();
  });

  // Used by the frontend to hydrate full user state (name, timezone) after
  // a silent /auth/refresh on page load — the access token JWT payload
  // only carries { userId, email }, not enough to render the UI correctly.
  app.get('/auth/me', { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = request.user!.userId;

    const result = await pool.query(
      'SELECT id, email, name, timezone FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return reply.send({ user: result.rows[0] });
  });
}
