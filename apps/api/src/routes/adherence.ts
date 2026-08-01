import { FastifyInstance } from 'fastify';
import { pool } from '../db';

const summaryQuerySchema = {
  querystring: {
    type: 'object',
    required: ['userMedicationId'],
    properties: {
      userMedicationId: { type: 'string', format: 'uuid' },
      days: { type: 'integer', minimum: 1, maximum: 365 }
    }
  }
};

export async function adherenceRoutes(app: FastifyInstance) {
  app.get(
    '/adherence/summary',
    { schema: summaryQuerySchema, onRequest: [app.authenticate] },
    async (request, reply) => {
      const { userMedicationId, days } = request.query as {
        userMedicationId: string;
        days?: number;
      };
      const windowDays = days ?? 7;
      const userId = request.user!.userId;

      const ownsRow = await pool.query(
        'SELECT id, started_at, reminder_times FROM user_medications WHERE id = $1 AND user_id = $2',
        [userMedicationId, userId]
      );
      if (ownsRow.rows.length === 0) {
        return reply.status(404).send({ error: 'Not found' });
      }

      const result = await pool.query(
        `WITH bounds AS (
           SELECT started_at, reminder_times
           FROM user_medications
           WHERE id = $1
         ),
         date_range AS (
           SELECT generate_series(
             GREATEST(started_at, (CURRENT_DATE - $2::int)),
             CURRENT_DATE - 1,
             '1 day'::interval
           )::date AS slot_date
           FROM bounds
         ),
         expected_slots AS (
           SELECT dr.slot_date, rt AS slot_time
           FROM date_range dr, bounds b, unnest(b.reminder_times) AS rt
         )
         SELECT
           COUNT(*)::int AS "totalSlots",
           COUNT(*) FILTER (WHERE dl.status = 'taken')::int AS "takenSlots"
         FROM expected_slots es
         LEFT JOIN dose_logs dl
           ON dl.user_medication_id = $1
           AND dl.scheduled_date = es.slot_date
           AND dl.scheduled_time = es.slot_time`,
        [userMedicationId, windowDays]
      );

      const { totalSlots, takenSlots } = result.rows[0];
      const adherencePercentage = totalSlots === 0 ? null : Math.round((takenSlots / totalSlots) * 1000) / 10;

      const rangeResult = await pool.query(
        `SELECT
           GREATEST(started_at, (CURRENT_DATE - $2::int))::text AS "startDate",
           (CURRENT_DATE - 1)::text AS "endDate"
         FROM user_medications WHERE id = $1`,
        [userMedicationId, windowDays]
      );

      return reply.send({
        userMedicationId,
        days: windowDays,
        totalSlots,
        takenSlots,
        adherencePercentage,
        startDate: rangeResult.rows[0].startDate,
        endDate: rangeResult.rows[0].endDate
      });
    }
  );
}
