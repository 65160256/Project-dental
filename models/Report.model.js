const db = require('../config/db');

class ReportModel {
  /**
   * ดึงสถิติรายงานรายเดือนย้อนหลัง 12 เดือน
   * @param {number} dentistId
   * @returns {Promise<Array>}
   */
  static async getMonthlyStatistics(dentistId) {
    const [monthlyStats] = await db.execute(
      `SELECT
        MONTH(q.time) as month,
        YEAR(q.time) as year,
        COUNT(*) as total_appointments,
        COUNT(CASE WHEN q.queue_status = 'completed' THEN 1 END) as confirmed,
        COUNT(CASE WHEN q.queue_status = 'cancel' THEN 1 END) as cancelled,
        COUNT(DISTINCT q.patient_id) as unique_patients
      FROM queue q
      JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      WHERE qd.dentist_id = ?
        AND q.time >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
      GROUP BY YEAR(q.time), MONTH(q.time)
      ORDER BY year DESC, month DESC`,
      [dentistId]
    );

    return monthlyStats;
  }

  /**
   * ดึงข้อมูลนัดหมายในเดือนที่ระบุ
   * @param {number} dentistId
   * @param {number} year
   * @param {number} month
   * @returns {Promise<Array>}
   */
  static async getMonthlyAppointments(dentistId, year, month) {
    const [monthlyData] = await db.execute(
      `SELECT
        q.*,
        p.fname,
        p.lname,
        t.treatment_name
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      JOIN treatment t ON qd.treatment_id = t.treatment_id
      WHERE qd.dentist_id = ?
        AND YEAR(q.time) = ?
        AND MONTH(q.time) = ?
      ORDER BY q.time`,
      [dentistId, year, month]
    );

    return monthlyData;
  }

  /**
   * ดึงประวัติการรักษาของผู้ป่วยสำหรับรายงาน
   * @param {number} patientId
   * @returns {Promise<Array>}
   */
  static async getPatientTreatmentHistory(patientId) {
    const [patientHistory] = await db.execute(
      `SELECT
        q.*,
        t.treatment_name,
        d.fname as dentist_fname,
        d.lname as dentist_lname
      FROM queue q
      JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      JOIN treatment t ON qd.treatment_id = t.treatment_id
      JOIN dentist d ON qd.dentist_id = d.dentist_id
      WHERE q.patient_id = ?
      ORDER BY q.time DESC`,
      [patientId]
    );

    return patientHistory;
  }

  /**
   * ดึงสถิติรายงานแบบรวม
   * @param {number} dentistId
   * @param {Object} filters - { startDate, endDate }
   * @returns {Promise<Object>}
   */
  static async getOverallStatistics(dentistId, filters = {}) {
    const { startDate, endDate } = filters;

    let whereClause = 'WHERE qd.dentist_id = ?';
    const params = [dentistId];

    if (startDate) {
      whereClause += ' AND q.time >= ?';
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND q.time <= ?';
      params.push(endDate);
    }

    const [stats] = await db.execute(
      `SELECT
        COUNT(*) as total_appointments,
        COUNT(CASE WHEN q.queue_status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN q.queue_status = 'pending' OR q.queue_status = 'confirm' THEN 1 END) as pending,
        COUNT(CASE WHEN q.queue_status = 'cancel' THEN 1 END) as cancelled,
        COUNT(DISTINCT q.patient_id) as unique_patients,
        COUNT(DISTINCT t.treatment_id) as unique_treatments
      FROM queue q
      JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      LEFT JOIN treatment t ON qd.treatment_id = t.treatment_id
      ${whereClause}`,
      params
    );

    return stats[0];
  }

  /**
   * ดึงการรักษาที่ทำบ่อยที่สุด
   * @param {number} dentistId
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  static async getTopTreatments(dentistId, limit = 10) {
    const [treatments] = await db.execute(
      `SELECT
        t.treatment_id,
        t.treatment_name,
        COUNT(*) as count,
        COUNT(CASE WHEN q.queue_status = 'completed' THEN 1 END) as completed_count
      FROM queue q
      JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      JOIN treatment t ON qd.treatment_id = t.treatment_id
      WHERE qd.dentist_id = ?
      GROUP BY t.treatment_id, t.treatment_name
      ORDER BY count DESC
      LIMIT ?`,
      [dentistId, limit]
    );

    return treatments;
  }

  /**
   * ดึงผู้ป่วยที่มาบ่อยที่สุด
   * @param {number} dentistId
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  static async getTopPatients(dentistId, limit = 10) {
    const [patients] = await db.execute(
      `SELECT
        p.patient_id,
        p.fname,
        p.lname,
        COUNT(*) as visit_count,
        MAX(q.time) as last_visit
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      WHERE qd.dentist_id = ?
      GROUP BY p.patient_id, p.fname, p.lname
      ORDER BY visit_count DESC
      LIMIT ?`,
      [dentistId, limit]
    );

    return patients;
  }
}

module.exports = ReportModel;
