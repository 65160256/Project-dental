const db = require('../config/db');

module.exports = {
  getRange({ start, end }) {
    let where = ''; let params = [];
    if (start && end) { where = 'WHERE ds.schedule_date BETWEEN ? AND ?'; params = [start, end]; }
    else { where = `WHERE ds.schedule_date >= CURDATE() - INTERVAL 30 DAY
                    AND ds.schedule_date <= CURDATE() + INTERVAL 60 DAY`; }

    return db.execute(`
      SELECT ds.schedule_date, ds.hour, ds.start_time, ds.end_time, ds.status, ds.note,
             d.dentist_id, d.fname, d.lname, d.specialty,
             COUNT(q.queue_id) AS appointment_count
      FROM dentist_schedule ds
      JOIN dentist d ON ds.dentist_id = d.dentist_id
      LEFT JOIN queue q ON ds.dentist_id = q.dentist_id
         AND DATE(q.time) = ds.schedule_date
         AND HOUR(q.time) = ds.hour
         AND q.queue_status IN ('pending','confirm')
      ${where}
      GROUP BY ds.schedule_id, ds.schedule_date, ds.hour, ds.start_time, ds.end_time, ds.status, ds.note,
               d.dentist_id, d.fname, d.lname, d.specialty
      ORDER BY ds.schedule_date, ds.hour
    `, params);
  }
};
