/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumns('interactions', {
    mechanism: {
      type: 'text'
    },
    recommendation: {
      type: 'text'
    }
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('interactions', ['mechanism', 'recommendation']);
};
