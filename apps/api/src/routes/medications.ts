import { FastifyInstance } from 'fastify';
import { pool } from '../db';

const searchSchema = {
  querystring: {
    type: 'object',
    properties: {
      search: { type: 'string' }
    }
  }
};

export async function medicationRoutes(app: FastifyInstance) {
  app.get('/medications', { schema: searchSchema }, async (request, reply) => {
    const { search } = request.query as { search?: string };

    if (search) {
      const result = await pool.query(
        `SELECT id, name, category FROM medications
         WHERE name ILIKE $1
         ORDER BY name ASC
         LIMIT 20`,
        [`%${search}%`]
      );
      return reply.send({ medications: result.rows });
    }

    const result = await pool.query(
      `SELECT id, name, category FROM medications ORDER BY name ASC`
    );
    return reply.send({ medications: result.rows });
  });
}
