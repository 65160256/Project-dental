const db = require('../config/db');

/**
 * QueueDetail Model
 * จัดการข้อมูล queuedetail table - รายละเอียดคิวนัดหมาย
 */
class QueueDetailModel {
  /**
   * สร้าง queuedetail ใหม่
   * @param {Object} queueDetailData - { patientId, dentistId, treatmentId, date }
   * @returns {Promise<Object>} { queuedetailId, success }
   */
  static async create(queueDetailData) {
    const { patientId, dentistId, treatmentId, date, note = null } = queueDetailData;

    // Validate required fields
    if (!patientId || !dentistId || !treatmentId || !date) {
      throw new Error('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน');
    }

    const [result] = await db.execute(
      `INSERT INTO queuedetail (patient_id, dentist_id, treatment_id, date, note)
       VALUES (?, ?, ?, ?, ?)`,
      [patientId, dentistId, treatmentId, date, note]
    );

    return {
      queuedetailId: result.insertId,
      success: true
    };
  }

  /**
   * ค้นหา queuedetail ด้วย ID
   * @param {number} queuedetailId
   * @returns {Promise<Object|null>}
   */
  static async findById(queuedetailId) {
    const [rows] = await db.execute(
      `SELECT * FROM queuedetail WHERE queuedetail_id = ?`,
      [queuedetailId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ค้นหา queuedetail ด้วย queue_id
   * @param {number} queueId
   * @returns {Promise<Object|null>}
   */
  static async findByQueueId(queueId) {
    const [rows] = await db.execute(
      `SELECT qd.*
       FROM queuedetail qd
       JOIN queue q ON qd.queuedetail_id = q.queuedetail_id
       WHERE q.queue_id = ?`,
      [queueId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ดึง queuedetails ทั้งหมดของผู้ป่วย
   * @param {number} patientId
   * @param {Object} options - { limit, offset }
   * @returns {Promise<Array>}
   */
  static async findByPatientId(patientId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const [rows] = await db.execute(
      `SELECT
        qd.*,
        d.fname as dentist_fname,
        d.lname as dentist_lname,
        t.treatment_name
       FROM queuedetail qd
       JOIN dentist d ON qd.dentist_id = d.dentist_id
       JOIN treatment t ON qd.treatment_id = t.treatment_id
       WHERE qd.patient_id = ?
       ORDER BY qd.date DESC
       LIMIT ? OFFSET ?`,
      [patientId, limit, offset]
    );

    return rows;
  }

  /**
   * ดึง queuedetails ทั้งหมดของทันตแพทย์
   * @param {number} dentistId
   * @param {Object} options - { date, limit, offset }
   * @returns {Promise<Array>}
   */
  static async findByDentistId(dentistId, options = {}) {
    const { date = null, limit = 50, offset = 0 } = options;

    let query = `
      SELECT
        qd.*,
        p.fname as patient_fname,
        p.lname as patient_lname,
        p.phone as patient_phone,
        t.treatment_name
      FROM queuedetail qd
      JOIN patient p ON qd.patient_id = p.patient_id
      JOIN treatment t ON qd.treatment_id = t.treatment_id
      WHERE qd.dentist_id = ?
    `;

    const params = [dentistId];

    if (date) {
      query += ` AND DATE(qd.date) = ?`;
      params.push(date);
    }

    query += ` ORDER BY qd.date DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await db.execute(query, params);
    return rows;
  }

  /**
   * ดึง queuedetails ทั้งหมดในวันที่กำหนด
   * @param {string} date - 'YYYY-MM-DD'
   * @returns {Promise<Array>}
   */
  static async findByDate(date) {
    const [rows] = await db.execute(
      `SELECT
        qd.*,
        p.fname as patient_fname,
        p.lname as patient_lname,
        d.fname as dentist_fname,
        d.lname as dentist_lname,
        t.treatment_name
       FROM queuedetail qd
       JOIN patient p ON qd.patient_id = p.patient_id
       JOIN dentist d ON qd.dentist_id = d.dentist_id
       JOIN treatment t ON qd.treatment_id = t.treatment_id
       WHERE DATE(qd.date) = ?
       ORDER BY qd.date ASC`,
      [date]
    );

    return rows;
  }

  /**
   * อัปเดต queuedetail
   * @param {number} queuedetailId
   * @param {Object} updateData - { patientId, dentistId, treatmentId, date }
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async update(queuedetailId, updateData) {
    const { patientId, dentistId, treatmentId, date } = updateData;

    // Check if queuedetail exists
    const existing = await this.findById(queuedetailId);
    if (!existing) {
      throw new Error('ไม่พบข้อมูล queuedetail');
    }

    const [result] = await db.execute(
      `UPDATE queuedetail
       SET patient_id = ?, dentist_id = ?, treatment_id = ?, date = ?
       WHERE queuedetail_id = ?`,
      [patientId, dentistId, treatmentId, date, queuedetailId]
    );

    return {
      success: result.affectedRows > 0,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ลบ queuedetail
   * @param {number} queuedetailId
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async delete(queuedetailId) {
    // Check if queuedetail has related queue records
    const [queues] = await db.execute(
      `SELECT COUNT(*) as count FROM queue WHERE queuedetail_id = ?`,
      [queuedetailId]
    );

    if (queues[0].count > 0) {
      throw new Error('ไม่สามารถลบ queuedetail ที่มีคิวที่เกี่ยวข้องได้');
    }

    const [result] = await db.execute(
      `DELETE FROM queuedetail WHERE queuedetail_id = ?`,
      [queuedetailId]
    );

    return {
      success: result.affectedRows > 0,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ค้นหา queuedetail พร้อมข้อมูล treatment history
   * @param {number} queuedetailId
   * @returns {Promise<Object|null>}
   */
  static async findByIdWithHistory(queuedetailId) {
    const [rows] = await db.execute(
      `SELECT
        qd.*,
        p.fname as patient_fname,
        p.lname as patient_lname,
        p.phone as patient_phone,
        d.fname as dentist_fname,
        d.lname as dentist_lname,
        t.treatment_name,
        t.duration,
        t.price,
        th.diagnosis,
        th.followUpdate,
        q.queue_status,
        q.time as queue_time
       FROM queuedetail qd
       JOIN patient p ON qd.patient_id = p.patient_id
       JOIN dentist d ON qd.dentist_id = d.dentist_id
       JOIN treatment t ON qd.treatment_id = t.treatment_id
       LEFT JOIN treatmentHistory th ON qd.queuedetail_id = th.queuedetail_id
       LEFT JOIN queue q ON qd.queuedetail_id = q.queuedetail_id
       WHERE qd.queuedetail_id = ?`,
      [queuedetailId]
    );

    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * นับจำนวน queuedetails
   * @param {Object} filters - { patientId, dentistId, date }
   * @returns {Promise<number>}
   */
  static async count(filters = {}) {
    const { patientId, dentistId, date } = filters;

    let query = `SELECT COUNT(*) as total FROM queuedetail WHERE 1=1`;
    const params = [];

    if (patientId) {
      query += ` AND patient_id = ?`;
      params.push(patientId);
    }

    if (dentistId) {
      query += ` AND dentist_id = ?`;
      params.push(dentistId);
    }

    if (date) {
      query += ` AND DATE(date) = ?`;
      params.push(date);
    }

    const [rows] = await db.execute(query, params);
    return rows[0].total;
  }

  /**
   * ดึง appointments ตามวันที่ (สำหรับ calendar view)
   * @param {string} date - วันที่ในรูปแบบ YYYY-MM-DD
   * @returns {Promise<Array>}
   */
  static async getAppointmentsByDate(date) {
    const [rows] = await db.execute(
      `SELECT
        qd.date AS time_start,
        CONCAT(p.fname, ' ', p.lname) AS name,
        t.treatment_name AS treatment,
        CONCAT(d.fname, ' ', d.lname) AS dentist,
        p.phone,
        q.queue_status AS status
      FROM queuedetail qd
      JOIN patient p ON qd.patient_id = p.patient_id
      JOIN treatment t ON qd.treatment_id = t.treatment_id
      JOIN dentist d ON qd.dentist_id = d.dentist_id
      JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
      WHERE DATE(qd.date) = ?
      ORDER BY qd.date DESC`,
      [date]
    );
    return rows;
  }

  /**
   * ตรวจสอบว่า queuedetail เป็นของทันตแพทย์คนนี้หรือไม่
   * @param {number} queuedetailId
   * @param {number} dentistId
   * @returns {Promise<boolean>}
   */
  static async belongsToDentist(queuedetailId, dentistId) {
    const [rows] = await db.execute(
      `SELECT queuedetail_id
       FROM queuedetail
       WHERE queuedetail_id = ? AND dentist_id = ?`,
      [queuedetailId, dentistId]
    );
    return rows.length > 0;
  }
}

module.exports = QueueDetailModel;
