const db = require('../config/db');

module.exports = {
  listForTable() {
    return db.execute(`
      SELECT patient_id AS id, CONCAT(fname, ' ', lname) AS name, phone
      FROM patient`);
  },

  listWithStats() {
    return db.execute(`
      SELECT p.patient_id, p.fname, p.lname, p.phone, p.dob, p.address, p.id_card,
             u.email, u.last_login, MAX(q.time) as last_visit,
             COUNT(DISTINCT q.queue_id) as total_appointments
      FROM patient p
      LEFT JOIN user u ON p.user_id = u.user_id
      LEFT JOIN queue q ON p.patient_id = q.patient_id AND q.queue_status IN ('confirm','pending')
      GROUP BY p.patient_id, p.fname, p.lname, p.phone, p.dob, p.address, p.id_card, u.email, u.last_login
      ORDER BY p.fname, p.lname
    `);
  },

  findByIdWithStats(id) {
    return db.execute(`
      SELECT p.*, u.email, u.last_login,
             COUNT(DISTINCT q.queue_id) as total_appointments, MAX(q.time) as last_visit
      FROM patient p
      LEFT JOIN user u ON p.user_id = u.user_id
      LEFT JOIN queue q ON p.patient_id = q.patient_id AND q.queue_status IN ('confirm','pending')
      WHERE p.patient_id = ?
      GROUP BY p.patient_id`, [id]);
  },

  async create({ user_id, fname, lname, dob, id_card, phone, address }) {
    const [res] = await db.execute(`
      INSERT INTO patient (user_id, fname, lname, dob, id_card, phone, address)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user_id, fname, lname, dob, id_card, phone, address || '']
    );
    return res.insertId;
  },

  async update(id, fields) {
    const allowed = ['fname','lname','dob','id_card','phone','address'];
    const set = []; const params = [];
    allowed.forEach(k => {
      if (fields[k] !== undefined) {
        set.push(`${k} = ?`);
        params.push(k === 'dob' && (!fields[k] || fields[k] === 'null') ? null : fields[k]);
      }
    });
    if (!set.length) return;
    params.push(id);
    await db.execute(`UPDATE patient SET ${set.join(', ')} WHERE patient_id = ?`, params);
  },

  delete(id) {
    return db.execute('DELETE FROM patient WHERE patient_id = ?', [id]);
  },

  // treatment history
  treatmentHistory(id) {
    return db.execute(`
      SELECT qd.date, t.treatment_name, q.queue_id
      FROM queuedetail qd
      JOIN treatment t ON qd.treatment_id = t.treatment_id
      JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
      WHERE qd.patient_id = ?
      ORDER BY qd.date DESC
    `, [id]);
  },

  treatmentDetail(patientId, queueId) {
    return db.execute(`
      SELECT q.queue_id, qd.date, t.treatment_name,
             d.fname AS dentist_name, th.diagnosis, th.followUpdate
      FROM queue q
      JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      JOIN treatment t ON qd.treatment_id = t.treatment_id
      JOIN dentist d ON qd.dentist_id = d.dentist_id
      LEFT JOIN treatmentHistory th ON qd.queuedetail_id = th.queuedetail_id
      WHERE q.queue_id = ? AND q.patient_id = ?`,
      [queueId, patientId]
    );
  }
};
