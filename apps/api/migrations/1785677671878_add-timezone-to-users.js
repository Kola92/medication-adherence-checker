/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('users', {
    timezone: {
      type: 'varchar(50)',
      notNull: true,
      default: 'Africa/Lagos'
    }
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('users', 'timezone');
};
