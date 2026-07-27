/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('medications', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    name: {
      type: 'varchar(255)',
      notNull: true
    },
    category: {
      type: 'varchar(255)'
    },
    interaction_notes: {
      type: 'text'
    },
    source_url: {
      type: 'text'
    },
    fetched_at: {
      type: 'timestamptz'
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()')
    }
  });

  pgm.createIndex('medications', 'name');
};

exports.down = (pgm) => {
  pgm.dropTable('medications');
};
