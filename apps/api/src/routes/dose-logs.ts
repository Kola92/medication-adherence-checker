import { FastifyInstance } from 'fastify';
import { pool } from '../db';

const createSchema = {
  body: {
    type: 'object',
    required: ['userMedicationId', 'scheduledDate', 'scheduledTime', 'status'],
    properties: {
      userMedicationId: { type: 'string', format: 'uuid' },
      scheduledDate: { type: 'string', format: 'date' },
      scheduledTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
      status: { type: 'string', enum: ['taken', 'missed', 'skipped'] },
      notes: { type: 'string', maxLength: 1000 }
    }
  }
};

const listQuerySchema = {
  querystring: {
    type: 'object',
    properties: {
      userMedicationId: { type: 'string', format: 'uuid' }
    }
  }
};

export async function doseLogRoutes(app: FastifyInstance) {
  app.post(
    '/dose-logs',
    { schema: createSchema, onRequest: [app.authenticate] },
    async (request, reply) => {
      const { userMedicationId, scheduledDate, scheduledTime, status, notes } =
        request.body as {
          userMedicationId: string;
          scheduledDate: string;
          scheduledTime: string;
          status: 'taken' | 'missed' | 'skipped';
          notes?: string;
        };
      const userId = request.user!.userId;

      const ownsRow = await pool.query(
        'SELECT id FROM user_medications WHERE id = $1 AND user_id = $2',
        [userMedicationId, userId]
      );
      if (ownsRow.rows.length === 0) {
        return reply.status(404).send({ error: 'Not found' });
      }

      try {
        const result = await pool.query(
          `INSERT INTO dose_logs (user_medication_id, scheduled_date, scheduled_time, status, notes)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, user_medication_id AS "userMedicationId", scheduled_date::text AS "scheduledDate",
                     scheduled_time AS "scheduledTime", status, logged_at AS "loggedAt", notes`,
          [userMedicationId, scheduledDate, scheduledTime, status, notes ?? null]
        );
        return reply.status(201).send(result.rows[0]);
      } catch (err: any) {
        if (err.code === '23505') {
          return reply.status(409).send({ error: 'A dose log already exists for this slot' });
        }
        request.log.error(err);
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  app.get(
    '/dose-logs',
    { schema: listQuerySchema, onRequest: [app.authenticate] },
    async (request, reply) => {
      const { userMedicationId } = request.query as { userMedicationId?: string };
      const userId = request.user!.userId;

      const params: string[] = [userId];
      let filterClause = '';
      if (userMedicationId) {
        params.push(userMedicationId);
        filterClause = 'AND dl.user_medication_id = $2';
      }

      const result = await pool.query(
        `SELECT dl.id, dl.user_medication_id AS "userMedicationId",
                dl.scheduled_date::text AS "scheduledDate", dl.scheduled_time AS "scheduledTime",
                dl.status, dl.logged_at AS "loggedAt", dl.notes
         FROM dose_logs dl
         JOIN user_medications um ON um.id = dl.user_medication_id
         WHERE um.user_id = $1 ${filterClause}
         ORDER BY dl.scheduled_date DESC, dl.scheduled_time DESC`,
        params
      );
      return reply.send({ doseLogs: result.rows });
    }
  );
}
