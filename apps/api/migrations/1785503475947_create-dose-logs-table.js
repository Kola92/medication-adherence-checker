/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('dose_logs', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    user_medication_id: {
      type: 'uuid',
      notNull: true,
      references: 'user_medications',
      onDelete: 'CASCADE'
    },
    scheduled_date: {
      type: 'date',
      notNull: true
    },
    scheduled_time: {
      type: 'varchar(5)',
      notNull: true
    },
    status: {
      type: 'varchar(20)',
      notNull: true
    },
    logged_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()')
    },
    notes: {
      type: 'text'
    }
  });

  pgm.createIndex('dose_logs', 'user_medication_id');
  pgm.addConstraint('dose_logs', 'status_check', {
    check: "status IN ('taken', 'missed', 'skipped')"
  });
  pgm.addConstraint('dose_logs', 'unique_dose_slot', {
    unique: ['user_medication_id', 'scheduled_date', 'scheduled_time']
  });
};

exports.down = (pgm) => {
  pgm.dropTable('dose_logs');
};
