import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { verifyAccessToken, AccessTokenPayload } from '../services/tokens';

declare module 'fastify' {
  interface FastifyRequest {
    user?: AccessTokenPayload;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

async function authenticatePluginImpl(app: FastifyInstance) {
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing or malformed Authorization header' });
    }

    const token = authHeader.slice(7);

    try {
      const payload = verifyAccessToken(token);
      request.user = payload;
    } catch (err) {
      return reply.status(401).send({ error: 'Invalid or expired token' });
    }
  });
}

export const authenticatePlugin = fp(authenticatePluginImpl);
