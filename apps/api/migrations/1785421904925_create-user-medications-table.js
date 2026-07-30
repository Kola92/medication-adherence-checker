/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('user_medications', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE'
    },
    medication_id: {
      type: 'uuid',
      notNull: true,
      references: 'medications',
      onDelete: 'CASCADE'
    },
    dosage_amount: {
      type: 'numeric',
      notNull: true
    },
    dosage_unit: {
      type: 'varchar(50)',
      notNull: true
    },
    frequency: {
      type: 'varchar(100)',
      notNull: true
    },
    reminder_times: {
      type: 'text[]',
      notNull: true
    },
    started_at: {
      type: 'date',
      notNull: true,
      default: pgm.func('current_date')
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()')
    }
  });

  pgm.createIndex('user_medications', 'user_id');
  pgm.createIndex('user_medications', 'medication_id');
};

exports.down = (pgm) => {
  pgm.dropTable('user_medications');
};
