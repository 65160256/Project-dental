const db = require('../config/db');

class TreatmentHistoryModel {
  /**
   * สร้างประวัติการรักษาใหม่
   * @param {Object} historyData
   * @returns {Promise<Object>} { historyId, success }
   */
  static async create(historyData) {
    const {
      queuedetailId,
      diagnosis,
      followUpdate = ''
    } = historyData;

    // Validate required fields
    if (!queuedetailId || !diagnosis || !diagnosis.trim()) {
      throw new Error('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน');
    }

    // Validate diagnosis length
    if (diagnosis.trim().length < 20) {
      throw new Error('กรุณากรอกรายละเอียดการรักษาอย่างน้อย 20 ตัวอักษร');
    }

    // Check if treatment history already exists for this queuedetail
    const existing = await this.findByQueueDetailId(queuedetailId);
    if (existing) {
      throw new Error('มีประวัติการรักษาสำหรับคิวนี้แล้ว ใช้ฟังก์ชัน update แทน');
    }

    const [result] = await db.execute(
      `INSERT INTO treatmentHistory
       (queuedetail_id, diagnosis, followUpdate)
       VALUES (?, ?, ?)`,
      [queuedetailId, diagnosis.trim(), followUpdate.trim()]
    );

    return {
      historyId: result.insertId,
      success: true
    };
  }

  /**
   * ค้นหาประวัติการรักษาด้วย ID
   * @param {number} historyId
   * @returns {Promise<Object|null>}
   */
  static async findById(historyId) {
    const [rows] = await db.execute(
      `SELECT * FROM treatmentHistory WHERE tmh_id = ?`,
      [historyId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ค้นหาประวัติการรักษาด้วย queuedetail_id
   * @param {number} queuedetailId
   * @returns {Promise<Object|null>}
   */
  static async findByQueueDetailId(queuedetailId) {
    const [rows] = await db.execute(
      `SELECT * FROM treatmentHistory WHERE queuedetail_id = ?`,
      [queuedetailId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ค้นหาประวัติการรักษาพร้อมข้อมูลที่เกี่ยวข้อง
   * @param {number} queueId
   * @returns {Promise<Object|null>}
   */
  static async findByQueueIdWithDetails(queueId) {
    const [rows] = await db.execute(
      `SELECT
        th.*,
        qd.queuedetail_id,
        q.queue_id,
        q.time,
        q.time as appointment_time,
        q.queue_status,
        p.patient_id,
        p.fname as patient_fname,
        p.lname as patient_lname,
        p.phone,
        p.phone as patient_phone,
        p.dob,
        p.dob as patient_dob,
        p.gender,
        p.gender as patient_gender,
        p.address,
        p.address as patient_address,
        p.id_card,
        p.id_card as patient_id_card,
        p.chronic_disease,
        p.allergy_history,
        d.dentist_id,
        d.fname as dentist_fname,
        d.lname as dentist_lname,
        d.specialty as dentist_specialty,
        t.treatment_id,
        t.treatment_name,
        t.duration
      FROM treatmentHistory th
      JOIN queuedetail qd ON th.queuedetail_id = qd.queuedetail_id
      JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN dentist d ON qd.dentist_id = d.dentist_id
      JOIN treatment t ON qd.treatment_id = t.treatment_id
      WHERE q.queue_id = ?`,
      [queueId]
    );

    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ดึงประวัติการรักษาทั้งหมดของผู้ป่วย
   * @param {number} patientId
   * @param {Object} options - { limit, offset }
   * @returns {Promise<Array>}
   */
  static async findByPatientId(patientId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const [rows] = await db.execute(
      `SELECT
        th.*,
        q.queue_id,
        q.time as appointment_time,
        qd.date as appointment_date,
        d.fname as dentist_fname,
        d.lname as dentist_lname,
        t.treatment_name,
        t.duration
      FROM treatmentHistory th
      JOIN queuedetail qd ON th.queuedetail_id = qd.queuedetail_id
      JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
      JOIN dentist d ON qd.dentist_id = d.dentist_id
      JOIN treatment t ON qd.treatment_id = t.treatment_id
      WHERE q.patient_id = ?
      ORDER BY q.time DESC
      LIMIT ? OFFSET ?`,
      [patientId, limit, offset]
    );

    return rows;
  }

  /**
   * ดึงประวัติการรักษาทั้งหมดของทันตแพทย์
   * @param {number} dentistId
   * @param {Object} options - { limit, offset }
   * @returns {Promise<Array>}
   */
  static async findByDentistId(dentistId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const [rows] = await db.execute(
      `SELECT
        th.*,
        q.queue_id,
        q.time as appointment_time,
        qd.date as appointment_date,
        p.fname as patient_fname,
        p.lname as patient_lname,
        t.treatment_name,
        t.duration
      FROM treatmentHistory th
      JOIN queuedetail qd ON th.queuedetail_id = qd.queuedetail_id
      JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN treatment t ON qd.treatment_id = t.treatment_id
      WHERE qd.dentist_id = ?
      ORDER BY q.time DESC
      LIMIT ? OFFSET ?`,
      [dentistId, limit, offset]
    );

    return rows;
  }

  /**
   * อัปเดตประวัติการรักษา
   * @param {number} queuedetailId
   * @param {Object} updateData
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async update(queuedetailId, updateData) {
    const { diagnosis, followUpdate = '' } = updateData;

    // Validate required fields
    if (!diagnosis || !diagnosis.trim()) {
      throw new Error('กรุณากรอกข้อมูลการรักษา');
    }

    // Validate diagnosis length
    if (diagnosis.trim().length < 20) {
      throw new Error('กรุณากรอกรายละเอียดการรักษาอย่างน้อย 20 ตัวอักษร');
    }

    const [result] = await db.execute(
      `UPDATE treatmentHistory
       SET diagnosis = ?, followUpdate = ?
       WHERE queuedetail_id = ?`,
      [diagnosis.trim(), followUpdate.trim(), queuedetailId]
    );

    return {
      success: result.affectedRows > 0,
      affectedRows: result.affectedRows
    };
  }

  /**
   * สร้างหรืออัปเดตประวัติการรักษา
   * @param {Object} historyData
   * @returns {Promise<Object>} { historyId, success, action: 'created'|'updated' }
   */
  static async createOrUpdate(historyData) {
    const { queuedetailId } = historyData;

    if (!queuedetailId) {
      throw new Error('ไม่พบ queuedetail_id');
    }

    // Check if already exists
    const existing = await this.findByQueueDetailId(queuedetailId);

    if (existing) {
      // Update existing record
      await this.update(queuedetailId, historyData);
      return {
        historyId: existing.tmh_id,
        success: true,
        action: 'updated'
      };
    } else {
      // Create new record
      const result = await this.create(historyData);
      return {
        ...result,
        action: 'created'
      };
    }
  }

  /**
   * ลบประวัติการรักษา
   * @param {number} historyId
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async delete(historyId) {
    const [result] = await db.execute(
      `DELETE FROM treatmentHistory WHERE tmh_id = ?`,
      [historyId]
    );

    return {
      success: result.affectedRows > 0,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ลบประวัติการรักษาด้วย queuedetail_id
   * @param {number} queuedetailId
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async deleteByQueueDetailId(queuedetailId) {
    const [result] = await db.execute(
      `DELETE FROM treatmentHistory WHERE queuedetail_id = ?`,
      [queuedetailId]
    );

    return {
      success: result.affectedRows > 0,
      affectedRows: result.affectedRows
    };
  }

  /**
   * นับจำนวนประวัติการรักษา
   * @param {Object} filters - { patientId, dentistId }
   * @returns {Promise<number>}
   */
  static async count(filters = {}) {
    const { patientId, dentistId } = filters;

    let query = `
      SELECT COUNT(*) as total
      FROM treatmentHistory th
      JOIN queuedetail qd ON th.queuedetail_id = qd.queuedetail_id
      JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
      WHERE 1=1
    `;

    const params = [];

    if (patientId) {
      query += ` AND q.patient_id = ?`;
      params.push(patientId);
    }

    if (dentistId) {
      query += ` AND qd.dentist_id = ?`;
      params.push(dentistId);
    }

    const [rows] = await db.execute(query, params);
    return rows[0].total;
  }

  /**
   * ดึงสถิติประวัติการรักษา
   * @param {Object} filters - { patientId, dentistId, startDate, endDate }
   * @returns {Promise<Object>}
   */
  static async getStatistics(filters = {}) {
    const { patientId, dentistId, startDate, endDate } = filters;

    let query = `
      SELECT
        COUNT(*) as total_treatments,
        COUNT(DISTINCT q.patient_id) as unique_patients,
        COUNT(DISTINCT qd.dentist_id) as unique_dentists,
        COUNT(DISTINCT qd.treatment_id) as unique_treatment_types
      FROM treatmentHistory th
      JOIN queuedetail qd ON th.queuedetail_id = qd.queuedetail_id
      JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
      WHERE 1=1
    `;

    const params = [];

    if (patientId) {
      query += ` AND q.patient_id = ?`;
      params.push(patientId);
    }

    if (dentistId) {
      query += ` AND qd.dentist_id = ?`;
      params.push(dentistId);
    }

    if (startDate) {
      query += ` AND q.time >= ?`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND q.time <= ?`;
      params.push(endDate);
    }

    const [rows] = await db.execute(query, params);
    return rows[0];
  }
}

module.exports = TreatmentHistoryModel;
