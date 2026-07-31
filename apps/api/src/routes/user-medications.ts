import { FastifyInstance } from 'fastify';
import { pool } from '../db';

const createSchema = {
  body: {
    type: 'object',
    required: ['medicationId', 'dosageAmount', 'dosageUnit', 'frequency', 'reminderTimes'],
    properties: {
      medicationId: { type: 'string', format: 'uuid' },
      dosageAmount: { type: 'number', exclusiveMinimum: 0 },
      dosageUnit: { type: 'string', minLength: 1, maxLength: 50 },
      frequency: { type: 'string', minLength: 1, maxLength: 100 },
      reminderTimes: {
        type: 'array',
        items: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
        minItems: 1
      },
      startedAt: { type: 'string', format: 'date' }
    }
  }
};

const idParamSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' }
    }
  }
};

const JOIN_SELECT = `
  SELECT
    um.id,
    um.user_id AS "userId",
    um.medication_id AS "medicationId",
    m.name AS "medicationName",
    m.category AS "medicationCategory",
    um.dosage_amount AS "dosageAmount",
    um.dosage_unit AS "dosageUnit",
    um.frequency,
    um.reminder_times AS "reminderTimes",
    um.started_at::text AS "startedAt",
    um.created_at AS "createdAt"
  FROM user_medications um
  JOIN medications m ON m.id = um.medication_id
`;

export async function userMedicationRoutes(app: FastifyInstance) {
  app.post(
    '/user-medications',
    { schema: createSchema, onRequest: [app.authenticate] },
    async (request, reply) => {
      const { medicationId, dosageAmount, dosageUnit, frequency, reminderTimes, startedAt } =
        request.body as {
          medicationId: string;
          dosageAmount: number;
          dosageUnit: string;
          frequency: string;
          reminderTimes: string[];
          startedAt?: string;
        };
      const userId = request.user!.userId;

      const medExists = await pool.query('SELECT id FROM medications WHERE id = $1', [medicationId]);
      if (medExists.rows.length === 0) {
        return reply.status(400).send({ error: 'medicationId does not reference an existing medication' });
      }

      const result = await pool.query(
        `INSERT INTO user_medications
          (user_id, medication_id, dosage_amount, dosage_unit, frequency, reminder_times, started_at)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, CURRENT_DATE))
         RETURNING id`,
        [userId, medicationId, dosageAmount, dosageUnit, frequency, reminderTimes, startedAt ?? null]
      );

      const created = await pool.query(`${JOIN_SELECT} WHERE um.id = $1`, [result.rows[0].id]);
      return reply.status(201).send(created.rows[0]);
    }
  );

  app.get(
    '/user-medications',
    { onRequest: [app.authenticate] },
    async (request, reply) => {
      const userId = request.user!.userId;
      const result = await pool.query(
        `${JOIN_SELECT} WHERE um.user_id = $1 ORDER BY um.created_at DESC`,
        [userId]
      );
      return reply.send({ userMedications: result.rows });
    }
  );

  app.get(
    '/user-medications/:id',
    { schema: idParamSchema, onRequest: [app.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const userId = request.user!.userId;

      const result = await pool.query(
        `${JOIN_SELECT} WHERE um.id = $1 AND um.user_id = $2`,
        [id, userId]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Not found' });
      }
      return reply.send(result.rows[0]);
    }
  );

  app.delete(
    '/user-medications/:id',
    { schema: idParamSchema, onRequest: [app.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const userId = request.user!.userId;

      const result = await pool.query(
        `DELETE FROM user_medications WHERE id = $1 AND user_id = $2 RETURNING id`,
        [id, userId]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Not found' });
      }
      return reply.status(204).send();
    }
  );
}
