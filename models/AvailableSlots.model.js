const db = require('../config/db');

/**
 * AvailableSlots Model
 * จัดการช่วงเวลาว่างสำหรับการนัดหมาย
 */
class AvailableSlotsModel {
  /**
   * สร้างช่วงเวลาว่างใหม่
   * @param {Object} slotData - { dentistId, date, startTime, endTime, status }
   * @returns {Promise<Object>} { slotId, success }
   */
  static async create(slotData) {
    const {
      dentistId,
      date,
      startTime,
      endTime,
      status = 'available'
    } = slotData;

    // Validate required fields
    if (!dentistId || !date || !startTime || !endTime) {
      throw new Error('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน (dentistId, date, startTime, endTime)');
    }

    // Validate status
    const validStatuses = ['available', 'booked', 'unavailable'];
    if (status && !validStatuses.includes(status)) {
      throw new Error('สถานะไม่ถูกต้อง (available, booked, unavailable)');
    }

    const [result] = await db.execute(
      `INSERT INTO available_slots (dentist_id, date, start_time, end_time, status)
       VALUES (?, ?, ?, ?, ?)`,
      [dentistId, date, startTime, endTime, status]
    );

    return {
      slotId: result.insertId,
      success: true
    };
  }

  /**
   * ค้นหาช่วงเวลาว่างด้วย ID
   * @param {number} slotId
   * @returns {Promise<Object|null>}
   */
  static async findById(slotId) {
    const [rows] = await db.execute(
      `SELECT * FROM available_slots WHERE slot_id = ?`,
      [slotId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ดึงช่วงเวลาว่างทั้งหมดในวันที่กำหนด
   * @param {string} date - 'YYYY-MM-DD'
   * @param {string} status - 'available', 'booked', 'unavailable' (optional)
   * @returns {Promise<Array>}
   */
  static async findByDate(date, status = null) {
    let query = `
      SELECT
        s.*,
        d.fname as dentist_fname,
        d.lname as dentist_lname,
        d.specialty
      FROM available_slots s
      JOIN dentist d ON s.dentist_id = d.dentist_id
      WHERE s.date = ?
    `;

    const params = [date];

    if (status) {
      query += ` AND s.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY s.start_time ASC`;

    const [rows] = await db.execute(query, params);
    return rows;
  }

  /**
   * ดึงช่วงเวลาว่างของทันตแพทย์ในวันที่กำหนด
   * @param {number} dentistId
   * @param {string} date - 'YYYY-MM-DD'
   * @param {string} status - 'available', 'booked', 'unavailable' (optional)
   * @returns {Promise<Array>}
   */
  static async findByDentistAndDate(dentistId, date, status = null) {
    let query = `
      SELECT * FROM available_slots
      WHERE dentist_id = ? AND date = ?
    `;

    const params = [dentistId, date];

    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }

    query += ` ORDER BY start_time ASC`;

    const [rows] = await db.execute(query, params);
    return rows;
  }

  /**
   * ดึงช่วงเวลาว่างของทันตแพทย์ในช่วงวันที่
   * @param {number} dentistId
   * @param {string} startDate - 'YYYY-MM-DD'
   * @param {string} endDate - 'YYYY-MM-DD'
   * @param {string} status - 'available', 'booked', 'unavailable' (optional)
   * @returns {Promise<Array>}
   */
  static async findByDentistAndDateRange(dentistId, startDate, endDate, status = null) {
    let query = `
      SELECT * FROM available_slots
      WHERE dentist_id = ?
        AND date BETWEEN ? AND ?
    `;

    const params = [dentistId, startDate, endDate];

    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }

    query += ` ORDER BY date ASC, start_time ASC`;

    const [rows] = await db.execute(query, params);
    return rows;
  }

  /**
   * ทำเครื่องหมายช่วงเวลาว่างว่าถูกจองแล้ว
   * @param {number} slotId
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async markAsBooked(slotId) {
    // Check if slot exists and is available
    const slot = await this.findById(slotId);
    if (!slot) {
      throw new Error('ไม่พบข้อมูลช่วงเวลาว่าง');
    }

    if (slot.status === 'booked') {
      throw new Error('ช่วงเวลานี้ถูกจองแล้ว');
    }

    if (slot.status === 'unavailable') {
      throw new Error('ช่วงเวลานี้ไม่สามารถจองได้');
    }

    const [result] = await db.execute(
      `UPDATE available_slots SET status = 'booked' WHERE slot_id = ?`,
      [slotId]
    );

    return {
      success: result.affectedRows > 0,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ทำเครื่องหมายช่วงเวลาว่างว่าว่างอีกครั้ง
   * @param {number} slotId
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async markAsAvailable(slotId) {
    const [result] = await db.execute(
      `UPDATE available_slots SET status = 'available' WHERE slot_id = ?`,
      [slotId]
    );

    return {
      success: result.affectedRows > 0,
      affectedRows: result.affectedRows
    };
  }

  /**
   * อัปเดตสถานะช่วงเวลาว่าง
   * @param {number} slotId
   * @param {string} status - 'available', 'booked', 'unavailable'
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async updateStatus(slotId, status) {
    const validStatuses = ['available', 'booked', 'unavailable'];
    if (!validStatuses.includes(status)) {
      throw new Error('สถานะไม่ถูกต้อง');
    }

    const [result] = await db.execute(
      `UPDATE available_slots SET status = ? WHERE slot_id = ?`,
      [status, slotId]
    );

    return {
      success: result.affectedRows > 0,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ลบช่วงเวลาว่างที่เก่ากว่าวันที่กำหนด
   * @param {string} beforeDate - 'YYYY-MM-DD'
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async deleteOld(beforeDate) {
    const [result] = await db.execute(
      `DELETE FROM available_slots WHERE date < ?`,
      [beforeDate]
    );

    return {
      success: true,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ลบช่วงเวลาว่าง
   * @param {number} slotId
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async delete(slotId) {
    // Check if slot is booked
    const slot = await this.findById(slotId);
    if (slot && slot.status === 'booked') {
      throw new Error('ไม่สามารถลบช่วงเวลาที่ถูกจองแล้วได้');
    }

    const [result] = await db.execute(
      `DELETE FROM available_slots WHERE slot_id = ?`,
      [slotId]
    );

    return {
      success: result.affectedRows > 0,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ลบช่วงเวลาว่างทั้งหมดของทันตแพทย์ในวันที่กำหนด
   * @param {number} dentistId
   * @param {string} date - 'YYYY-MM-DD'
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async deleteByDentistAndDate(dentistId, date) {
    const [result] = await db.execute(
      `DELETE FROM available_slots WHERE dentist_id = ? AND date = ?`,
      [dentistId, date]
    );

    return {
      success: true,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ดึงสถิติช่วงเวลาว่าง
   * @param {string} startDate - 'YYYY-MM-DD'
   * @param {string} endDate - 'YYYY-MM-DD'
   * @param {number} dentistId - optional
   * @returns {Promise<Object>} { total, available, booked, unavailable }
   */
  static async getStatistics(startDate, endDate, dentistId = null) {
    let query = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available,
        SUM(CASE WHEN status = 'booked' THEN 1 ELSE 0 END) as booked,
        SUM(CASE WHEN status = 'unavailable' THEN 1 ELSE 0 END) as unavailable
      FROM available_slots
      WHERE date BETWEEN ? AND ?
    `;

    const params = [startDate, endDate];

    if (dentistId) {
      query += ` AND dentist_id = ?`;
      params.push(dentistId);
    }

    const [rows] = await db.execute(query, params);
    return rows[0];
  }

  /**
   * ตรวจสอบว่าช่วงเวลาว่างหรือไม่
   * @param {number} dentistId
   * @param {string} date - 'YYYY-MM-DD'
   * @param {string} startTime - 'HH:MM:SS'
   * @param {string} endTime - 'HH:MM:SS'
   * @returns {Promise<boolean>}
   */
  static async isAvailable(dentistId, date, startTime, endTime) {
    const [rows] = await db.execute(
      `SELECT COUNT(*) as count
       FROM available_slots
       WHERE dentist_id = ?
         AND date = ?
         AND start_time = ?
         AND end_time = ?
         AND status = 'available'`,
      [dentistId, date, startTime, endTime]
    );

    return rows[0].count > 0;
  }

  /**
   * นับจำนวนช่วงเวลาว่าง
   * @param {Object} filters - { dentistId, date, status }
   * @returns {Promise<number>}
   */
  static async count(filters = {}) {
    const { dentistId, date, status } = filters;

    let query = `SELECT COUNT(*) as total FROM available_slots WHERE 1=1`;
    const params = [];

    if (dentistId) {
      query += ` AND dentist_id = ?`;
      params.push(dentistId);
    }

    if (date) {
      query += ` AND date = ?`;
      params.push(date);
    }

    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }

    const [rows] = await db.execute(query, params);
    return rows[0].total;
  }

  /**
   * สร้างช่วงเวลาว่างหลายรายการพร้อมกัน (bulk insert)
   * @param {Array} slots - [{ dentistId, date, startTime, endTime, status }, ...]
   * @returns {Promise<Object>} { success, insertedCount }
   */
  static async createBulk(slots) {
    if (!Array.isArray(slots) || slots.length === 0) {
      throw new Error('กรุณาระบุข้อมูลช่วงเวลาว่าง');
    }

    const values = [];
    const params = [];

    for (const slot of slots) {
      const { dentistId, date, startTime, endTime, status = 'available' } = slot;

      if (!dentistId || !date || !startTime || !endTime) {
        throw new Error('ข้อมูลไม่ครบถ้วน');
      }

      values.push('(?, ?, ?, ?, ?)');
      params.push(dentistId, date, startTime, endTime, status);
    }

    const query = `
      INSERT INTO available_slots (dentist_id, date, start_time, end_time, status)
      VALUES ${values.join(', ')}
    `;

    const [result] = await db.execute(query, params);

    return {
      success: true,
      insertedCount: result.affectedRows
    };
  }

  /**
   * อัปเดตช่วงเวลาว่าง
   * @param {number} slotId
   * @param {Object} updateData - { date, startTime, endTime, status }
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async update(slotId, updateData) {
    const { date, startTime, endTime, status } = updateData;

    // Check if slot exists
    const existing = await this.findById(slotId);
    if (!existing) {
      throw new Error('ไม่พบข้อมูลช่วงเวลาว่าง');
    }

    // Build dynamic update query
    const updates = [];
    const params = [];

    if (date) {
      updates.push('date = ?');
      params.push(date);
    }
    if (startTime) {
      updates.push('start_time = ?');
      params.push(startTime);
    }
    if (endTime) {
      updates.push('end_time = ?');
      params.push(endTime);
    }
    if (status) {
      const validStatuses = ['available', 'booked', 'unavailable'];
      if (!validStatuses.includes(status)) {
        throw new Error('สถานะไม่ถูกต้อง');
      }
      updates.push('status = ?');
      params.push(status);
    }

    if (updates.length === 0) {
      throw new Error('ไม่มีข้อมูลที่ต้องการอัปเดต');
    }

    params.push(slotId);

    const [result] = await db.execute(
      `UPDATE available_slots SET ${updates.join(', ')} WHERE slot_id = ?`,
      params
    );

    return {
      success: true,
      affectedRows: result.affectedRows
    };
  }

  // ========== METHODS FOR ADMIN SLOTS CONTROLLER ==========

  /**
   * เรียกใช้ stored procedure สร้าง slots
   * @param {string} startDate - 'YYYY-MM-DD'
   * @param {string} endDate - 'YYYY-MM-DD'
   * @returns {Promise<Object>} { success }
   */
  static async generateSlots(startDate, endDate) {
    await db.execute('CALL generate_available_slots(?, ?)', [startDate, endDate]);
    return { success: true };
  }

  /**
   * ดึงสถิติ slots สำหรับ admin
   * @returns {Promise<Object>} { overall, by_dentist, next_7_days }
   */
  static async getSlotsStatistics() {
    // Overall stats
    const [stats] = await db.execute(`
      SELECT
        COUNT(*) as total_slots,
        COUNT(CASE WHEN is_available = 1 THEN 1 END) as available_slots,
        COUNT(CASE WHEN is_available = 0 THEN 1 END) as booked_slots,
        COUNT(DISTINCT dentist_id) as total_dentists,
        COUNT(DISTINCT date) as total_days,
        MIN(date) as earliest_date,
        MAX(date) as latest_date
      FROM available_slots
      WHERE date >= CURDATE()
    `);

    // By dentist
    const [slotsByDentist] = await db.execute(`
      SELECT
        d.dentist_id,
        CONCAT(d.fname, ' ', d.lname) as dentist_name,
        d.specialty,
        COUNT(s.slot_id) as total_slots,
        COUNT(CASE WHEN s.is_available = 1 THEN 1 END) as available_slots,
        COUNT(CASE WHEN s.is_available = 0 THEN 1 END) as booked_slots
      FROM dentist d
      LEFT JOIN available_slots s ON d.dentist_id = s.dentist_id AND s.date >= CURDATE()
      WHERE d.user_id IS NOT NULL
      GROUP BY d.dentist_id, d.fname, d.lname, d.specialty
      ORDER BY d.fname, d.lname
    `);

    // Next 7 days
    const [slotsByDate] = await db.execute(`
      SELECT
        date,
        COUNT(*) as total_slots,
        COUNT(CASE WHEN is_available = 1 THEN 1 END) as available_slots,
        COUNT(CASE WHEN is_available = 0 THEN 1 END) as booked_slots,
        COUNT(DISTINCT dentist_id) as dentists_working
      FROM available_slots
      WHERE date >= CURDATE()
      AND date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
      GROUP BY date
      ORDER BY date
    `);

    return {
      overall: stats[0],
      by_dentist: slotsByDentist,
      next_7_days: slotsByDate
    };
  }

  /**
   * ลบ slots เก่า (ก่อนวันนี้)
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async cleanupOldSlots() {
    const [result] = await db.execute(`
      DELETE FROM available_slots
      WHERE date < CURDATE()
    `);

    return {
      success: true,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ดึง slots ของทันตแพทย์ในวันที่กำหนด พร้อม join ข้อมูล
   * @param {number} dentistId
   * @param {string} date - 'YYYY-MM-DD'
   * @returns {Promise<Array>}
   */
  static async getDentistSlotsWithDetails(dentistId, date) {
    const [slots] = await db.execute(`
      SELECT
        s.slot_id,
        s.date,
        s.start_time,
        s.end_time,
        s.is_available,
        s.treatment_id,
        t.treatment_name,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM queue q
            WHERE q.dentist_id = s.dentist_id
            AND DATE(q.time) = s.date
            AND TIME(q.time) = s.start_time
            AND q.queue_status IN ('pending', 'confirm')
          ) THEN 'booked'
          WHEN s.is_available = 1 THEN 'available'
          ELSE 'unavailable'
        END as status,
        q.queue_id,
        CONCAT(p.fname, ' ', p.lname) as patient_name
      FROM available_slots s
      LEFT JOIN treatment t ON s.treatment_id = t.treatment_id
      LEFT JOIN queue q ON s.dentist_id = q.dentist_id
        AND DATE(q.time) = s.date
        AND TIME(q.time) = s.start_time
        AND q.queue_status IN ('pending', 'confirm')
      LEFT JOIN patient p ON q.patient_id = p.patient_id
      WHERE s.dentist_id = ?
      AND s.date = ?
      ORDER BY s.start_time
    `, [dentistId, date]);

    return slots;
  }

  /**
   * ตรวจสอบว่า slot มีอยู่แล้วหรือไม่
   * @param {number} dentistId
   * @param {string} date
   * @param {string} startTime
   * @returns {Promise<boolean>}
   */
  static async slotExists(dentistId, date, startTime) {
    const [existing] = await db.execute(`
      SELECT slot_id FROM available_slots
      WHERE dentist_id = ? AND date = ? AND start_time = ?
    `, [dentistId, date, startTime]);

    return existing.length > 0;
  }

  /**
   * สร้าง slot เดี่ยว (manual create)
   * @param {Object} slotData - { dentist_id, date, start_time, end_time }
   * @returns {Promise<Object>} { success, slotId }
   */
  static async createSlot(slotData) {
    const { dentist_id, date, start_time, end_time } = slotData;

    const [result] = await db.execute(`
      INSERT INTO available_slots (dentist_id, date, start_time, end_time, is_available)
      VALUES (?, ?, ?, ?, 1)
    `, [dentist_id, date, start_time, end_time]);

    return {
      success: true,
      slotId: result.insertId
    };
  }

  /**
   * ดึงข้อมูล slot พร้อมตรวจสอบ booking status
   * @param {number} slotId
   * @returns {Promise<Object|null>}
   */
  static async getSlotWithBookingStatus(slotId) {
    const [slot] = await db.execute(`
      SELECT s.*, q.queue_id
      FROM available_slots s
      LEFT JOIN queue q ON s.dentist_id = q.dentist_id
        AND DATE(q.time) = s.date
        AND TIME(q.time) = s.start_time
        AND q.queue_status IN ('pending', 'confirm')
      WHERE s.slot_id = ?
    `, [slotId]);

    return slot.length > 0 ? slot[0] : null;
  }

  /**
   * ลบ slot โดย ID
   * @param {number} slotId
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async deleteSlot(slotId) {
    const [result] = await db.execute(
      'DELETE FROM available_slots WHERE slot_id = ?',
      [slotId]
    );

    return {
      success: result.affectedRows > 0,
      affectedRows: result.affectedRows
    };
  }

  /**
   * อัพเดต availability ของ slot
   * @param {number} slotId
   * @param {boolean} isAvailable
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async updateSlotAvailability(slotId, isAvailable) {
    const [result] = await db.execute(`
      UPDATE available_slots
      SET is_available = ?, updated_at = NOW()
      WHERE slot_id = ?
    `, [isAvailable ? 1 : 0, slotId]);

    return {
      success: result.affectedRows > 0,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ดึงทันตแพทย์ที่มีช่วงเวลาว่างในวันที่กำหนด (สำหรับหน้าจอง)
   * @param {string} date - 'YYYY-MM-DD'
   * @param {number} treatmentId - optional
   * @returns {Promise<Array>}
   */
  static async getAvailableDentistsForBooking(date, treatmentId = null) {
    let query = `
      SELECT
        d.dentist_id,
        d.fname,
        d.lname,
        d.specialty,
        d.phone,
        d.education,
        CASE
          WHEN d.photo IS NULL OR d.photo = '' OR d.photo = 'default-avatar.png'
          THEN 'default-doctor.png'
          ELSE d.photo
        END as photo,
        COUNT(DISTINCT s.slot_id) as total_slots,
        COUNT(DISTINCT CASE
          WHEN s.is_available = 1
          AND NOT EXISTS (
            SELECT 1 FROM queue q
            WHERE q.dentist_id = s.dentist_id
            AND DATE(q.time) = s.date
            AND TIME(q.time) = s.start_time
            AND q.queue_status IN ('pending', 'confirm')
          ) THEN s.slot_id
        END) as available_slots
      FROM dentist d
      INNER JOIN available_slots s ON d.dentist_id = s.dentist_id
      WHERE s.date = ?
      AND d.user_id IS NOT NULL
    `;

    const queryParams = [date];

    // Filter by treatment if provided
    if (treatmentId) {
      query += ` AND EXISTS (
        SELECT 1 FROM dentist_treatment dt
        WHERE dt.dentist_id = d.dentist_id
        AND dt.treatment_id = ?
      )`;
      queryParams.push(treatmentId);
    }

    query += `
      GROUP BY d.dentist_id, d.fname, d.lname, d.specialty, d.phone, d.education, d.photo
      HAVING available_slots > 0
      ORDER BY d.fname, d.lname
    `;

    const [dentists] = await db.execute(query, queryParams);
    return dentists;
  }

  /**
   * ดึงช่วงเวลาว่างสำหรับการจอง (สำหรับ time slot picker)
   * @param {string} date - 'YYYY-MM-DD'
   * @param {number} dentistId
   * @param {number} treatmentId
   * @returns {Promise<Array>}
   */
  static async getAvailableTimeSlotsForBooking(date, dentistId, treatmentId) {
    // Get treatment duration
    const [treatmentData] = await db.execute(
      'SELECT duration FROM treatment WHERE treatment_id = ?',
      [treatmentId]
    );

    if (treatmentData.length === 0) {
      throw new Error('ไม่พบข้อมูลการรักษา');
    }

    const duration = treatmentData[0].duration;

    // Get available slots
    const [slots] = await db.execute(`
      SELECT
        s.slot_id,
        s.start_time,
        s.end_time,
        TIME_FORMAT(s.start_time, '%H:%i') as formatted_start_time,
        TIME_FORMAT(s.end_time, '%H:%i') as formatted_end_time
      FROM available_slots s
      WHERE s.dentist_id = ?
      AND s.date = ?
      AND s.is_available = 1
      AND NOT EXISTS (
        SELECT 1 FROM queue q
        WHERE q.dentist_id = s.dentist_id
        AND DATE(q.time) = s.date
        AND TIME(q.time) = s.start_time
        AND q.queue_status IN ('pending', 'confirm')
      )
      ORDER BY s.start_time`,
      [dentistId, date]
    );

    return { slots, duration };
  }

  /**
   * ดึงข้อมูลปฏิทินรายเดือน (จำนวนทันตแพทย์ที่มีช่วงเวลาว่างในแต่ละวัน)
   * @param {number} year
   * @param {number} month (1-12)
   * @param {number} treatmentId - optional
   * @returns {Promise<Array>}
   */
  static async getCalendarDataForMonth(year, month, treatmentId = null) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    let mainQuery = `
      SELECT
        s.date,
        DATE_FORMAT(s.date, '%Y-%m-%d') as date_string,
        d.dentist_id,
        d.fname,
        d.lname,
        d.specialty,
        d.photo,
        COUNT(DISTINCT s.slot_id) as dentist_total_slots,
        COUNT(DISTINCT CASE
          WHEN s.is_available = 1
          AND NOT EXISTS (
            SELECT 1 FROM queue q
            WHERE q.dentist_id = s.dentist_id
            AND DATE(q.time) = s.date
            AND TIME(q.time) = s.start_time
            AND q.queue_status IN ('pending', 'confirm')
          )
          THEN s.slot_id
        END) as dentist_available_slots
      FROM available_slots s
      JOIN dentist d ON s.dentist_id = d.dentist_id
      WHERE s.date BETWEEN ? AND ?
      AND d.user_id IS NOT NULL
    `;

    const queryParams = [
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    ];

    // Filter by treatment if provided
    if (treatmentId) {
      mainQuery += ` AND EXISTS (
        SELECT 1 FROM dentist_treatment dt
        WHERE dt.dentist_id = d.dentist_id
        AND dt.treatment_id = ?
      )`;
      queryParams.push(treatmentId);
    }

    mainQuery += `
      GROUP BY s.date, d.dentist_id, d.fname, d.lname, d.specialty, d.photo
      HAVING dentist_available_slots > 0
      ORDER BY s.date, d.fname, d.lname
    `;

    const [rawData] = await db.execute(mainQuery, queryParams);

    // Group by date
    const groupedByDate = {};
    rawData.forEach(row => {
      const dateStr = row.date_string;
      if (!groupedByDate[dateStr]) {
        groupedByDate[dateStr] = {
          date: dateStr,
          available_dentists: 0,
          total_slots: 0,
          available_slots: 0,
          dentists: []
        };
      }

      groupedByDate[dateStr].available_dentists++;
      groupedByDate[dateStr].total_slots += parseInt(row.dentist_total_slots);
      groupedByDate[dateStr].available_slots += parseInt(row.dentist_available_slots);

      groupedByDate[dateStr].dentists.push({
        dentist_id: row.dentist_id,
        name: `${row.fname} ${row.lname}`,
        fname: row.fname,
        lname: row.lname,
        specialty: row.specialty || 'ทันตแพทย์ทั่วไป',
        photo: row.photo,
        available_slots: parseInt(row.dentist_available_slots)
      });
    });

    return Object.values(groupedByDate);
  }

  /**
   * ตรวจสอบและดึง slots ที่ต่อเนื่องกันเพื่อการจอง
   * @param {number} dentistId
   * @param {string} date
   * @param {string} startTime
   * @param {number} requiredSlots - จำนวน slots ที่ต้องการ
   * @returns {Promise<Array>} slots ที่ใช้ได้
   */
  static async getConsecutiveSlots(dentistId, date, startTime, requiredSlots) {
    const [allSlots] = await db.execute(`
      SELECT s.slot_id, s.start_time, s.end_time
      FROM available_slots s
      WHERE s.dentist_id = ?
      AND s.date = ?
      AND s.start_time >= ?
      AND s.is_available = 1
      ORDER BY s.start_time
    `, [dentistId, date, startTime]);

    // Check which slots are already booked
    const slotsCheck = [];
    for (const slot of allSlots) {
      if (slotsCheck.length >= requiredSlots) break;

      const slotDateTime = `${date} ${slot.start_time}`;
      const [existingBooking] = await db.execute(`
        SELECT queue_id
        FROM queue
        WHERE dentist_id = ?
        AND time = ?
        AND queue_status IN ('pending', 'confirm')
      `, [dentistId, slotDateTime]);

      if (existingBooking.length === 0) {
        slotsCheck.push(slot);
      }
    }

    // Verify slots are consecutive
    if (slotsCheck.length >= requiredSlots) {
      for (let i = 0; i < slotsCheck.length - 1; i++) {
        if (slotsCheck[i].end_time !== slotsCheck[i + 1].start_time) {
          throw new Error('ช่วงเวลาที่เลือกไม่ต่อเนื่องกัน');
        }
      }
    }

    return slotsCheck;
  }

  /**
   * อัปเดต slots เป็น not available หลังจากจอง
   * @param {Array} slotIds - [slot_id1, slot_id2, ...]
   * @param {number} treatmentId
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async markSlotsAsBooked(slotIds, treatmentId) {
    if (!Array.isArray(slotIds) || slotIds.length === 0) {
      throw new Error('กรุณาระบุ slot IDs');
    }

    const placeholders = slotIds.map(() => '?').join(',');
    const [result] = await db.execute(`
      UPDATE available_slots
      SET treatment_id = ?, is_available = 0
      WHERE slot_id IN (${placeholders})
    `, [treatmentId, ...slotIds]);

    return {
      success: true,
      affectedRows: result.affectedRows
    };
  }

  /**
   * คืน slots ให้ available เมื่อยกเลิกการจอง
   * @param {number} dentistId
   * @param {string} date
   * @param {string} startTime
   * @param {number} duration - ระยะเวลาในนาที
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async releaseSlotsAfterCancellation(dentistId, date, startTime, duration) {
    const requiredSlots = Math.ceil(duration / 30);
    const slots = await this.getConsecutiveSlots(dentistId, date, startTime, requiredSlots);

    if (slots.length > 0) {
      const slotIds = slots.map(s => s.slot_id);
      const placeholders = slotIds.map(() => '?').join(',');
      const [result] = await db.execute(`
        UPDATE available_slots
        SET treatment_id = NULL, is_available = 1
        WHERE slot_id IN (${placeholders})
      `, slotIds);

      return {
        success: true,
        affectedRows: result.affectedRows
      };
    }

    return { success: false, affectedRows: 0 };
  }
}

module.exports = AvailableSlotsModel;
