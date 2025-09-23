const db = require('../config/db');

module.exports = {
  getById(id) {
    return db.execute(`
      SELECT q.*, CONCAT(p.fname,' ',p.lname) AS patient_name,
             CONCAT(d.fname,' ',d.lname) AS dentist_name,
             t.treatment_name, u.email AS patient_email, p.phone AS patient_phone
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      LEFT JOIN user u ON p.user_id = u.user_id
      WHERE q.queue_id = ?`, [id]);
  },

  async updateStatus(id, status) {
    await db.execute(
      'UPDATE queue SET queue_status = ?, updated_at = CURRENT_TIMESTAMP WHERE queue_id = ?',
      [status, id]
    );
  },

  countToday() {
    return db.execute(`SELECT COUNT(*) as count FROM queue WHERE DATE(time) = CURDATE()`);
  },

  countPendingFromToday() {
    return db.execute(`
      SELECT COUNT(*) as count FROM queue
      WHERE queue_status = 'pending' AND DATE(time) >= CURDATE()
    `);
  }
};
