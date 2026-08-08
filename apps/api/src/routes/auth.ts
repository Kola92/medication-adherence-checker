import { FastifyInstance, FastifyReply } from 'fastify';
import {
  registerUser,
  loginUser,
  refreshAccessToken,
  revokeRefreshToken,
  AuthError
} from '../services/auth';
import { config } from '../config';

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

// Centralized so the maxAge (in seconds) always matches config's
// day-based expiry - if these drift, the cookie could expire before or
// after the DB-side token does, causing confusing "logged out but token
// still technically valid" or vice-versa edge cases.
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
}
