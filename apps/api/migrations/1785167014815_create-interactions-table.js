/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('interactions', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    medication_a_id: {
      type: 'uuid',
      notNull: true,
      references: 'medications',
      onDelete: 'CASCADE'
    },
    medication_b_id: {
      type: 'uuid',
      notNull: true,
      references: 'medications',
      onDelete: 'CASCADE'
    },
    severity: {
      type: 'varchar(50)',
      notNull: true
    },
    description: {
      type: 'text',
      notNull: true
    },
    source_citation: {
      type: 'text',
      notNull: true
    },
    is_curated: {
      type: 'boolean',
      notNull: true,
      default: true
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()')
    }
  });

  pgm.createIndex('interactions', 'medication_a_id');
  pgm.createIndex('interactions', 'medication_b_id');

  pgm.addConstraint('interactions', 'severity_check', {
    check: "severity IN ('minor', 'moderate', 'severe')"
  });
};

exports.down = (pgm) => {
  pgm.dropTable('interactions');
};
