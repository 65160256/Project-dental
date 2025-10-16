const db = require('../config/db');

class QueueModel {
  /**
   * สร้างคิวนัดหมายใหม่
   * @param {Object} queueData
   * @returns {Promise<Object>} { queueId, success }
   */
  static async create(queueData) {
    const {
      queuedetailId,
      patientId,
      treatmentId,
      dentistId,
      time,
      queueStatus = 'pending'
    } = queueData;

    // Validate required fields
    if (!queuedetailId || !patientId || !treatmentId || !dentistId || !time) {
      throw new Error('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน');
    }

    // Check for overlapping appointments for the same dentist
    const overlapping = await this.checkDentistConflict(dentistId, time, treatmentId);
    if (overlapping) {
      throw new Error('ทันตแพทย์มีนัดหมายในช่วงเวลานี้แล้ว');
    }

    const [result] = await db.execute(
      `INSERT INTO queue
       (queuedetail_id, patient_id, treatment_id, dentist_id, time, queue_status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [queuedetailId, patientId, treatmentId, dentistId, time, queueStatus]
    );

    return {
      queueId: result.insertId,
      success: true
    };
  }

  /**
   * ตรวจสอบความขัดแย้งเวลานัดหมายของทันตแพทย์
   * @param {number} dentistId
   * @param {Date} appointmentTime
   * @param {number} treatmentId
   * @param {number} excludeQueueId - Queue ID ที่จะไม่เช็ค (สำหรับ update)
   * @returns {Promise<boolean>}
   */
  static async checkDentistConflict(dentistId, appointmentTime, treatmentId, excludeQueueId = null) {
    // Get treatment duration
    const [treatment] = await db.execute(
      `SELECT duration FROM treatment WHERE treatment_id = ?`,
      [treatmentId]
    );

    if (treatment.length === 0) {
      throw new Error('ไม่พบข้อมูลการรักษา');
    }

    const duration = treatment[0].duration;
    const endTime = new Date(new Date(appointmentTime).getTime() + duration * 60000);

    // Check for overlapping appointments
    let query = `
      SELECT COUNT(*) as count
      FROM queue q
      JOIN treatment t ON q.treatment_id = t.treatment_id
      WHERE q.dentist_id = ?
        AND q.queue_status != 'cancelled'
        AND (
          (q.time < ? AND DATE_ADD(q.time, INTERVAL t.duration MINUTE) > ?) OR
          (q.time >= ? AND q.time < ?)
        )
    `;

    const params = [dentistId, endTime, appointmentTime, appointmentTime, endTime];

    if (excludeQueueId) {
      query += ` AND q.queue_id != ?`;
      params.push(excludeQueueId);
    }

    const [rows] = await db.execute(query, params);
    return rows[0].count > 0;
  }

  /**
   * ค้นหาคิวด้วย ID พร้อมข้อมูลที่เกี่ยวข้อง
   * @param {number} queueId
   * @returns {Promise<Object|null>}
   */
  static async findByIdWithDetails(queueId) {
    const [rows] = await db.execute(
      `SELECT
        q.*,
        p.fname as patient_fname,
        p.lname as patient_lname,
        p.phone as patient_phone,
        p.dob as patient_dob,
        p.gender as patient_gender,
        p.address as patient_address,
        p.id_card as patient_id_card,
        p.chronic_disease,
        p.allergy_history,
        d.fname as dentist_fname,
        d.lname as dentist_lname,
d.specialty as dentist_specialization,
        t.treatment_name,
        t.duration,
        0 AS price,
        th.diagnosis,
        th.followUpdate
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      LEFT JOIN treatmentHistory th ON qd.queuedetail_id = th.queuedetail_id
      WHERE q.queue_id = ?`,
      [queueId]
    );

    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ค้นหาคิวด้วย ID พร้อมตรวจสอบสิทธิ์ของทันตแพทย์ (สำหรับ appointment detail)
   * @param {number} queueId
   * @param {number} dentistId
   * @returns {Promise<Object|null>}
   */
  static async findByIdWithDetailsAndAuth(queueId, dentistId) {
    const [rows] = await db.execute(
      `SELECT
        q.*,
        p.fname,
        p.lname,
        p.phone,
        p.dob,
        p.address,
        t.treatment_name,
        t.duration,
        d.fname as dentist_fname,
        d.lname as dentist_lname
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      WHERE q.queue_id = ? AND q.dentist_id = ?`,
      [queueId, dentistId]
    );

    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ค้นหาคิวด้วย ID (ข้อมูลพื้นฐาน)
   * @param {number} queueId
   * @returns {Promise<Object|null>}
   */
  static async findById(queueId) {
    const [rows] = await db.execute(
      `SELECT * FROM queue WHERE queue_id = ?`,
      [queueId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ดึงคิวของผู้ป่วย
   * @param {number} patientId
   * @param {Object} options - { status, limit, offset }
   * @returns {Promise<Array>}
   */
  static async findByPatientId(patientId, options = {}) {
    const { status = null, limit = 50, offset = 0 } = options;

    let query = `
      SELECT
        q.*,
        d.fname as dentist_fname,
        d.lname as dentist_lname,
        t.treatment_name,
        t.duration,
        th.diagnosis,
        th.followUpdate
      FROM queue q
      JOIN dentist d ON q.dentist_id = d.dentist_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      LEFT JOIN treatmentHistory th ON qd.queuedetail_id = th.queuedetail_id
      WHERE q.patient_id = ?
    `;

    const params = [patientId];

    if (status) {
      query += ` AND q.queue_status = ?`;
      params.push(status);
    }

    query += ` ORDER BY q.time DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await db.execute(query, params);
    return rows;
  }

  /**
   * ดึงคิวของทันตแพทย์
   * @param {number} dentistId
   * @param {Object} options - { date, status, limit, offset }
   * @returns {Promise<Array>}
   */
  static async findByDentistId(dentistId, options = {}) {
    const { date = null, status = null, limit = 50, offset = 0 } = options;

    let query = `
      SELECT
        q.*,
        p.fname as patient_fname,
        p.lname as patient_lname,
        p.phone as patient_phone,
        t.treatment_name,
        t.duration,
        th.diagnosis,
        th.followUpdate
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      LEFT JOIN treatmentHistory th ON qd.queuedetail_id = th.queuedetail_id
      WHERE q.dentist_id = ?
    `;

    const params = [dentistId];

    if (date) {
      query += ` AND DATE(q.time) = ?`;
      params.push(date);
    }

    if (status) {
      query += ` AND q.queue_status = ?`;
      params.push(status);
    }

    query += ` ORDER BY q.time ASC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await db.execute(query, params);
    return rows;
  }

  /**
   * ดึงคิวทั้งหมด (สำหรับ admin)
   * @param {Object} options - { date, status, limit, offset }
   * @returns {Promise<Array>}
   */
  static async findAll(options = {}) {
    const { date = null, status = null, limit = 50, offset = 0 } = options;

    let query = `
      SELECT
        q.*,
        p.fname as patient_fname,
        p.lname as patient_lname,
        d.fname as dentist_fname,
        d.lname as dentist_lname,
        t.treatment_name,
        t.duration,
        th.diagnosis
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      LEFT JOIN treatmentHistory th ON qd.queuedetail_id = th.queuedetail_id
      WHERE 1=1
    `;

    const params = [];

    if (date) {
      query += ` AND DATE(q.time) = ?`;
      params.push(date);
    }

    if (status) {
      query += ` AND q.queue_status = ?`;
      params.push(status);
    }

    query += ` ORDER BY q.time DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await db.execute(query, params);
    return rows;
  }

  /**
   * อัปเดตสถานะคิว
   * @param {number} queueId
   * @param {string} status - 'pending', 'confirmed', 'completed', 'cancelled'
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async updateStatus(queueId, status) {
    const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled', 'confirm', 'cancel'];
    if (!validStatuses.includes(status)) {
      throw new Error('สถานะไม่ถูกต้อง');
    }

    const [result] = await db.execute(
      `UPDATE queue SET queue_status = ? WHERE queue_id = ?`,
      [status, queueId]
    );

    return {
      success: result.affectedRows > 0,
      affectedRows: result.affectedRows
    };
  }

  /**
   * อัปเดตสถานะนัดหมายพร้อมข้อมูลเพิ่มเติม (พร้อมตรวจสอบสิทธิ์)
   * @param {number} queueId
   * @param {number} dentistId
   * @param {Object} updateData - { status, diagnosis, nextAppointment }
   * @returns {Promise<Object>} { success, oldStatus, appointment }
   */
  static async updateAppointmentStatus(queueId, dentistId, updateData) {
    const { status, diagnosis, nextAppointment } = updateData;

    // ตรวจสอบสิทธิ์และดึงข้อมูลปัจจุบัน
    const appointment = await this.findByIdWithDentistAuth(queueId, dentistId);
    if (!appointment) {
      throw new Error('ไม่พบข้อมูลนัดหมายหรือไม่มีสิทธิ์แก้ไข');
    }

    const oldStatus = appointment.queue_status;

    // สร้าง query สำหรับอัปเดต
    let updateQuery = 'UPDATE queue SET queue_status = ?';
    const updateParams = [status];

    if (diagnosis) {
      updateQuery += ', diagnosis = ?';
      updateParams.push(diagnosis);
    }
    if (nextAppointment) {
      updateQuery += ', next_appointment = ?';
      updateParams.push(nextAppointment);
    }

    updateQuery += ' WHERE queue_id = ?';
    updateParams.push(queueId);

    await db.execute(updateQuery, updateParams);

    return {
      success: true,
      oldStatus,
      appointment
    };
  }

  /**
   * ยกเลิกคิว
   * @param {number} queueId
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async cancel(queueId) {
    // Check if queue can be cancelled
    const queue = await this.findById(queueId);
    if (!queue) {
      throw new Error('ไม่พบข้อมูลคิว');
    }

    if (queue.queue_status === 'completed') {
      throw new Error('ไม่สามารถยกเลิกคิวที่เสร็จสิ้นแล้วได้');
    }

    if (queue.queue_status === 'cancelled') {
      throw new Error('คิวนี้ถูกยกเลิกแล้ว');
    }

    return await this.updateStatus(queueId, 'cancelled');
  }

  /**
   * ค้นหาคิวพร้อมตรวจสอบสิทธิ์ของทันตแพทย์
   * @param {number} queueId
   * @param {number} dentistId
   * @returns {Promise<Object|null>}
   */
  static async findByIdWithDentistAuth(queueId, dentistId) {
    const [rows] = await db.execute(
      `SELECT q.queue_id, q.patient_id, q.dentist_id, q.queue_status, q.time
       FROM queue q
       WHERE q.queue_id = ? AND q.dentist_id = ?`,
      [queueId, dentistId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ยืนยันนัดหมาย (พร้อมตรวจสอบสิทธิ์)
   * @param {number} queueId
   * @param {number} dentistId
   * @returns {Promise<Object>} { success, queueData }
   */
  static async confirmAppointment(queueId, dentistId) {
    // ตรวจสอบสิทธิ์และดึงข้อมูล
    const queue = await this.findByIdWithDentistAuth(queueId, dentistId);

    if (!queue) {
      throw new Error('ไม่พบข้อมูลนัดหมายหรือไม่มีสิทธิ์เข้าถึง');
    }

    if (queue.queue_status === 'confirm') {
      throw new Error('นัดหมายนี้ยืนยันแล้ว');
    }

    if (queue.queue_status === 'completed') {
      throw new Error('ไม่สามารถยืนยันนัดหมายที่เสร็จสิ้นแล้ว');
    }

    if (queue.queue_status === 'cancelled') {
      throw new Error('ไม่สามารถยืนยันนัดหมายที่ยกเลิกแล้ว');
    }

    await this.updateStatus(queueId, 'confirm');

    return {
      success: true,
      queueData: queue
    };
  }

  /**
   * ยกเลิกนัดหมาย (พร้อมตรวจสอบสิทธิ์)
   * @param {number} queueId
   * @param {number} dentistId
   * @returns {Promise<Object>} { success, queueData }
   */
  static async cancelAppointment(queueId, dentistId) {
    // ตรวจสอบสิทธิ์และดึงข้อมูล
    const queue = await this.findByIdWithDentistAuth(queueId, dentistId);

    if (!queue) {
      throw new Error('ไม่พบข้อมูลนัดหมายหรือไม่มีสิทธิ์เข้าถึง');
    }

    if (queue.queue_status === 'completed') {
      throw new Error('ไม่สามารถยกเลิกนัดหมายที่เสร็จสิ้นแล้ว');
    }

    if (queue.queue_status === 'cancelled') {
      throw new Error('นัดหมายนี้ถูกยกเลิกแล้ว');
    }

    await this.updateStatus(queueId, 'cancel');

    return {
      success: true,
      queueData: queue
    };
  }

  /**
   * นับจำนวนคิู
   * @param {Object} filters - { dentistId, patientId, date, status }
   * @returns {Promise<number>}
   */
  static async count(filters = {}) {
    const { dentistId, patientId, date, status } = filters;

    let query = `SELECT COUNT(*) as total FROM queue WHERE 1=1`;
    const params = [];

    if (dentistId) {
      query += ` AND dentist_id = ?`;
      params.push(dentistId);
    }

    if (patientId) {
      query += ` AND patient_id = ?`;
      params.push(patientId);
    }

    if (date) {
      query += ` AND DATE(time) = ?`;
      params.push(date);
    }

    if (status) {
      query += ` AND queue_status = ?`;
      params.push(status);
    }

    const [rows] = await db.execute(query, params);
    return rows[0].total;
  }

  /**
   * ดึงรายการนัดหมายทั้งหมดพร้อมสถิติ (สำหรับหน้า Appointments)
   * @param {number} dentistId
   * @returns {Promise<Object>} { appointments, stats }
   */
  static async findAllWithStats(dentistId) {
    // ดึงข้อมูลนัดหมายทั้งหมด เรียงจากใหม่ไปเก่า
    const [appointments] = await db.execute(
      `SELECT
        q.queue_id,
        q.time,
        q.queue_status,
        th.diagnosis,
        th.next_appointment,
        p.fname,
        p.lname,
        p.phone,
        t.treatment_name,
        t.duration
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      LEFT JOIN treatmentHistory th ON qd.queuedetail_id = th.queuedetail_id
      WHERE q.dentist_id = ?
      ORDER BY q.time DESC`,
      [dentistId]
    );

    // นับนัดหมายแต่ละสถานะ
    const [statusCounts] = await db.execute(
      `SELECT
        queue_status,
        COUNT(*) as count
      FROM queue q
      WHERE q.dentist_id = ?
      GROUP BY queue_status`,
      [dentistId]
    );

    // นับนัดหมายวันนี้ (เฉพาะที่รอรักษา)
    const [todayCount] = await db.execute(
      `SELECT COUNT(*) as count
      FROM queue q
      WHERE q.dentist_id = ?
        AND DATE(q.time) = CURDATE()
        AND q.queue_status IN ('pending', 'confirm')`,
      [dentistId]
    );

    // คำนวณสถิติ
    const stats = {
      total: appointments.length,
      today: todayCount[0]?.count || 0,
      pending: (statusCounts.find(s => s.queue_status === 'pending')?.count || 0) +
               (statusCounts.find(s => s.queue_status === 'confirm')?.count || 0),
      completed: statusCounts.find(s => s.queue_status === 'completed')?.count || 0,
      cancelled: statusCounts.find(s => s.queue_status === 'cancel')?.count || 0
    };

    return {
      appointments,
      stats
    };
  }

  /**
   * ลบคิว
   * @param {number} queueId
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async delete(queueId) {
    const [result] = await db.execute(
      `DELETE FROM queue WHERE queue_id = ?`,
      [queueId]
    );

    return {
      success: result.affectedRows > 0,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ดึงประวัติการรักษาทั้งหมดพร้อมสถิติ (สำหรับหน้า History)
   * @param {number} dentistId
   * @returns {Promise<Object>} { history, stats }
   */
  static async getTreatmentHistoryWithStats(dentistId) {
    // ดึงประวัติการรักษาทั้งหมด
    const [treatmentHistory] = await db.execute(
      `SELECT
        q.queue_id,
        q.time,
        q.queue_status,
        th.diagnosis,
        th.next_appointment,
        p.patient_id,
        p.fname,
        p.lname,
        p.phone,
        p.dob,
        t.treatment_name,
        t.duration,
        TIMESTAMPDIFF(YEAR, p.dob, CURDATE()) as age
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      LEFT JOIN treatmentHistory th ON qd.queuedetail_id = th.queuedetail_id
      WHERE q.dentist_id = ?
      ORDER BY q.time DESC`,
      [dentistId]
    );

    // จัดการข้อมูล
    const mappedHistory = treatmentHistory.map(item => ({
      ...item,
      age: item.age || 0
    }));

    // คำนวณสถิติ
    const uniquePatients = new Set(mappedHistory.map(item => item.patient_id)).size;
    const completed = mappedHistory.filter(item => item.queue_status === 'completed').length;
    const pending = mappedHistory.filter(item => item.queue_status === 'pending').length;
    const confirm = mappedHistory.filter(item => item.queue_status === 'confirm').length;
    const cancelled = mappedHistory.filter(item => item.queue_status === 'cancel').length;

    const stats = {
      uniquePatients,
      total: mappedHistory.length,
      completed,
      pending: pending + confirm, // รวม pending และ confirm เป็นรอรักษา
      cancelled
    };

    return {
      history: mappedHistory,
      stats
    };
  }

  /**
   * ทำเครื่องหมายนัดหมายเสร็จสิ้น (พร้อมตรวจสอบสิทธิ์)
   * @param {number} queueId
   * @param {number} dentistId
   * @param {Object} data - { diagnosis, nextAppointment }
   * @returns {Promise<Object>} { success, appointment }
   */
  static async completeAppointment(queueId, dentistId, data = {}) {
    const { diagnosis, nextAppointment } = data;

    // ตรวจสอบสิทธิ์และดึงข้อมูล
    const appointment = await this.findByIdWithDentistAuth(queueId, dentistId);

    if (!appointment) {
      throw new Error('ไม่พบข้อมูลนัดหมายหรือไม่มีสิทธิ์เข้าถึง');
    }

    if (appointment.queue_status === 'completed') {
      throw new Error('นัดหมายนี้เสร็จสิ้นแล้ว');
    }

    // สร้าง query สำหรับอัปเดต
    let updateQuery = `UPDATE queue SET queue_status = 'completed'`;
    const updateParams = [];

    if (diagnosis) {
      updateQuery += ', diagnosis = ?';
      updateParams.push(diagnosis);
    }

    if (nextAppointment) {
      updateQuery += ', next_appointment = ?';
      updateParams.push(nextAppointment);
    }

    updateQuery += ' WHERE queue_id = ?';
    updateParams.push(queueId);

    await db.execute(updateQuery, updateParams);

    return {
      success: true,
      appointment
    };
  }

  /**
   * ดึงนัดหมายวันนี้ของทันตแพทย์ (เฉพาะที่รอรักษา)
   * @param {number} dentistId
   * @returns {Promise<Array>}
   */
  static async findTodayAppointments(dentistId) {
    const [appointments] = await db.execute(
      `SELECT
        q.queue_id,
        q.time,
        q.queue_status,
        p.fname,
        p.lname,
        t.treatment_name
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      WHERE q.dentist_id = ?
        AND DATE(q.time) = CURDATE()
        AND q.queue_status IN ('pending', 'confirm')
      ORDER BY q.time ASC`,
      [dentistId]
    );

    return appointments;
  }

  /**
   * ดึงนัดหมายที่กำลังจะมาถึง (upcoming) ของทันตแพทย์
   * @param {number} dentistId
   * @param {number} limit - จำนวนผลลัพธ์สูงสุด (default = 10)
   * @returns {Promise<Array>}
   */
  static async findUpcomingAppointments(dentistId, limit = 10) {
    const [appointments] = await db.execute(
      `SELECT
        q.queue_id,
        q.time,
        q.queue_status,
        p.fname,
        p.lname,
        t.treatment_name
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      WHERE q.dentist_id = ?
        AND q.time > NOW()
        AND q.queue_status IN ('pending', 'confirm')
      ORDER BY q.time ASC
      LIMIT ?`,
      [dentistId, limit]
    );

    return appointments;
  }

  /**
   * ดึงนัดหมายล่าสุดของผู้ป่วยกับทันตแพทย์คนนี้
   * @param {number} patientId
   * @param {number} dentistId
   * @param {number} limit - จำนวนผลลัพธ์สูงสุด (default = 5)
   * @returns {Promise<Array>}
   */
  static async findPatientLatestAppointments(patientId, dentistId, limit = 5) {
    const [appointments] = await db.execute(
      `SELECT
        q.queue_id,
        q.time,
        q.queue_status,
        th.diagnosis,
        t.treatment_name
      FROM queue q
      JOIN treatment t ON q.treatment_id = t.treatment_id
      LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      LEFT JOIN treatmentHistory th ON qd.queuedetail_id = th.queuedetail_id
      WHERE q.patient_id = ?
        AND q.dentist_id = ?
      ORDER BY q.time DESC
      LIMIT ?`,
      [patientId, dentistId, limit]
    );

    return appointments;
  }

  /**
   * ดึงข้อมูลปฏิทินรายเดือน (จำนวนนัดหมายในแต่ละวัน)
   * @param {number} dentistId
   * @param {number} year - ปี (YYYY)
   * @param {number} month - เดือน (1-12)
   * @returns {Promise<Array>} [ { day: 1, count: 3 }, { day: 15, count: 2 }, ... ]
   */
  static async getMonthlyCalendarData(dentistId, year, month) {
    const [calendarData] = await db.execute(
      `SELECT DAY(q.time) as day, COUNT(*) as count
       FROM queue q
       WHERE q.dentist_id = ?
         AND YEAR(q.time) = ?
         AND MONTH(q.time) = ?
         AND q.queue_status IN ('pending', 'confirm')
       GROUP BY DAY(q.time)`,
      [dentistId, year, month]
    );

    return calendarData;
  }

  /**
   * ดึงสถิติสำหรับ Dashboard (API version - เบาๆ)
   * @param {number} dentistId
   * @returns {Promise<Object>}
   */
  static async getDashboardStats(dentistId) {
    // ผู้ป่วยวันนี้ (รอรักษา)
    const [todayPatients] = await db.execute(
      `SELECT COUNT(DISTINCT patient_id) as count
       FROM queue
       WHERE dentist_id = ?
         AND DATE(time) = CURDATE()
         AND queue_status IN ('pending', 'confirm')`,
      [dentistId]
    );

    // ผู้ป่วยทั้งหมด
    const [totalPatients] = await db.execute(
      `SELECT COUNT(DISTINCT patient_id) as count
       FROM queue
       WHERE dentist_id = ?`,
      [dentistId]
    );

    // นัดหมายที่ยกเลิก
    const [cancelled] = await db.execute(
      `SELECT COUNT(*) as count
       FROM queue
       WHERE dentist_id = ? AND queue_status = 'cancel'`,
      [dentistId]
    );

    // นัดหมายที่เสร็จสิ้น (confirm และเกินเวลาแล้ว)
    const [completed] = await db.execute(
      `SELECT COUNT(*) as count
       FROM queue
       WHERE dentist_id = ?
         AND queue_status = 'confirm'
         AND time < NOW()`,
      [dentistId]
    );

    return {
      todayPatients: todayPatients[0].count,
      totalPatients: totalPatients[0].count,
      cancelledAppointments: cancelled[0].count,
      completedAppointments: completed[0].count
    };
  }

  /**
   * ดึงข้อมูลนัดหมายพร้อมตรวจสอบสิทธิ์ของผู้ป่วย (สำหรับ cancel)
   * @param {number} queueId
   * @param {number} patientId
   * @returns {Promise<Object|null>}
   */
  static async findByIdWithPatientAuth(queueId, patientId) {
    const [rows] = await db.execute(
      `SELECT
        q.queue_id,
        q.time,
        q.queue_status,
        q.dentist_id,
        CONCAT(p.fname, ' ', p.lname) as patient_name,
        CONCAT(d.fname, ' ', d.lname) as dentist_name
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      WHERE q.queue_id = ? AND q.patient_id = ?`,
      [queueId, patientId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * อัปเดตสถานะนัดหมายของผู้ป่วย (ยกเลิก)
   * @param {number} queueId
   * @param {number} patientId
   * @param {string} status
   * @returns {Promise<Object>}
   */
  static async updatePatientAppointmentStatus(queueId, patientId, status) {
    const [result] = await db.execute(
      `UPDATE queue
       SET queue_status = ?
       WHERE queue_id = ? AND patient_id = ?`,
      [status, queueId, patientId]
    );

    return {
      success: result.affectedRows > 0,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ดึงประวัติการรักษาของผู้ป่วย (สำหรับหน้า History)
   * @param {number} patientId
   * @returns {Promise<Array>}
   */
  static async getPatientHistoryWithDetails(patientId) {
    const [rows] = await db.execute(
      `SELECT q.queue_id, q.time, q.queue_status, th.diagnosis, th.next_appointment,
             t.treatment_name, t.duration,
             CONCAT(d.fname, ' ', d.lname) as dentist_name,
             d.specialty,
             qd.date, qd.created_at
      FROM queue q
      JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      LEFT JOIN treatmentHistory th ON qd.queuedetail_id = th.queuedetail_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      WHERE q.patient_id = ?
      ORDER BY q.time ASC`,
      [patientId]
    );
    return rows;
  }

  /**
   * ดึงรายละเอียดนัดหมายของผู้ป่วย (สำหรับหน้า Detail)
   * @param {number} queueId
   * @param {number} patientId
   * @returns {Promise<Object|null>}
   */
  static async getPatientAppointmentDetail(queueId, patientId) {
    const [rows] = await db.execute(
      `SELECT q.*, qd.date, qd.created_at,
             t.treatment_name, t.duration,
             CONCAT(d.fname, ' ', d.lname) as dentist_name,
             d.specialty,
             CONCAT(p.fname, ' ', p.lname) as patient_name
      FROM queue q
      JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      JOIN patient p ON q.patient_id = p.patient_id
      WHERE q.queue_id = ? AND q.patient_id = ?`,
      [queueId, patientId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ดึงประวัติการรักษาของผู้ป่วยตามปี
   * @param {number} patientId
   * @returns {Promise<Array>}
   */
  static async getPatientTreatmentsByYear(patientId) {
    const [rows] = await db.execute(
      `SELECT q.queue_id, q.time, th.diagnosis, th.next_appointment,
             t.treatment_name, t.duration,
             CONCAT(d.fname, ' ', d.lname) as dentist_name,
             d.specialty,
             qd.date, qd.created_at,
             th.diagnosis as treatment_diagnosis,
             th.followUpdate,
             YEAR(qd.date) as treatment_year,
             MONTH(qd.date) as treatment_month,
             DAY(qd.date) as treatment_day
      FROM queue q
      JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      LEFT JOIN treatmentHistory th ON qd.queuedetail_id = th.queuedetail_id
      WHERE q.patient_id = ? AND (q.queue_status = 'confirm' OR th.tmh_id IS NOT NULL)
      ORDER BY qd.date DESC, q.time DESC`,
      [patientId]
    );
    return rows;
  }

  /**
   * ดึงรายละเอียดประวัติการรักษาของผู้ป่วย
   * @param {number} queueId
   * @param {number} patientId
   * @returns {Promise<Object|null>}
   */
  static async getPatientTreatmentHistoryDetail(queueId, patientId) {
    const [rows] = await db.execute(
      `SELECT
        q.queue_id,
        q.time,
        q.queue_status,
        th.diagnosis,
        th.next_appointment,
        p.patient_id,
        p.fname as patient_fname,
        p.lname as patient_lname,
        p.gender,
        p.dob,
        p.phone,
        p.address,
        p.id_card,
        p.chronic_disease,
        p.allergy_history,
        d.fname as dentist_fname,
        d.lname as dentist_lname,
        d.specialty,
        t.treatment_name,
        t.duration,
        th.diagnosis as treatment_diagnosis,
        th.followUpdate as next_appointment_detail,
        qd.date
      FROM queue q
      JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      LEFT JOIN treatmentHistory th ON qd.queuedetail_id = th.queuedetail_id
      WHERE q.queue_id = ? AND q.patient_id = ?`,
      [queueId, patientId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ดึงนัดหมายตามวันที่พร้อมรายละเอียด (สำหรับ getAppointmentsAPI)
   * @param {number} dentistId
   * @param {string} date - รูปแบบ YYYY-MM-DD
   * @returns {Promise<Array>}
   */
  static async findByDate(dentistId, date) {
    const [appointments] = await db.execute(
      `SELECT
        q.queue_id,
        q.time,
        q.queue_status,
        th.diagnosis,
        p.fname,
        p.lname,
        p.phone,
        t.treatment_name,
        t.duration
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      LEFT JOIN treatmentHistory th ON qd.queuedetail_id = th.queuedetail_id
      WHERE q.dentist_id = ?
        AND DATE(q.time) = ?
      ORDER BY q.time ASC`,
      [dentistId, date]
    );

    return appointments;
  }

  /**
   * สร้างการจองพร้อม transaction (สำหรับ bookAppointmentWithSchedule)
   * @param {Object} connection - MySQL connection object
   * @param {Object} bookingData - { patientId, treatmentId, dentistId, date, startTime, note }
   * @param {Array} slotsToBook - Array of slot objects to book
   * @returns {Promise<Object>} { queueId, queueDetailId, bookingDetails }
   */
  static async createBookingWithSlots(connection, bookingData, slotsToBook) {
    const { patientId, treatmentId, dentistId, date, startTime, note } = bookingData;

    // startTime มาในรูปแบบ HH:MM:SS หรือ HH:MM
    // ถ้าเป็น HH:MM ให้เพิ่ม :00 ถ้าเป็น HH:MM:SS อยู่แล้วไม่ต้องเพิ่ม
    const timeFormat = startTime.split(':').length === 2 ? `${startTime}:00` : startTime;
    const appointmentDateTime = `${date} ${timeFormat}`;

    // สร้าง queuedetail
    const [queueDetailResult] = await connection.execute(
      `INSERT INTO queuedetail (patient_id, treatment_id, dentist_id, date, note, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [patientId, treatmentId, dentistId, date, note]
    );

    const queueDetailId = queueDetailResult.insertId;

    // สร้าง queue (ไม่มี diagnosis column - อยู่ใน treatmentHistory)
    const [queueResult] = await connection.execute(
      `INSERT INTO queue (queuedetail_id, patient_id, treatment_id, dentist_id, time, queue_status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [queueDetailId, patientId, treatmentId, dentistId, appointmentDateTime]
    );

    const queueId = queueResult.insertId;

    // ไม่ต้องอัปเดต available_slots เพราะระบบใช้ dentist_schedule และ queue แทน
    // slotsToBook ใช้เพื่อตรวจสอบความต่อเนื่องของเวลาก่อนหน้านี้เท่านั้น

    // ดึงรายละเอียดการจอง
    const [bookingDetails] = await connection.execute(
      `SELECT
        q.queue_id,
        q.time,
        CONCAT(p.fname, ' ', p.lname) as patient_name,
        CONCAT(d.fname, ' ', d.lname) as dentist_name,
        t.treatment_name,
        t.duration
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      WHERE q.queue_id = ?`,
      [queueId]
    );

    return {
      queueId,
      queueDetailId,
      bookingDetails: bookingDetails[0]
    };
  }

  /**
   * ตรวจสอบว่าผู้ป่วยมีนัดหมายในวันเดียวกันหรือไม่
   * @param {Object} connection - MySQL connection object
   * @param {number} patientId
   * @param {string} date - รูปแบบ YYYY-MM-DD
   * @returns {Promise<number>} จำนวนนัดหมาย
   */
  static async checkExistingAppointmentOnDate(connection, patientId, date) {
    const [existingAppointments] = await connection.execute(
      `SELECT COUNT(*) as count
       FROM queue q
       WHERE q.patient_id = ?
       AND DATE(q.time) = ?
       AND q.queue_status IN ('pending', 'confirm')`,
      [patientId, date]
    );
    return existingAppointments[0].count;
  }

  /**
   * สร้างการจองแบบ legacy (ใช้ dentist_schedule)
   * @param {Object} bookingData - { patientId, treatmentId, dentistId, date, time, note }
   * @returns {Promise<Object>} { queueId, queueDetailId, success }
   */
  static async createLegacyBooking(bookingData) {
    const { patientId, treatmentId, dentistId, date, time, note } = bookingData;

    const appointmentTime = `${date} ${time}:00`;

    // Insert into queuedetail
    const [queueDetailResult] = await db.execute(
      `INSERT INTO queuedetail (patient_id, treatment_id, dentist_id, date, note, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [patientId, treatmentId, dentistId, date, note]
    );

    const queueDetailId = queueDetailResult.insertId;

    // Insert into queue (ไม่มี diagnosis column - อยู่ใน treatmentHistory)
    const [queueResult] = await db.execute(
      `INSERT INTO queue (queuedetail_id, patient_id, treatment_id, dentist_id, time, queue_status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [queueDetailId, patientId, treatmentId, dentistId, appointmentTime]
    );

    const queueId = queueResult.insertId;

    return {
      queueId,
      queueDetailId,
      success: true
    };
  }

  /**
   * อัปเดตเวลานัดหมาย (สำหรับ patient edit appointment)
   * @param {number} queueId
   * @param {number} patientId
   * @param {string} newDate
   * @param {string} newTime
   * @returns {Promise<Object>} { success, queuedetailId }
   */
  static async updateAppointmentTime(queueId, patientId, newDate, newTime) {
    const newAppointmentTime = `${newDate} ${newTime}:00`;

    // Get current appointment
    const [current] = await db.execute(
      `SELECT queuedetail_id FROM queue WHERE queue_id = ? AND patient_id = ?`,
      [queueId, patientId]
    );

    if (current.length === 0) {
      throw new Error('ไม่พบข้อมูลนัดหมาย');
    }

    const queuedetailId = current[0].queuedetail_id;

    // Update queue time
    await db.execute(
      `UPDATE queue SET time = ? WHERE queue_id = ? AND patient_id = ?`,
      [newAppointmentTime, queueId, patientId]
    );

    // Update queuedetail date
    await db.execute(
      `UPDATE queuedetail SET date = ? WHERE queuedetail_id = ?`,
      [newDate, queuedetailId]
    );

    return {
      success: true,
      queuedetailId
    };
  }

  /**
   * ยกเลิกนัดหมาย (สำหรับ patient - legacy)
   * @param {number} queueId
   * @param {number} patientId
   * @returns {Promise<Object>}
   */
  static async cancelPatientAppointment(queueId, patientId) {
    const [result] = await db.execute(
      `UPDATE queue SET queue_status = 'cancel' WHERE queue_id = ? AND patient_id = ?`,
      [queueId, patientId]
    );

    return {
      success: result.affectedRows > 0,
      affectedRows: result.affectedRows
    };
  }

  /**
   * สร้างประวัติการรักษาแบบเต็มรูปแบบ (queue + queuedetail + treatmentHistory)
   * สำหรับการรักษาที่ไม่ได้จองล่วงหน้า
   * @param {Object} treatmentData - { dentistId, patientId, treatmentId, appointmentDate, diagnosis, followUpdate, followUpDate, note }
   * @returns {Promise<Object>} { queueId, queueDetailId, treatmentHistoryId, success }
   */
  static async createFullTreatmentRecord(treatmentData) {
    const {
      dentistId,
      patientId,
      treatmentId,
      appointmentDate,
      diagnosis,
      followUpdate = '',
      followUpDate = null,
      note = null
    } = treatmentData;

    // Validation
    if (!dentistId || !patientId || !treatmentId || !appointmentDate || !diagnosis) {
      throw new Error('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน');
    }

    // สร้าง queuedetail
    const [queueDetailResult] = await db.execute(
      `INSERT INTO queuedetail (patient_id, treatment_id, dentist_id, date, note, created_at)
       VALUES (?, ?, ?, DATE(?), ?, NOW())`,
      [patientId, treatmentId, dentistId, appointmentDate, note]
    );

    const queueDetailId = queueDetailResult.insertId;

    // สร้าง queue
    const [queueResult] = await db.execute(
      `INSERT INTO queue (queuedetail_id, patient_id, treatment_id, dentist_id, time, queue_status, next_appointment)
       VALUES (?, ?, ?, ?, ?, 'confirm', ?)`,
      [queueDetailId, patientId, treatmentId, dentistId, appointmentDate, followUpDate]
    );

    const queueId = queueResult.insertId;

    // สร้าง treatmentHistory
    const [historyResult] = await db.execute(
      `INSERT INTO treatmentHistory (queuedetail_id, diagnosis, followUpdate)
       VALUES (?, ?, ?)`,
      [queueDetailId, diagnosis.trim(), followUpdate.trim()]
    );

    const treatmentHistoryId = historyResult.insertId;

    return {
      queueId,
      queueDetailId,
      treatmentHistoryId,
      success: true
    };
  }

  /**
   * ค้นหาประวัติการรักษาพร้อม filters (สำหรับ searchPatientHistory)
   * @param {number} dentistId
   * @param {Object} filters - { query, status, dateFrom, dateTo, limit }
   * @returns {Promise<Array>}
   */
  static async searchTreatmentHistory(dentistId, filters = {}) {
    const { query, status, dateFrom, dateTo, limit = 100 } = filters;

    let whereClause = 'WHERE q.dentist_id = ?';
    const params = [dentistId];

    if (query) {
      whereClause += ' AND (p.fname LIKE ? OR p.lname LIKE ? OR t.treatment_name LIKE ?)';
      params.push(`%${query}%`, `%${query}%`, `%${query}%`);
    }

    if (status && status !== 'all') {
      whereClause += ' AND q.queue_status = ?';
      params.push(status);
    }

    if (dateFrom) {
      whereClause += ' AND DATE(q.time) >= ?';
      params.push(dateFrom);
    }

    if (dateTo) {
      whereClause += ' AND DATE(q.time) <= ?';
      params.push(dateTo);
    }

    const [results] = await db.execute(
      `SELECT
        q.queue_id,
        q.time,
        q.queue_status,
        th.diagnosis,
        p.patient_id,
        p.fname,
        p.lname,
        p.phone,
        p.dob,
        t.treatment_name,
        t.duration,
        TIMESTAMPDIFF(YEAR, p.dob, CURDATE()) as age
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      LEFT JOIN treatmentHistory th ON qd.queuedetail_id = th.queuedetail_id
      ${whereClause}
      ORDER BY q.time DESC
      LIMIT ?`,
      [...params, limit]
    );

    return results;
  }

  /**
   * ทำเครื่องหมายนัดหมายว่าเสร็จสิ้นพร้อมสร้าง/อัปเดตประวัติการรักษา (พร้อมตรวจสอบสิทธิ์)
   * @param {number} queueId
   * @param {number} dentistId
   * @param {Object} historyData - { diagnosis, nextAppointment }
   * @returns {Promise<Object>} { success, queueId, treatmentHistoryId }
   */
  static async completeAppointmentWithHistory(queueId, dentistId, historyData) {
    const { diagnosis, nextAppointment } = historyData;

    // Validation
    if (!diagnosis || !diagnosis.trim()) {
      throw new Error('กรุณากรอกข้อมูลการวินิจฉัย');
    }

    // ตรวจสอบสิทธิ์และดึง queuedetail_id
    const [appointmentCheck] = await db.execute(
      `SELECT q.queue_id, q.queue_status, q.queuedetail_id
       FROM queue q
       WHERE q.queue_id = ? AND q.dentist_id = ?`,
      [queueId, dentistId]
    );

    if (appointmentCheck.length === 0) {
      throw new Error('ไม่มีสิทธิ์เข้าถึงข้อมูลการจองนี้');
    }

    const queuedetailId = appointmentCheck[0].queuedetail_id;

    if (!queuedetailId) {
      throw new Error('ไม่พบข้อมูล queuedetail');
    }

    // เริ่ม transaction
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      // อัพเดทสถานะเป็น 'completed'
      await connection.execute(
        `UPDATE queue
         SET queue_status = 'completed', next_appointment = ?
         WHERE queue_id = ?`,
        [nextAppointment?.trim() || null, queueId]
      );

      // ตรวจสอบว่ามีประวัติอยู่แล้วหรือไม่
      const [existingHistory] = await connection.execute(
        `SELECT tmh_id FROM treatmentHistory WHERE queuedetail_id = ?`,
        [queuedetailId]
      );

      let treatmentHistoryId;

      if (existingHistory.length > 0) {
        // อัพเดทประวัติที่มีอยู่
        treatmentHistoryId = existingHistory[0].tmh_id;
        await connection.execute(
          `UPDATE treatmentHistory
           SET diagnosis = ?, followUpdate = ?
           WHERE queuedetail_id = ?`,
          [diagnosis.trim(), nextAppointment?.trim() || '', queuedetailId]
        );
      } else {
        // เพิ่มประวัติใหม่
        const [insertResult] = await connection.execute(
          `INSERT INTO treatmentHistory (queuedetail_id, diagnosis, followUpdate)
           VALUES (?, ?, ?)`,
          [queuedetailId, diagnosis.trim(), nextAppointment?.trim() || '']
        );
        treatmentHistoryId = insertResult.insertId;
      }

      // Commit transaction
      await connection.commit();
      connection.release();

      return {
        success: true,
        queueId,
        treatmentHistoryId
      };

    } catch (error) {
      // Rollback transaction
      await connection.rollback();
      connection.release();
      throw error;
    }
  }

  /**
   * จองนัดหมายสำหรับผู้ป่วย (admin)
   * @param {Object} params - พารามิเตอร์การจอง
   * @returns {Object} ผลลัพธ์การจอง
   */
  static async bookAppointmentForPatient(params) {
    const connection = await db.getConnection();
    
    try {
      const { patient_id, dentist_id, treatment_id, date, start_time, note } = params;

      // ตรวจสอบวันอาทิตย์
      const appointmentDateTime = new Date(`${date} ${start_time}:00`);
      if (appointmentDateTime.getDay() === 0) {
        return {
          success: false,
          error: 'คลินิกปิดทำการวันอาทิตย์'
        };
      }

      // ดึง duration
      const [treatmentData] = await connection.execute(
        'SELECT duration FROM treatment WHERE treatment_id = ?',
        [treatment_id]
      );

      if (treatmentData.length === 0) {
        return {
          success: false,
          error: 'ไม่พบข้อมูลการรักษา'
        };
      }

      const duration = treatmentData[0].duration;
      const requiredSlots = Math.ceil(duration / 30);

      await connection.beginTransaction();

      try {
        const dentistIdInt = parseInt(dentist_id);
        const requiredSlotsInt = Math.max(1, parseInt(requiredSlots));

        // ดึง available slots
        const [allSlots] = await connection.execute(`
          SELECT s.slot_id, s.start_time, s.end_time
          FROM available_slots s
          WHERE s.dentist_id = ?
          AND s.date = ?
          AND s.start_time >= ?
          AND s.is_available = 1
          ORDER BY s.start_time
        `, [dentistIdInt, date, start_time]);

        // ตรวจสอบว่า slot ไหนมี booking แล้ว
        const slotsCheck = [];
        for (const slot of allSlots) {
          if (slotsCheck.length >= requiredSlotsInt) break;
          
          const slotDateTime = `${date} ${slot.start_time}`;
          
          const [existingBooking] = await connection.execute(`
            SELECT queue_id
            FROM queue
            WHERE dentist_id = ?
            AND time = ?
            AND queue_status IN ('pending', 'confirm')
          `, [dentistIdInt, slotDateTime]);
          
          if (existingBooking.length === 0) {
            slotsCheck.push(slot);
          }
        }

        if (slotsCheck.length < requiredSlotsInt) {
          await connection.rollback();
          return {
            success: false,
            error: `ช่วงเวลานี้ไม่เพียงพอสำหรับการรักษา (ต้องการ ${requiredSlotsInt} ช่วง, มีว่าง ${slotsCheck.length} ช่วง)`
          };
        }

        // ตรวจสอบว่า slots ต่อเนื่อง
        for (let i = 0; i < slotsCheck.length - 1; i++) {
          if (slotsCheck[i].end_time !== slotsCheck[i + 1].start_time) {
            await connection.rollback();
            return {
              success: false,
              error: 'ช่วงเวลาที่เลือกไม่ต่อเนื่องกัน'
            };
          }
        }

        // สร้าง queuedetail
        const [queueDetailResult] = await connection.execute(`
          INSERT INTO queuedetail (patient_id, treatment_id, dentist_id, date, note, created_at)
          VALUES (?, ?, ?, ?, ?, NOW())
        `, [patient_id, treatment_id, dentistIdInt, date, note]);

        const queueDetailId = queueDetailResult.insertId;

        // สร้าง queue โดยใช้ 'confirm' แทน 'pending' เพราะเป็น admin จอง
        console.log('🔍 Inserting into queue with params:', [queueDetailId, patient_id, treatment_id, dentistIdInt, appointmentDateTime]);
        console.log('🔍 SQL to execute:', `
          INSERT INTO queue (queuedetail_id, patient_id, treatment_id, dentist_id, time, queue_status)
          VALUES (?, ?, ?, ?, ?, 'confirm')
        `);
        const [queueResult] = await connection.execute(`
          INSERT INTO queue (queuedetail_id, patient_id, treatment_id, dentist_id, time, queue_status)
          VALUES (?, ?, ?, ?, ?, 'confirm')
        `, [queueDetailId, patient_id, treatment_id, dentistIdInt, appointmentDateTime]);

        const queueId = queueResult.insertId;

        // อัพเดท slots เป็น not available
        for (const slot of slotsCheck) {
          await connection.execute(`
            UPDATE available_slots
            SET treatment_id = ?, is_available = 0
            WHERE slot_id = ?
          `, [treatment_id, slot.slot_id]);
        }

        // ดึงรายละเอียดการจอง
        const [bookingDetails] = await connection.execute(`
          SELECT 
            q.queue_id,
            q.time,
            CONCAT(p.fname, ' ', p.lname) as patient_name,
            p.phone as patient_phone,
            CONCAT(d.fname, ' ', d.lname) as dentist_name,
            d.license_no,
            t.treatment_name,
            t.duration
          FROM queue q
          JOIN patient p ON q.patient_id = p.patient_id
          JOIN dentist d ON q.dentist_id = d.dentist_id
          JOIN treatment t ON q.treatment_id = t.treatment_id
          WHERE q.queue_id = ?
        `, [queueId]);

        // คำนวณเวลาสิ้นสุด
        const endDateTime = new Date(appointmentDateTime.getTime() + (duration * 60000));
        const endTime = `${String(endDateTime.getHours()).padStart(2, '0')}:${String(endDateTime.getMinutes()).padStart(2, '0')}`;

        await connection.commit();

        return {
          success: true,
          booking: {
            queue_id: queueId,
            appointment_time: appointmentDateTime,
            appointment_date: date,
            start_time: start_time,
            end_time: endTime,
            patient_name: bookingDetails[0]?.patient_name,
            patient_phone: bookingDetails[0]?.patient_phone,
            dentist_name: bookingDetails[0]?.dentist_name,
            dentist_license: bookingDetails[0]?.license_no,
            treatment_name: bookingDetails[0]?.treatment_name,
            duration: bookingDetails[0]?.duration,
            status: 'confirm'
          }
        };

      } catch (error) {
        await connection.rollback();
        throw error;
      }

    } catch (error) {
      console.error('Error booking appointment for patient:', error);
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = QueueModel;
