const db = require('../config/db');

class DentistScheduleModel {
  /**
   * สร้างตารางเวลาทันตแพทย์
   * @param {Object} scheduleData - ข้อมูลตารางเวลา
   * @returns {Promise<Object>} { scheduleId, success }
   */
  static async create(scheduleData) {
    const {
      dentistId,
      scheduleDate,
      hour,
      startTime,
      endTime,
      status = 'available',
      note = ''
    } = scheduleData;

    // Validate required fields
    if (!dentistId || !scheduleDate || hour === undefined || !startTime || !endTime) {
      throw new Error('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน (dentistId, scheduleDate, hour, startTime, endTime)');
    }

    // Validate hour (0-23)
    if (hour < 0 || hour > 23) {
      throw new Error('ชั่วโมงต้องอยู่ระหว่าง 0-23');
    }

    // Validate status
    const validStatuses = ['available', 'unavailable', 'booked'];
    if (status && !validStatuses.includes(status)) {
      throw new Error('สถานะไม่ถูกต้อง (available, unavailable, booked)');
    }

    // Check for duplicate schedule
    const existing = await this.findByDentistDateAndHour(dentistId, scheduleDate, hour);
    if (existing) {
      throw new Error('มีตารางเวลานี้อยู่ในระบบแล้ว');
    }

    const [result] = await db.execute(
      `INSERT INTO dentist_schedule
       (dentist_id, schedule_date, hour, start_time, end_time, status, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [dentistId, scheduleDate, hour, startTime, endTime, status, note]
    );

    return {
      scheduleId: result.insertId,
      success: true
    };
  }

  /**
   * ค้นหาตารางเวลาด้วย ID
   * @param {number} scheduleId
   * @returns {Promise<Object|null>}
   */
  static async findById(scheduleId) {
    const [rows] = await db.execute(
      `SELECT * FROM dentist_schedule WHERE schedule_id = ?`,
      [scheduleId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ค้นหาตารางเวลาด้วยทันตแพทย์, วันที่, และชั่วโมง
   * @param {number} dentistId
   * @param {string|Date} scheduleDate
   * @param {number} hour
   * @returns {Promise<Object|null>}
   */
  static async findByDentistDateAndHour(dentistId, scheduleDate, hour) {
    const [rows] = await db.execute(
      `SELECT * FROM dentist_schedule
       WHERE dentist_id = ? AND schedule_date = ? AND hour = ?`,
      [dentistId, scheduleDate, hour]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ดึงตารางเวลาของทันตแพทย์ตามวันที่
   * @param {number} dentistId
   * @param {string|Date} scheduleDate
   * @returns {Promise<Array>}
   */
  static async findByDentistAndDate(dentistId, scheduleDate) {
    const [rows] = await db.execute(
      `SELECT * FROM dentist_schedule
       WHERE dentist_id = ? AND schedule_date = ?
       ORDER BY hour ASC`,
      [dentistId, scheduleDate]
    );
    return rows;
  }

  /**
   * ดึงตารางเวลาของทันตแพทย์ในช่วงวันที่
   * @param {number} dentistId
   * @param {string|Date} startDate
   * @param {string|Date} endDate
   * @returns {Promise<Array>}
   */
  static async findByDentistAndDateRange(dentistId, startDate, endDate) {
    const [rows] = await db.execute(
      `SELECT * FROM dentist_schedule
       WHERE dentist_id = ?
         AND schedule_date >= ?
         AND schedule_date <= ?
       ORDER BY schedule_date ASC, hour ASC`,
      [dentistId, startDate, endDate]
    );
    return rows;
  }

  /**
   * ดึงตารางเวลาทั้งหมดพร้อมข้อมูลทันตแพทย์ (สำหรับ calendar)
   * @param {Object} options - { startDate, endDate, dentistId, status }
   * @returns {Promise<Array>}
   */
  static async findAllWithDetails(options = {}) {
    const { startDate, endDate, dentistId, status } = options;

    let query = `
      SELECT
        ds.*,
        d.fname,
        d.lname,
        d.specialty,
        COUNT(q.queue_id) as appointment_count
      FROM dentist_schedule ds
      JOIN dentist d ON ds.dentist_id = d.dentist_id
      LEFT JOIN queue q ON ds.dentist_id = q.dentist_id
        AND DATE(q.time) = ds.schedule_date
        AND HOUR(q.time) = ds.hour
        AND q.queue_status IN ('pending', 'confirm')
      WHERE 1=1
    `;

    const params = [];

    if (startDate) {
      query += ` AND ds.schedule_date >= ?`;
      params.push(startDate);
    }

    if (endDate) {
      query += ` AND ds.schedule_date <= ?`;
      params.push(endDate);
    }

    if (dentistId) {
      query += ` AND ds.dentist_id = ?`;
      params.push(dentistId);
    }

    if (status) {
      query += ` AND ds.status = ?`;
      params.push(status);
    }

    query += `
      GROUP BY ds.schedule_id, ds.schedule_date, ds.hour, ds.start_time,
               ds.end_time, ds.status, ds.note, d.fname, d.lname, d.specialty
      ORDER BY ds.schedule_date, ds.hour
    `;

    const [rows] = await db.execute(query, params);
    return rows;
  }

  /**
   * ดึงตารางเวลาทั้งหมด (พร้อม pagination)
   * @param {Object} options - { limit, offset, dentistId, date, status }
   * @returns {Promise<Array>}
   */
  static async findAll(options = {}) {
    const { limit = 100, offset = 0, dentistId, date, status } = options;

    let query = `
      SELECT
        ds.*,
        d.fname as dentist_fname,
        d.lname as dentist_lname
      FROM dentist_schedule ds
      JOIN dentist d ON ds.dentist_id = d.dentist_id
      WHERE 1=1
    `;

    const params = [];

    if (dentistId) {
      query += ` AND ds.dentist_id = ?`;
      params.push(dentistId);
    }

    if (date) {
      query += ` AND ds.schedule_date = ?`;
      params.push(date);
    }

    if (status) {
      query += ` AND ds.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY ds.schedule_date DESC, ds.hour ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await db.execute(query, params);
    return rows;
  }

  /**
   * อัปเดตตารางเวลา
   * @param {number} scheduleId
   * @param {Object} updateData
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async update(scheduleId, updateData) {
    const { hour, startTime, endTime, status, note } = updateData;

    // Check if schedule exists
    const existing = await this.findById(scheduleId);
    if (!existing) {
      throw new Error('ไม่พบตารางเวลา');
    }

    // Validate hour if provided
    if (hour !== undefined && (hour < 0 || hour > 23)) {
      throw new Error('ชั่วโมงต้องอยู่ระหว่าง 0-23');
    }

    // Validate status if provided
    if (status) {
      const validStatuses = ['available', 'unavailable', 'booked'];
      if (!validStatuses.includes(status)) {
        throw new Error('สถานะไม่ถูกต้อง');
      }
    }

    // Build dynamic update query
    const updates = [];
    const params = [];

    if (hour !== undefined) {
      updates.push('hour = ?');
      params.push(hour);
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
      updates.push('status = ?');
      params.push(status);
    }
    if (note !== undefined) {
      updates.push('note = ?');
      params.push(note);
    }

    if (updates.length === 0) {
      throw new Error('ไม่มีข้อมูลที่ต้องการอัปเดต');
    }

    params.push(scheduleId);

    const [result] = await db.execute(
      `UPDATE dentist_schedule SET ${updates.join(', ')} WHERE schedule_id = ?`,
      params
    );

    return {
      success: true,
      affectedRows: result.affectedRows
    };
  }

  /**
   * อัปเดตสถานะตารางเวลา
   * @param {number} scheduleId
   * @param {string} status - 'available', 'unavailable', 'booked'
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async updateStatus(scheduleId, status) {
    const validStatuses = ['available', 'unavailable', 'booked'];
    if (!validStatuses.includes(status)) {
      throw new Error('สถานะไม่ถูกต้อง');
    }

    const [result] = await db.execute(
      `UPDATE dentist_schedule SET status = ? WHERE schedule_id = ?`,
      [status, scheduleId]
    );

    return {
      success: result.affectedRows > 0,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ลบตารางเวลา
   * @param {number} scheduleId
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async delete(scheduleId) {
    // Check if schedule has appointments
    const schedule = await this.findById(scheduleId);
    if (!schedule) {
      throw new Error('ไม่พบตารางเวลา');
    }

    const [appointments] = await db.execute(
      `SELECT COUNT(*) as count FROM queue
       WHERE dentist_id = ?
         AND DATE(time) = ?
         AND HOUR(time) = ?
         AND queue_status IN ('pending', 'confirm')`,
      [schedule.dentist_id, schedule.schedule_date, schedule.hour]
    );

    if (appointments[0].count > 0) {
      throw new Error('ไม่สามารถลบตารางเวลาที่มีการนัดหมายได้');
    }

    const [result] = await db.execute(
      `DELETE FROM dentist_schedule WHERE schedule_id = ?`,
      [scheduleId]
    );

    return {
      success: result.affectedRows > 0,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ลบตารางเวลาของทันตแพทย์ทั้งหมดในวันที่กำหนด
   * @param {number} dentistId
   * @param {string|Date} scheduleDate
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async deleteByDentistAndDate(dentistId, scheduleDate) {
    const [result] = await db.execute(
      `DELETE FROM dentist_schedule
       WHERE dentist_id = ? AND schedule_date = ?`,
      [dentistId, scheduleDate]
    );

    return {
      success: result.affectedRows > 0,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ลบตารางเวลาของทันตแพทย์ทั้งหมด
   * @param {number} dentistId
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async deleteByDentist(dentistId) {
    const [result] = await db.execute(
      `DELETE FROM dentist_schedule WHERE dentist_id = ?`,
      [dentistId]
    );

    return {
      success: result.affectedRows > 0,
      affectedRows: result.affectedRows
    };
  }

  /**
   * นับจำนวนตารางเวลา
   * @param {Object} filters - { dentistId, date, status }
   * @returns {Promise<number>}
   */
  static async count(filters = {}) {
    const { dentistId, date, status } = filters;

    let query = `SELECT COUNT(*) as total FROM dentist_schedule WHERE 1=1`;
    const params = [];

    if (dentistId) {
      query += ` AND dentist_id = ?`;
      params.push(dentistId);
    }

    if (date) {
      query += ` AND schedule_date = ?`;
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
   * ตรวจสอบว่าทันตแพทย์ว่างในช่วงเวลานี้หรือไม่
   * @param {number} dentistId
   * @param {string|Date} scheduleDate
   * @param {number} hour
   * @returns {Promise<boolean>}
   */
  static async isAvailable(dentistId, scheduleDate, hour) {
    const schedule = await this.findByDentistDateAndHour(dentistId, scheduleDate, hour);
    return schedule && schedule.status === 'available';
  }

  /**
   * ดึงตารางเวลาที่ว่างของทันตแพทย์
   * @param {number} dentistId
   * @param {string|Date} startDate
   * @param {string|Date} endDate
   * @returns {Promise<Array>}
   */
  static async findAvailableSlots(dentistId, startDate, endDate) {
    const [rows] = await db.execute(
      `SELECT * FROM dentist_schedule
       WHERE dentist_id = ?
         AND schedule_date >= ?
         AND schedule_date <= ?
         AND status = 'available'
       ORDER BY schedule_date ASC, hour ASC`,
      [dentistId, startDate, endDate]
    );
    return rows;
  }

  /**
   * สร้างตารางเวลาหลายช่วงพร้อมกัน (bulk insert)
   * @param {Array} schedules - [{ dentistId, scheduleDate, hour, startTime, endTime, status, note }, ...]
   * @returns {Promise<Object>} { success, insertedCount }
   */
  static async bulkCreate(schedules) {
    if (!Array.isArray(schedules) || schedules.length === 0) {
      throw new Error('กรุณาระบุข้อมูลตารางเวลา');
    }

    const values = [];
    const params = [];

    for (const schedule of schedules) {
      const {
        dentistId,
        scheduleDate,
        hour,
        startTime,
        endTime,
        status = 'available',
        note = ''
      } = schedule;

      // Validate required fields
      if (!dentistId || !scheduleDate || hour === undefined || !startTime || !endTime) {
        throw new Error('ข้อมูลไม่ครบถ้วน');
      }

      values.push('(?, ?, ?, ?, ?, ?, ?)');
      params.push(dentistId, scheduleDate, hour, startTime, endTime, status, note);
    }

    const query = `
      INSERT INTO dentist_schedule
      (dentist_id, schedule_date, hour, start_time, end_time, status, note)
      VALUES ${values.join(', ')}
    `;

    const [result] = await db.execute(query, params);

    return {
      success: true,
      insertedCount: result.affectedRows
    };
  }

  /**
   * ดึงข้อมูลปฏิทินของทันตแพทย์ (จำนวนนัดหมายในแต่ละวัน)
   * @param {number} dentistId
   * @param {number} year
   * @param {number} month
   * @returns {Promise<Array>}
   */
  static async getMonthlyCalendar(dentistId, year, month) {
    const [rows] = await db.execute(
      `SELECT
         DAY(ds.schedule_date) as day,
         COUNT(DISTINCT ds.schedule_id) as total_slots,
         COUNT(DISTINCT q.queue_id) as booked_slots
       FROM dentist_schedule ds
       LEFT JOIN queue q ON ds.dentist_id = q.dentist_id
         AND DATE(q.time) = ds.schedule_date
         AND HOUR(q.time) = ds.hour
         AND q.queue_status IN ('pending', 'confirm')
       WHERE ds.dentist_id = ?
         AND YEAR(ds.schedule_date) = ?
         AND MONTH(ds.schedule_date) = ?
       GROUP BY DAY(ds.schedule_date)`,
      [dentistId, year, month]
    );
    return rows;
  }

  /**
   * บันทึกตารางเวลาในช่วงวันที่ (รองรับทั้งวันทำงานและวันหยุด)
   * @param {number} dentistId
   * @param {string} startDate - วันที่เริ่มต้น (YYYY-MM-DD)
   * @param {string} endDate - วันที่สิ้นสุด (YYYY-MM-DD)
   * @param {Object} scheduleData - { status: 'working'|'dayoff', startTime, endTime, note }
   * @returns {Promise<Object>} { success, insertedDays, skippedSundays }
   */
  static async saveScheduleRange(dentistId, startDate, endDate, scheduleData) {
    const { status, startTime, endTime, note = '' } = scheduleData;

    // Validate inputs
    if (!dentistId || !startDate || !endDate || !status) {
      throw new Error('กรุณาระบุข้อมูลที่จำเป็นให้ครบถ้วน');
    }

    if (status === 'working' && (!startTime || !endTime)) {
      throw new Error('กรุณาระบุเวลาทำงาน');
    }

    // Start transaction
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      // ลบตารางเวลาเก่าในช่วงนี้
      await connection.execute(
        `DELETE FROM dentist_schedule
         WHERE dentist_id = ? AND schedule_date BETWEEN ? AND ?`,
        [dentistId, startDate, endDate]
      );

      // แปลงวันที่เป็น Date objects
      const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
      const [endYear, endMonth, endDay] = endDate.split('-').map(Number);

      const start = new Date(startYear, startMonth - 1, startDay);
      const end = new Date(endYear, endMonth - 1, endDay);

      let insertedDays = 0;
      let skippedSundays = 0;

      const currentDate = new Date(start);

      // วนลูปทุกวันในช่วงวันที่
      while (currentDate <= end) {
        const dayOfWeek = currentDate.getDay();

        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        const scheduleDate = `${year}-${month}-${day}`;

        // ข้ามวันอาทิตย์
        if (dayOfWeek === 0) {
          skippedSundays++;
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        if (status === 'dayoff') {
          // บันทึกวันหยุด
          await connection.execute(
            `INSERT INTO dentist_schedule
             (dentist_id, schedule_date, day_of_week, hour, status, start_time, end_time, note)
             VALUES (?, ?, ?, 0, 'dayoff', '00:00:00', '23:59:59', ?)`,
            [dentistId, scheduleDate, dayOfWeek, note || 'วันหยุดพิเศษ']
          );
          insertedDays++;
        } else {
          // บันทึกเวลาทำงาน (แยกเป็นชั่วโมง)
          const startHour = parseInt(startTime.split(':')[0]);
          const endHour = parseInt(endTime.split(':')[0]);

          for (let hour = startHour; hour < endHour; hour++) {
            const hourStartTime = `${hour.toString().padStart(2, '0')}:00:00`;
            const hourEndTime = `${(hour + 1).toString().padStart(2, '0')}:00:00`;

            await connection.execute(
              `INSERT INTO dentist_schedule
               (dentist_id, schedule_date, day_of_week, hour, status, start_time, end_time, note)
               VALUES (?, ?, ?, ?, 'working', ?, ?, ?)`,
              [dentistId, scheduleDate, dayOfWeek, hour, hourStartTime, hourEndTime, note || '']
            );
          }
          insertedDays++;
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      await connection.commit();
      connection.release();

      return {
        success: true,
        insertedDays,
        skippedSundays
      };

    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }
  }

  /**
   * ลบตารางเวลาในช่วงวันที่ (พร้อมตรวจสอบนัดหมาย)
   * @param {number} dentistId
   * @param {string} startDate
   * @param {string} endDate
   * @returns {Promise<Object>} { success, message }
   */
  static async deleteScheduleRange(dentistId, startDate, endDate) {
    // ตรวจสอบว่ามีนัดหมายในช่วงนี้หรือไม่
    const [appointmentCheck] = await db.execute(
      `SELECT COUNT(*) as count
       FROM queue
       WHERE dentist_id = ?
         AND DATE(time) BETWEEN ? AND ?
         AND queue_status IN ('pending', 'confirm')`,
      [dentistId, startDate, endDate]
    );

    if (appointmentCheck[0].count > 0) {
      throw new Error(`ไม่สามารถลบได้ เนื่องจากมีนัดหมายในช่วงนี้อยู่ ${appointmentCheck[0].count} รายการ`);
    }

    // ลบตารางเวลา
    const [result] = await db.execute(
      `DELETE FROM dentist_schedule
       WHERE dentist_id = ? AND schedule_date BETWEEN ? AND ?`,
      [dentistId, startDate, endDate]
    );

    return {
      success: true,
      affectedRows: result.affectedRows,
      message: 'ลบตารางเวลาเรียบร้อยแล้ว'
    };
  }

  /**
   * โหลดตารางเวลาในช่วงวันที่
   * @param {number} dentistId
   * @param {string} startDate
   * @param {string} endDate
   * @returns {Promise<Array>}
   */
  static async loadScheduleRange(dentistId, startDate, endDate) {
    const [schedules] = await db.execute(
      `SELECT
         schedule_id,
         DATE_FORMAT(schedule_date, '%Y-%m-%d') as schedule_date,
         day_of_week,
         hour,
         status,
         TIME_FORMAT(start_time, '%H:%i') as start_time,
         TIME_FORMAT(end_time, '%H:%i') as end_time,
         note,
         created_at
       FROM dentist_schedule
       WHERE dentist_id = ?
         AND schedule_date BETWEEN ? AND ?
       ORDER BY schedule_date, hour`,
      [dentistId, startDate, endDate]
    );

    return schedules;
  }

  /**
   * บันทึกตารางเวลาวันเดียว (รองรับทั้งวันทำงานและวันหยุด)
   * @param {number} dentistId
   * @param {string} date - วันที่ (YYYY-MM-DD)
   * @param {Object} scheduleData - { status, startTime, endTime, note }
   * @returns {Promise<Object>} { success }
   */
  static async saveDaySchedule(dentistId, date, scheduleData) {
    const { status, startTime, endTime, note = '' } = scheduleData;

    if (!status) {
      throw new Error('กรุณาระบุสถานะ');
    }

    const scheduleDate = new Date(date);
    const dayOfWeek = scheduleDate.getDay();

    // ลบตารางเวลาเก่าของวันนี้ก่อน
    await db.execute(
      `DELETE FROM dentist_schedule
       WHERE dentist_id = ? AND schedule_date = ?`,
      [dentistId, date]
    );

    if (status === 'dayoff') {
      // บันทึกวันหยุด
      await db.execute(
        `INSERT INTO dentist_schedule
         (dentist_id, schedule_date, day_of_week, hour, status, start_time, end_time, note)
         VALUES (?, ?, ?, 0, 'dayoff', '00:00:00', '23:59:59', ?)`,
        [dentistId, date, dayOfWeek, note || '']
      );
    } else {
      // บันทึกชั่วโมงทำงาน
      if (!startTime || !endTime) {
        throw new Error('กรุณากำหนดเวลาเริ่มต้นและสิ้นสุด');
      }

      const startHour = parseInt(startTime.split(':')[0]);
      const endHour = parseInt(endTime.split(':')[0]);

      // สร้าง records สำหรับแต่ละชั่วโมง
      for (let hour = startHour; hour < endHour; hour++) {
        const hourStartTime = `${hour.toString().padStart(2, '0')}:00:00`;
        const hourEndTime = `${(hour + 1).toString().padStart(2, '0')}:00:00`;

        await db.execute(
          `INSERT INTO dentist_schedule
           (dentist_id, schedule_date, day_of_week, hour, status, start_time, end_time, note)
           VALUES (?, ?, ?, ?, 'working', ?, ?, ?)`,
          [dentistId, date, dayOfWeek, hour, hourStartTime, hourEndTime, note || '']
        );
      }
    }

    return {
      success: true,
      message: status === 'dayoff' ? 'บันทึกวันหยุดเรียบร้อยแล้ว' : 'บันทึกตารางเวลาเรียบร้อยแล้ว'
    };
  }

  /**
   * ลบตารางเวลาตามวันและชั่วโมง (พร้อมตรวจสอบนัดหมาย)
   * @param {number} dentistId
   * @param {string} date
   * @param {number} hour
   * @returns {Promise<Object>} { success, message }
   */
  static async deleteScheduleByDateAndHour(dentistId, date, hour) {
    // ตรวจสอบว่ามีนัดหมายในช่วงเวลานั้นหรือไม่
    const [appointmentCheck] = await db.execute(
      `SELECT COUNT(*) as count
       FROM queue
       WHERE dentist_id = ?
         AND DATE(time) = ?
         AND HOUR(time) = ?
         AND queue_status IN ('pending', 'confirm')`,
      [dentistId, date, hour]
    );

    if (appointmentCheck[0].count > 0) {
      throw new Error('ไม่สามารถลบได้ เนื่องจากมีนัดหมายในช่วงเวลานี้');
    }

    // ลบตารางเวลา
    const [result] = await db.execute(
      `DELETE FROM dentist_schedule
       WHERE dentist_id = ?
         AND schedule_date = ?
         AND (hour = ? OR status = 'dayoff')`,
      [dentistId, date, hour]
    );

    return {
      success: true,
      affectedRows: result.affectedRows,
      message: 'ลบตารางเวลาเรียบร้อยแล้ว'
    };
  }

  /**
   * ดึงช่วงเวลาว่างสำหรับการจอง (เรียก stored procedure)
   * @param {number} dentistId
   * @param {string} date
   * @returns {Promise<Array>}
   */
  static async getAvailableSlots(dentistId, date) {
    try {
      const [availableSlots] = await db.execute(
        `CALL get_available_slots(?, ?, ?)`,
        [dentistId, date, date]
      );

      return availableSlots[0] || [];
    } catch (error) {
      // ถ้า stored procedure ไม่มี ให้ query ปกติ
      const [slots] = await db.execute(
        `SELECT
           ds.hour,
           ds.start_time,
           ds.end_time,
           COUNT(q.queue_id) as booked_count
         FROM dentist_schedule ds
         LEFT JOIN queue q ON ds.dentist_id = q.dentist_id
           AND DATE(q.time) = ds.schedule_date
           AND HOUR(q.time) = ds.hour
           AND q.queue_status IN ('pending', 'confirm')
         WHERE ds.dentistId = ?
           AND ds.schedule_date = ?
           AND ds.status = 'working'
         GROUP BY ds.hour, ds.start_time, ds.end_time
         HAVING booked_count = 0
         ORDER BY ds.hour`,
        [dentistId, date]
      );

      return slots;
    }
  }

  /**
   * ดึงข้อมูลตารางเวลาพร้อมจำนวน appointments (สำหรับ dashboard)
   * Alias method สำหรับ findAllWithDetails
   * @param {Object} options
   * @returns {Promise<Array>}
   */
  static async getScheduleWithAppointments(options = {}) {
    return await this.findAllWithDetails(options);
  }

  /**
   * ดึง available appointments สำหรับ month view (legacy booking)
   * @param {number} year
   * @param {number} month (0-11)
   * @returns {Promise<Array>}
   */
  static async getAvailableAppointmentsByMonth(year, month) {
    const [appointments] = await db.execute(
      `SELECT
        ds.schedule_date as date,
        ds.hour,
        ds.start_time,
        ds.end_time,
        TIME_FORMAT(ds.start_time, '%H:%i') as time_formatted,
        CONCAT(d.fname, ' ', d.lname) as dentist_name,
        d.dentist_id,
        d.specialty,
        'Available' as treatment_name,
        60 as duration,
        CASE
          WHEN q.queue_id IS NULL THEN 'available'
          ELSE 'booked'
        END as status
      FROM dentist_schedule ds
      JOIN dentist d ON ds.dentist_id = d.dentist_id
      LEFT JOIN queue q ON ds.dentist_id = q.dentist_id
        AND DATE(q.time) = ds.schedule_date
        AND HOUR(q.time) = ds.hour
        AND q.queue_status IN ('pending', 'confirm')
      WHERE YEAR(ds.schedule_date) = ?
      AND MONTH(ds.schedule_date) = ?
      AND ds.status = 'working'
      AND ds.schedule_date >= CURDATE()
      ORDER BY ds.schedule_date, ds.hour`,
      [year, month + 1]
    );

    return appointments;
  }

  /**
   * ดึง available appointments สำหรับ week view (legacy booking)
   * @param {Date} startDate - Monday of the week
   * @returns {Promise<Array>}
   */
  static async getAvailableAppointmentsByWeek(startDate) {
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);

    const [appointments] = await db.execute(
      `SELECT
        ds.schedule_date as date,
        ds.hour,
        ds.start_time,
        ds.end_time,
        TIME_FORMAT(ds.start_time, '%H:%i') as time_formatted,
        CONCAT(d.fname, ' ', d.lname) as dentist_name,
        d.dentist_id,
        d.specialty,
        'Available' as treatment_name,
        60 as duration,
        CASE
          WHEN q.queue_id IS NULL THEN 'available'
          ELSE 'booked'
        END as status
      FROM dentist_schedule ds
      JOIN dentist d ON ds.dentist_id = d.dentist_id
      LEFT JOIN queue q ON ds.dentist_id = q.dentist_id
        AND DATE(q.time) = ds.schedule_date
        AND HOUR(q.time) = ds.hour
        AND q.queue_status IN ('pending', 'confirm')
      WHERE ds.schedule_date BETWEEN ? AND ?
      AND ds.status = 'working'
      AND ds.schedule_date >= CURDATE()
      ORDER BY ds.schedule_date, ds.hour`,
      [
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      ]
    );

    return appointments;
  }

  /**
   * ดึง available appointments สำหรับ day view (legacy booking)
   * @param {Date} date - The specific day
   * @returns {Promise<Array>}
   */
  static async getAvailableAppointmentsByDay(date) {
    const [appointments] = await db.execute(
      `SELECT
        ds.schedule_date as date,
        ds.hour,
        ds.start_time,
        ds.end_time,
        TIME_FORMAT(ds.start_time, '%H:%i') as time_formatted,
        CONCAT(d.fname, ' ', d.lname) as dentist_name,
        d.dentist_id,
        d.specialty,
        'Available' as treatment_name,
        60 as duration,
        CASE
          WHEN q.queue_id IS NULL THEN 'available'
          ELSE 'booked'
        END as status
      FROM dentist_schedule ds
      JOIN dentist d ON ds.dentist_id = d.dentist_id
      LEFT JOIN queue q ON ds.dentist_id = q.dentist_id
        AND DATE(q.time) = ds.schedule_date
        AND HOUR(q.time) = ds.hour
        AND q.queue_status IN ('pending', 'confirm')
      WHERE ds.schedule_date = ?
      AND ds.status = 'working'
      ORDER BY ds.hour`,
      [date.toISOString().split('T')[0]]
    );

    return appointments;
  }

  /**
   * ตรวจสอบ schedule availability (legacy booking validation)
   * @param {number} dentistId
   * @param {string} date - 'YYYY-MM-DD'
   * @param {number} hour
   * @param {number} excludeQueueId - Queue ID to exclude (for update)
   * @returns {Promise<boolean>}
   */
  static async validateScheduleAvailability(dentistId, date, hour, excludeQueueId = null) {
    let query = `
      SELECT ds.schedule_id
      FROM dentist_schedule ds
      LEFT JOIN queue q ON ds.dentist_id = q.dentist_id
        AND DATE(q.time) = ds.schedule_date
        AND HOUR(q.time) = ds.hour
        AND q.queue_status IN ('pending', 'confirm')
    `;

    const params = [dentistId, date, hour];

    if (excludeQueueId) {
      query += ` AND q.queue_id != ?`;
      params.push(excludeQueueId);
    }

    query += `
      WHERE ds.dentist_id = ?
      AND ds.schedule_date = ?
      AND ds.hour = ?
      AND ds.status = 'working'
      AND q.queue_id IS NULL
    `;

    // Reorder params to match WHERE clause order
    const [scheduleValidation] = await db.execute(query, [dentistId, date, hour, excludeQueueId].filter(p => p !== null && p !== undefined));

    return scheduleValidation.length > 0;
  }
}

module.exports = DentistScheduleModel;
