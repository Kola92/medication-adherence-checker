import { FastifyInstance } from 'fastify';
import { checkInteractions } from '../services/interactions';

const checkSchema = {
  querystring: {
    type: 'object',
    required: ['medIds'],
    properties: {
      medIds: { type: 'string' }
    }
  }
};

export async function interactionRoutes(app: FastifyInstance) {
  app.get('/interactions/check', { schema: checkSchema }, async (request, reply) => {
    const { medIds } = request.query as { medIds: string };
    const ids = medIds.split(',').map((id) => id.trim()).filter(Boolean);

    if (ids.length < 2) {
      return reply.status(400).send({ error: 'At least 2 medication IDs are required to check interactions' });
    }

    const findings = await checkInteractions(ids);

    return reply.send({
      checkedMedicationCount: ids.length,
      findingsCount: findings.length,
      findings
    });
  });
}
