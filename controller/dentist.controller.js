const pool = require('../models/db'); // เชื่อมกับฐานข้อมูล

// ฟังก์ชันดึงข้อมูลสำหรับหน้า dashboard ของ dentist
exports.getDashboard = async (req, res) => {
  try {
    const dentistId = req.session.user_id;

    // ดึงจำนวนผู้ป่วยที่มีในวันนี้
    const [todayPatients] = await pool.execute(
      `SELECT COUNT(*) AS total FROM appointments WHERE DATE(date) = CURDATE() AND dentist_id = ?`,
      [dentistId]
    );

    // ดึงจำนวนผู้ป่วยทั้งหมด
    const [totalPatients] = await pool.execute(
      `SELECT COUNT(DISTINCT patient_id) AS total FROM appointments WHERE dentist_id = ?`,
      [dentistId]
    );

    // ดึงจำนวนการนัดหมายที่ยกเลิก
    const [cancelAppointments] = await pool.execute(
      `SELECT COUNT(*) AS total FROM appointments WHERE status = 'cancelled' AND dentist_id = ?`,
      [dentistId]
    );

    // ดึง treatment สำหรับวันนี้ (กรณีที่มี)
    const [todayTreatment] = await pool.execute(
      `SELECT t.treatment_name FROM appointments a
      JOIN treatment t ON a.treatment_id = t.treatment_id
      WHERE a.dentist_id = ? AND DATE(a.date) = CURDATE() LIMIT 1`,
      [dentistId]
    );

    // ดึงรายการผู้ป่วยล่าสุด
    const [latestPatients] = await pool.execute(
      `SELECT a.date, a.time, CONCAT(p.fname, ' ', p.lname) AS name, t.treatment_name, a.status
      FROM appointments a
      JOIN patient p ON a.patient_id = p.patient_id
      JOIN treatment t ON a.treatment_id = t.treatment_id
      WHERE a.dentist_id = ?
      ORDER BY a.date DESC, a.time DESC LIMIT 5`,
      [dentistId]
    );

    // ดึงการนัดหมายถัดไป
    const [upcomingAppointments] = await pool.execute(
      `SELECT a.date, a.time, CONCAT(p.fname, ' ', p.lname) AS name, t.treatment_name
      FROM appointments a
      JOIN patient p ON a.patient_id = p.patient_id
      JOIN treatment t ON a.treatment_id = t.treatment_id
      WHERE a.dentist_id = ? AND a.date >= CURDATE()
      ORDER BY a.date, a.time ASC`,
      [dentistId]
    );

    res.render('dentist/dashboard', {
      todayPatients: todayPatients[0].total || 0,
      totalPatients: totalPatients[0].total || 0,
      cancelAppointments: cancelAppointments[0].total || 0,
      todayTreatment: todayTreatment[0] ? todayTreatment[0].treatment_name : 'None',
      latestPatients,
      upcomingAppointments
    });
  } catch (err) {
    console.error('Error loading dashboard:', err);
    res.status(500).send('Internal Server Error');
  }
};

exports.getSchedule = async (req, res) => {
  try {
    const dentistId = req.session.user_id;

    // ดึงข้อมูลตารางเวลาจากฐานข้อมูล (ตัวอย่างตาราง 'schedule')
    const [scheduleData] = await pool.execute(
      `SELECT * FROM schedule WHERE dentist_id = ? ORDER BY date, time`,
      [dentistId]
    );

    res.render('dentist/schedule', { scheduleData });
  } catch (err) {
    console.error('Error loading schedule:', err);
    res.status(500).send('Internal Server Error');
  }
};
