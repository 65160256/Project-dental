const db = require('../config/db');

class TreatmentModel {
  /**
   * สร้างการรักษาใหม่
   * @param {Object} treatmentData
   * @returns {Promise<Object>} { treatmentId, success }
   */
  static async create(treatmentData) {
    const { treatmentName, duration, price, description = '' } = treatmentData;

    // Validate required fields
    if (!treatmentName || !duration) {
      throw new Error('กรุณากรอกชื่อการรักษาและระยะเวลา');
    }

    // Validate duration (must be positive number)
    if (duration <= 0) {
      throw new Error('ระยะเวลาต้องมากกว่า 0 นาที');
    }

    // Validate price if provided
    if (price && price < 0) {
      throw new Error('ราคาต้องไม่ติดลบ');
    }

    // Check for duplicate treatment name
    const existing = await this.findByName(treatmentName);
    if (existing) {
      throw new Error('ชื่อการรักษานี้มีในระบบแล้ว');
    }

    const [result] = await db.execute(
      `INSERT INTO treatment
       (treatment_name, duration, price, description)
       VALUES (?, ?, ?, ?)`,
      [treatmentName, duration, price || 0, description]
    );

    return {
      treatmentId: result.insertId,
      success: true
    };
  }

  /**
   * ค้นหาการรักษาด้วย ID
   * @param {number} treatmentId
   * @returns {Promise<Object|null>}
   */
  static async findById(treatmentId) {
    const [rows] = await db.execute(
      `SELECT * FROM treatment WHERE treatment_id = ?`,
      [treatmentId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ค้นหาการรักษาด้วยชื่อ
   * @param {string} treatmentName
   * @returns {Promise<Object|null>}
   */
  static async findByName(treatmentName) {
    const [rows] = await db.execute(
      `SELECT * FROM treatment WHERE treatment_name = ?`,
      [treatmentName]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ดึงรายการการรักษาทั้งหมด
   * @param {Object} options - { limit, offset, search }
   * @returns {Promise<Array>}
   */
  static async findAll(options = {}) {
    const { limit = 50, offset = 0, search = '' } = options;

    let query = `SELECT * FROM treatment`;
    const params = [];

    if (search) {
      query += ` WHERE treatment_name LIKE ? OR description LIKE ?`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }

    query += ` ORDER BY treatment_name ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await db.execute(query, params);
    return rows;
  }

  /**
   * ดึงรายการการรักษาที่ active
   * @returns {Promise<Array>}
   */
  static async findAllActive() {
    const [rows] = await db.execute(
      `SELECT * FROM treatment ORDER BY treatment_name ASC`
    );
    return rows;
  }

  /**
   * นับจำนวนการรักษาทั้งหมด
   * @param {string} search
   * @returns {Promise<number>}
   */
  static async count(search = '') {
    let query = `SELECT COUNT(*) as total FROM treatment`;
    const params = [];

    if (search) {
      query += ` WHERE treatment_name LIKE ? OR description LIKE ?`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }

    const [rows] = await db.execute(query, params);
    return rows[0].total;
  }

  /**
   * อัปเดตการรักษา
   * @param {number} treatmentId
   * @param {Object} updateData
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async update(treatmentId, updateData) {
    const { treatmentName, duration, price, description } = updateData;

    // Validate required fields
    if (!treatmentName || !duration) {
      throw new Error('กรุณากรอกชื่อการรักษาและระยะเวลา');
    }

    // Validate duration
    if (duration <= 0) {
      throw new Error('ระยะเวลาต้องมากกว่า 0 นาที');
    }

    // Validate price
    if (price && price < 0) {
      throw new Error('ราคาต้องไม่ติดลบ');
    }

    // Check if treatment exists
    const existing = await this.findById(treatmentId);
    if (!existing) {
      throw new Error('ไม่พบข้อมูลการรักษา');
    }

    // Check for duplicate name (exclude current treatment)
    if (treatmentName !== existing.treatment_name) {
      const duplicateName = await this.findByName(treatmentName);
      if (duplicateName && duplicateName.treatment_id !== treatmentId) {
        throw new Error('ชื่อการรักษานี้มีในระบบแล้ว');
      }
    }

    const [result] = await db.execute(
      `UPDATE treatment
       SET treatment_name = ?, duration = ?, price = ?, description = ?
       WHERE treatment_id = ?`,
      [treatmentName, duration, price || 0, description || '', treatmentId]
    );

    return {
      success: true,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ลบการรักษา
   * @param {number} treatmentId
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async delete(treatmentId) {
    // Check if treatment is being used in appointments
    const [appointments] = await db.execute(
      `SELECT COUNT(*) as count FROM queue q
       JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
       WHERE qd.treatment_id = ?`,
      [treatmentId]
    );

    if (appointments[0].count > 0) {
      throw new Error('ไม่สามารถลบการรักษาที่มีการใช้งานในนัดหมายได้');
    }

    const [result] = await db.execute(
      `DELETE FROM treatment WHERE treatment_id = ?`,
      [treatmentId]
    );

    return {
      success: result.affectedRows > 0,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ดึงสถิติการใช้งานการรักษา
   * @param {number} treatmentId
   * @returns {Promise<Object>}
   */
  static async getUsageStatistics(treatmentId) {
    // Total appointments
    const [totalAppointments] = await db.execute(
      `SELECT COUNT(*) as total FROM queue WHERE treatment_id = ?`,
      [treatmentId]
    );

    // Completed appointments
    const [completedAppointments] = await db.execute(
      `SELECT COUNT(*) as total FROM queue q
       JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
       WHERE qd.treatment_id = ? AND q.queue_status = 'completed'`,
      [treatmentId]
    );

    // Total revenue (if price is set)
    const [revenue] = await db.execute(
      `SELECT SUM(t.price) as total_revenue
       FROM queue q
       JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
       JOIN treatment t ON qd.treatment_id = t.treatment_id
       WHERE qd.treatment_id = ? AND q.queue_status = 'completed'`,
      [treatmentId]
    );

    return {
      totalAppointments: totalAppointments[0].total,
      completedAppointments: completedAppointments[0].total,
      totalRevenue: revenue[0].total_revenue || 0
    };
  }

  /**
   * ดึงรายการการรักษาที่ได้รับความนิยม
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  static async findPopular(limit = 5) {
    const [rows] = await db.execute(
      `SELECT
        t.*,
        COUNT(q.queue_id) as appointment_count
       FROM treatment t
       LEFT JOIN queuedetail qd ON t.treatment_id = qd.treatment_id
       LEFT JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
       GROUP BY t.treatment_id
       ORDER BY appointment_count DESC
       LIMIT ?`,
      [limit]
    );
    return rows;
  }
}

module.exports = TreatmentModel;
