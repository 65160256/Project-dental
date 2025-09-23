const db = require('../config/db');

module.exports = {
  list() { return db.execute('SELECT * FROM treatment ORDER BY treatment_name'); },
  findById(id) { return db.execute('SELECT * FROM treatment WHERE treatment_id = ?', [id]); },

  async create({ treatment_name, duration }) {
    const [res] = await db.execute(
      'INSERT INTO treatment (treatment_name, duration) VALUES (?, ?)',
      [treatment_name, duration]
    );
    return res.insertId;
  },

  async update(id, { treatment_name, duration }) {
    await db.execute(
      'UPDATE treatment SET treatment_name = ?, duration = ? WHERE treatment_id = ?',
      [treatment_name, duration, id]
    );
  },

  delete(id) { return db.execute('DELETE FROM treatment WHERE treatment_id = ?', [id]); },

  // dentist-tx mapping
  mappedDentists(treatmentId) {
    return db.execute('SELECT dentist_id FROM dentist_treatment WHERE treatment_id = ?', [treatmentId]);
  },

  async resetMappings(treatmentId) {
    await db.execute('DELETE FROM dentist_treatment WHERE treatment_id = ?', [treatmentId]);
  },

  async addMapping(dentistId, treatmentId) {
    await db.execute('INSERT INTO dentist_treatment (dentist_id, treatment_id) VALUES (?, ?)', [dentistId, treatmentId]);
  },

  dentistsListForMapping() {
    return db.execute('SELECT dentist_id, fname, lname FROM dentist');
  }
};
