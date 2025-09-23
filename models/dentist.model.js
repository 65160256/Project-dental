const db = require('../config/db');

module.exports = {
  list() {
    return db.execute(`SELECT d.*, u.email FROM dentist d JOIN user u ON d.user_id = u.user_id`);
  },

  findById(id) {
    return db.execute(`
      SELECT d.*, u.email FROM dentist d
      JOIN user u ON d.user_id = u.user_id
      WHERE d.dentist_id = ?`, [id]);
  },

  async create({ user_id, fname, lname, dob, id_card, specialty, education, address, phone, photo }) {
    const [res] = await db.execute(`
      INSERT INTO dentist (user_id, fname, lname, dob, id_card, specialty, education, address, phone, photo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [user_id, fname, lname, dob || null, id_card, specialty, education || null, address || null, phone, photo || null]
    );
    return res.insertId;
  },

  async update(id, fields) {
    const allowed = ['fname','lname','dob','id_card','specialty','education','address','phone','photo'];
    const set = []; const params = [];
    allowed.forEach(k => {
      if (fields[k] !== undefined) { set.push(`${k} = ?`); params.push(fields[k] === '' ? null : fields[k]); }
    });
    if (!set.length) return;
    params.push(id);
    await db.execute(`UPDATE dentist SET ${set.join(', ')} WHERE dentist_id = ?`, params);
  },

  delete(id) {
    return db.execute('DELETE FROM dentist WHERE dentist_id = ?', [id]);
  },

  specialtiesList() {
    return db.execute(`SELECT DISTINCT specialty FROM dentist ORDER BY specialty`);
  }
};
