const db = require('../config/db');

class DentistModel {
  /**
   * สร้างทันตแพทย์ใหม่
   * @param {Object} dentistData
   * @returns {Promise<Object>} { dentistId, success }
   */
  static async create(dentistData) {
    const {
      fname,
      lname,
      specialization,
      phone,
      license_number,
      photo,
      userId
    } = dentistData;

    // Validate required fields
    if (!fname || !lname || !userId) {
      throw new Error('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน');
    }

    // Check for duplicate license number if provided
    if (license_number) {
      const existing = await this.findByLicenseNumber(license_number);
      if (existing) {
        throw new Error('เลขใบอนุญาตนี้มีในระบบแล้ว');
      }
    }

    // Check if user_id already has a dentist profile
    const existingDentist = await this.findByUserId(userId);
    if (existingDentist) {
      throw new Error('User นี้มีโปรไฟล์ทันตแพทย์แล้ว');
    }

    const [result] = await db.execute(
      `INSERT INTO dentist
       (fname, lname, specialization, phone, license_number, photo, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        fname,
        lname,
        specialization || null,
        phone || null,
        license_number || null,
        photo || 'default-avatar.png',
        userId
      ]
    );

    return {
      dentistId: result.insertId,
      success: true
    };
  }

  /**
   * ค้นหาทันตแพทย์ด้วย ID
   * @param {number} dentistId
   * @returns {Promise<Object|null>}
   */
  static async findById(dentistId) {
    const [rows] = await db.execute(
      `SELECT * FROM dentist WHERE dentist_id = ?`,
      [dentistId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ค้นหาทันตแพทย์ด้วย user_id
   * @param {number} userId
   * @returns {Promise<Object|null>}
   */
  static async findByUserId(userId) {
    const [rows] = await db.execute(
      `SELECT * FROM dentist WHERE user_id = ?`,
      [userId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ค้นหาทันตแพทย์ด้วยเลขใบอนุญาต
   * @param {string} licenseNumber
   * @returns {Promise<Object|null>}
   */
  static async findByLicenseNumber(licenseNumber) {
    const [rows] = await db.execute(
      `SELECT * FROM dentist WHERE license_number = ?`,
      [licenseNumber]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ดึงรายการทันตแพทย์ทั้งหมด
   * @param {Object} options - { limit, offset, search }
   * @returns {Promise<Array>}
   */
  static async findAll(options = {}) {
    const { limit = 50, offset = 0, search = '' } = options;

    let query = `
      SELECT
        d.*,
        u.email,
        u.username
      FROM dentist d
      LEFT JOIN user u ON d.user_id = u.user_id
    `;

    const params = [];

    if (search) {
      query += ` WHERE
        d.fname LIKE ? OR
        d.lname LIKE ? OR
        d.specialization LIKE ? OR
        d.license_number LIKE ?
      `;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    query += ` ORDER BY d.dentist_id DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await db.execute(query, params);
    return rows;
  }

  /**
   * นับจำนวนทันตแพทย์ทั้งหมด
   * @param {string} search
   * @returns {Promise<number>}
   */
  static async count(search = '') {
    let query = `SELECT COUNT(*) as total FROM dentist d`;
    const params = [];

    if (search) {
      query += ` WHERE
        d.fname LIKE ? OR
        d.lname LIKE ? OR
        d.specialization LIKE ? OR
        d.license_number LIKE ?
      `;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    const [rows] = await db.execute(query, params);
    return rows[0].total;
  }

  /**
   * อัปเดตข้อมูลทันตแพทย์
   * @param {number} dentistId
   * @param {Object} updateData
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async update(dentistId, updateData) {
    const {
      fname,
      lname,
      specialization,
      phone,
      license_number,
      photo
    } = updateData;

    // Validate required fields
    if (!fname || !lname) {
      throw new Error('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน');
    }

    // Check if dentist exists
    const existing = await this.findById(dentistId);
    if (!existing) {
      throw new Error('ไม่พบข้อมูลทันตแพทย์');
    }

    // Check for duplicate license number (exclude current dentist)
    if (license_number && license_number !== existing.license_number) {
      const duplicateLicense = await this.findByLicenseNumber(license_number);
      if (duplicateLicense && duplicateLicense.dentist_id !== dentistId) {
        throw new Error('เลขใบอนุญาตนี้มีในระบบแล้ว');
      }
    }

    const [result] = await db.execute(
      `UPDATE dentist
       SET fname = ?, lname = ?, specialization = ?,
           phone = ?, license_number = ?, photo = ?
       WHERE dentist_id = ?`,
      [
        fname,
        lname,
        specialization || null,
        phone || null,
        license_number || null,
        photo || existing.photo,
        dentistId
      ]
    );

    return {
      success: true,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ลบทันตแพทย์
   * @param {number} dentistId
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async delete(dentistId) {
    // Check if dentist has appointments
    const [appointments] = await db.execute(
      `SELECT COUNT(*) as count FROM queue q
       JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
       WHERE qd.dentist_id = ?`,
      [dentistId]
    );

    if (appointments[0].count > 0) {
      throw new Error('ไม่สามารถลบทันตแพทย์ที่มีประวัติการนัดหมายได้');
    }

    const [result] = await db.execute(
      `DELETE FROM dentist WHERE dentist_id = ?`,
      [dentistId]
    );

    return {
      success: result.affectedRows > 0,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ดึงข้อมูลทันตแพทย์พร้อมข้อมูล user
   * @param {number} dentistId
   * @returns {Promise<Object|null>}
   */
  static async findByIdWithUser(dentistId) {
    const [rows] = await db.execute(
      `SELECT
        d.*,
        u.email,
        u.username
       FROM dentist d
       LEFT JOIN user u ON d.user_id = u.user_id
       WHERE d.dentist_id = ?`,
      [dentistId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ดึงสถิติของทันตแพทย์
   * @param {number} dentistId
   * @returns {Promise<Object>}
   */
  static async getStatistics(dentistId) {
    // Total appointments
    const [totalAppointments] = await db.execute(
      `SELECT COUNT(*) as total FROM queue q
       JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
       WHERE qd.dentist_id = ?`,
      [dentistId]
    );

    // Completed appointments
    const [completedAppointments] = await db.execute(
      `SELECT COUNT(*) as total FROM queue q
       JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
       WHERE qd.dentist_id = ? AND queue_status = 'completed'`,
      [dentistId]
    );

    // Pending appointments
    const [pendingAppointments] = await db.execute(
      `SELECT COUNT(*) as total FROM queue q
       JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
       WHERE qd.dentist_id = ? AND queue_status = 'pending'`,
      [dentistId]
    );

    // Unique patients
    const [uniquePatients] = await db.execute(
      `SELECT COUNT(DISTINCT q.patient_id) as total FROM queue q
       JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
       WHERE qd.dentist_id = ?`,
      [dentistId]
    );

    return {
      totalAppointments: totalAppointments[0].total,
      completedAppointments: completedAppointments[0].total,
      pendingAppointments: pendingAppointments[0].total,
      uniquePatients: uniquePatients[0].total
    };
  }

  /**
   * ดึงข้อมูล Dashboard สำหรับทันตแพทย์ (รวมทุกอย่าง)
   * @param {number} dentistId
   * @returns {Promise<Object>}
   */
  static async getDashboardData(dentistId) {
    // ผู้ป่วยวันนี้ (รอรักษา - เฉพาะที่แอดมินยืนยันแล้ว)
    const [todayPatients] = await db.execute(
      `SELECT COUNT(DISTINCT q.patient_id) as count
       FROM queue q
       JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
       WHERE qd.dentist_id = ?
         AND DATE(q.time) = CURDATE()
         AND q.queue_status = 'confirm'`,
      [dentistId]
    );

    // ผู้ป่วยทั้งหมด (ไม่รวม pending)
    const [totalPatients] = await db.execute(
      `SELECT COUNT(DISTINCT q.patient_id) as count
       FROM queue q
       JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
       WHERE qd.dentist_id = ? AND q.queue_status != 'pending'`,
      [dentistId]
    );

    // นัดหมายที่ยกเลิก
    const [cancelled] = await db.execute(
      `SELECT COUNT(*) as count
       FROM queue q
       JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
       WHERE qd.dentist_id = ?
         AND q.queue_status = 'cancel'`,
      [dentistId]
    );

    // นัดหมายที่เสร็จสิ้น
    const [completed] = await db.execute(
      `SELECT COUNT(*) as count
       FROM queue q
       JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
       WHERE qd.dentist_id = ?
         AND q.queue_status = 'completed'`,
      [dentistId]
    );

    // นัดหมายล่าสุด (ไม่รวม pending)
    const [latestAppointments] = await db.execute(
      `SELECT
        q.queue_id,
        q.time,
        q.queue_status,
        th.diagnosis,
        p.fname,
        p.lname,
        t.treatment_name,
        t.duration
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      JOIN treatment t ON qd.treatment_id = t.treatment_id
      LEFT JOIN treatmentHistory th ON qd.queuedetail_id = th.queuedetail_id
      WHERE qd.dentist_id = ? AND q.queue_status != 'pending'
      ORDER BY q.time DESC
      LIMIT 10`,
      [dentistId]
    );

    // นัดหมายที่กำลังจะมาถึง (รอรักษา - เฉพาะที่แอดมินยืนยันแล้ว)
    const [upcomingAppointments] = await db.execute(
      `SELECT
        q.queue_id,
        q.time,
        q.queue_status,
        p.fname,
        p.lname,
        t.treatment_name
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      JOIN treatment t ON qd.treatment_id = t.treatment_id
      WHERE qd.dentist_id = ?
        AND q.time >= NOW()
        AND q.queue_status = 'confirm'
      ORDER BY q.time ASC
      LIMIT 5`,
      [dentistId]
    );

    // เวรวันนี้ (เฉพาะที่แอดมินยืนยันแล้ว)
    const [todaySchedule] = await db.execute(
      `SELECT
        q.queue_id,
        q.time,
        q.queue_status,
        p.fname,
        p.lname,
        t.treatment_name
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      JOIN treatment t ON qd.treatment_id = t.treatment_id
      WHERE qd.dentist_id = ?
        AND DATE(q.time) = CURDATE()
        AND q.queue_status = 'confirm'
      ORDER BY q.time ASC
      LIMIT 1`,
      [dentistId]
    );

    // ปฏิทินเดือนนี้ (เฉพาะที่แอดมินยืนยันแล้ว)
    const [monthlyAppointments] = await db.execute(
      `SELECT DAY(q.time) as day, COUNT(*) as count
      FROM queue q
      JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      WHERE qd.dentist_id = ?
        AND MONTH(q.time) = MONTH(CURDATE())
        AND YEAR(q.time) = YEAR(CURDATE())
        AND q.queue_status = 'confirm'
      GROUP BY DAY(q.time)`,
      [dentistId]
    );

    return {
      stats: {
        todayPatients: todayPatients[0].count || 0,
        totalPatients: totalPatients[0].count || 0,
        cancelledAppointments: cancelled[0].count || 0,
        completedAppointments: completed[0].count || 0,
      },
      latestAppointments: latestAppointments || [],
      upcomingAppointments: upcomingAppointments || [],
      todaySchedule: todaySchedule[0] || null,
      monthlyAppointments: monthlyAppointments || []
    };
  }

  /**
   * ดึงข้อมูลทันตแพทย์พร้อมข้อมูล user (รวม last_login)
   * @param {number} userId
   * @returns {Promise<Object|null>}
   */
  static async findByUserIdWithFullInfo(userId) {
    const [rows] = await db.execute(
      `SELECT d.*, u.email, u.username, u.last_login
       FROM dentist d
       JOIN user u ON d.user_id = u.user_id
       WHERE d.user_id = ?`,
      [userId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * อัปเดตโปรไฟล์ทันตแพทย์ (รวมทั้ง user และ dentist tables)
   * @param {number} userId
   * @param {Object} profileData
   * @returns {Promise<Object>} { success }
   */
  static async updateProfile(userId, profileData) {
    const {
      fname, lname, id_card, license_no, email,
      phone, specialty, address, education, dob, photo
    } = profileData;

    // Validate required fields
    if (!fname || !fname.trim()) {
      throw new Error('กรุณากรอกชื่อ');
    }
    if (!lname || !lname.trim()) {
      throw new Error('กรุณากรอกนามสกุล');
    }
    if (!id_card || !id_card.trim()) {
      throw new Error('กรุณากรอกเลขบัตรประชาชน');
    }
    if (!email || !email.trim()) {
      throw new Error('กรุณากรอกอีเมล');
    }

    // Validate ID card format (13 digits)
    if (!/^\d{13}$/.test(id_card)) {
      throw new Error('เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('รูปแบบอีเมลไม่ถูกต้อง');
    }

    // Check for duplicate email (exclude current user)
    const [emailCheck] = await db.execute(
      `SELECT user_id FROM user WHERE email = ? AND user_id != ?`,
      [email.trim(), userId]
    );

    if (emailCheck.length > 0) {
      throw new Error('อีเมลนี้ถูกใช้งานแล้ว');
    }

    // Check for duplicate ID card (exclude current user)
    const [idCardCheck] = await db.execute(
      `SELECT dentist_id FROM dentist WHERE id_card = ? AND user_id != ?`,
      [id_card.trim(), userId]
    );

    if (idCardCheck.length > 0) {
      throw new Error('เลขบัตรประชาชนนี้ถูกใช้งานแล้ว');
    }

    // Update user table
    await db.execute(
      `UPDATE user SET email = ? WHERE user_id = ?`,
      [email.trim(), userId]
    );

    // Build dentist update query
    let updateQuery = `
      UPDATE dentist
      SET fname = ?, lname = ?, id_card = ?, license_no = ?,
          phone = ?, specialty = ?, address = ?, education = ?, dob = ?
    `;

    const updateParams = [
      fname.trim(),
      lname.trim(),
      id_card.trim(),
      license_no && license_no.trim() !== '' ? license_no : null,
      phone && phone.trim() !== '' ? phone : null,
      specialty && specialty.trim() !== '' ? specialty : null,
      address && address.trim() !== '' ? address : null,
      education && education.trim() !== '' ? education : null,
      dob && dob.trim() !== '' ? dob : null
    ];

    // Add photo if provided
    if (photo) {
      updateQuery += `, photo = ?`;
      updateParams.push(photo);
    }

    updateQuery += ` WHERE user_id = ?`;
    updateParams.push(userId);

    await db.execute(updateQuery, updateParams);

    return {
      success: true,
      email: email.trim()
    };
  }

  /**
   * ดึงรายการทันตแพทย์สำหรับผู้ป่วย (พร้อมการค้นหา)
   * @param {string} searchQuery - คำค้นหา
   * @returns {Promise<Array>}
   */
  static async findAllForPatients(searchQuery = '') {
    let query = `
      SELECT d.dentist_id, d.fname, d.lname, d.specialty, d.education, d.photo,
             CONCAT(d.fname, ' ', d.lname) as full_name,
             u.email
      FROM dentist d
      JOIN user u ON d.user_id = u.user_id
      WHERE u.role_id = 2 AND d.fname IS NOT NULL AND d.lname IS NOT NULL
    `;

    const queryParams = [];

    if (searchQuery) {
      query += ` AND (CONCAT(d.fname, ' ', d.lname) LIKE ? OR d.specialty LIKE ?)`;
      queryParams.push(`%${searchQuery}%`, `%${searchQuery}%`);
    }

    query += ` ORDER BY d.specialty ASC, d.fname ASC`;

    const [dentists] = await db.execute(query, queryParams);
    return dentists;
  }

  /**
   * ดึงข้อมูลการรักษาของทันตแพทย์
   * @param {number} dentistId
   * @returns {Promise<Array>}
   */
  static async getTreatments(dentistId) {
    const [treatments] = await db.execute(
      `SELECT t.treatment_id, t.treatment_name, t.duration
       FROM dentist_treatment dt
       JOIN treatment t ON dt.treatment_id = t.treatment_id
       WHERE dt.dentist_id = ?
       ORDER BY t.treatment_name`,
      [dentistId]
    );
    return treatments;
  }

  /**
   * ดึงรายการทันตแพทย์พร้อม available slots (สำหรับ patient)
   * @param {string} searchQuery
   * @returns {Promise<Array>}
   */
  static async findAllWithAvailability(searchQuery = '') {
    let query = `
      SELECT
        d.dentist_id,
        d.fname,
        d.lname,
        d.specialty,
        d.education,
        d.photo,
        CONCAT(d.fname, ' ', d.lname) as full_name,
        u.email,
        (
          SELECT COUNT(*)
          FROM dentist_schedule ds
          WHERE ds.dentist_id = d.dentist_id
          AND ds.schedule_date >= CURDATE()
          AND ds.schedule_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
          AND ds.status = 'working'
          AND NOT EXISTS (
            SELECT 1 FROM queue q
            JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
            WHERE qd.dentist_id = ds.dentist_id
            AND DATE(q.time) = ds.schedule_date
            AND HOUR(q.time) = ds.hour
            AND q.queue_status IN ('pending', 'confirm')
          )
        ) as available_slots_this_week
      FROM dentist d
      JOIN user u ON d.user_id = u.user_id
      WHERE u.role_id = 2 AND d.fname IS NOT NULL AND d.lname IS NOT NULL
    `;

    const queryParams = [];

    if (searchQuery) {
      query += ` AND (CONCAT(d.fname, ' ', d.lname) LIKE ? OR d.specialty LIKE ?)`;
      queryParams.push(`%${searchQuery}%`, `%${searchQuery}%`);
    }

    query += ` ORDER BY d.specialty ASC, d.fname ASC`;

    const [dentists] = await db.execute(query, queryParams);
    return dentists;
  }

  /**
   * ดึงโปรไฟล์ทันตแพทย์พร้อมสถิติ (สำหรับ patient ดู)
   * @param {number} dentistId
   * @returns {Promise<Object|null>}
   */
  static async getProfileWithStats(dentistId) {
    const [dentistResult] = await db.execute(
      `SELECT
        d.dentist_id,
        d.fname,
        d.lname,
        CONCAT(d.fname, ' ', d.lname) as full_name,
        d.specialty,
        d.education,
        d.phone,
        d.photo,
        u.email,
        (
          SELECT COUNT(*)
          FROM dentist_schedule ds
          WHERE ds.dentist_id = d.dentist_id
          AND ds.schedule_date >= CURDATE()
          AND ds.schedule_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
          AND ds.status = 'working'
          AND NOT EXISTS (
            SELECT 1 FROM queue q
            JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
            WHERE qd.dentist_id = ds.dentist_id
            AND DATE(q.time) = ds.schedule_date
            AND HOUR(q.time) = ds.hour
            AND q.queue_status IN ('pending', 'confirm')
          )
        ) as available_slots_this_week,
        (
          SELECT COUNT(*)
          FROM queue q
          JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
          WHERE qd.dentist_id = d.dentist_id
          AND q.queue_status = 'confirm'
        ) as total_patients_treated
      FROM dentist d
      JOIN user u ON d.user_id = u.user_id
      WHERE d.dentist_id = ?
      AND u.role_id = 2`,
      [dentistId]
    );

    if (dentistResult.length === 0) {
      return null;
    }

    return dentistResult[0];
  }

  /**
   * ดึงรายการ slots ที่ว่างในอนาคต (7 วัน)
   * @param {number} dentistId
   * @returns {Promise<Array>}
   */
  static async getUpcomingAvailableSlots(dentistId) {
    const [upcomingSlots] = await db.execute(
      `SELECT
        ds.schedule_date,
        ds.hour,
        TIME_FORMAT(ds.start_time, '%H:%i') as start_time,
        TIME_FORMAT(ds.end_time, '%H:%i') as end_time,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM queue q
            JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
            WHERE qd.dentist_id = ds.dentist_id
            AND DATE(q.time) = ds.schedule_date
            AND HOUR(q.time) = ds.hour
            AND q.queue_status IN ('pending', 'confirm')
          ) THEN 'booked'
          ELSE 'available'
        END as status
      FROM dentist_schedule ds
      WHERE ds.dentist_id = ?
      AND ds.schedule_date >= CURDATE()
      AND ds.schedule_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
      AND ds.status = 'working'
      ORDER BY ds.schedule_date, ds.hour
      LIMIT 20`,
      [dentistId]
    );

    return upcomingSlots;
  }

  /**
   * ดึง availability ของทันตแพทย์ในช่วงเวลาที่กำหนด
   * @param {number} dentistId
   * @param {string} startDate - 'YYYY-MM-DD'
   * @param {string} endDate - 'YYYY-MM-DD'
   * @returns {Promise<Array>}
   */
  static async getAvailability(dentistId, startDate, endDate) {
    const [availability] = await db.execute(
      `SELECT
        ds.schedule_date,
        ds.hour,
        TIME_FORMAT(ds.start_time, '%H:%i') as start_time,
        TIME_FORMAT(ds.end_time, '%H:%i') as end_time,
        CONCAT(
          TIME_FORMAT(ds.start_time, '%H:%i'), ' - ',
          TIME_FORMAT(ds.end_time, '%H:%i')
        ) as time_display
      FROM dentist_schedule ds
      WHERE ds.dentist_id = ?
      AND ds.schedule_date BETWEEN ? AND ?
      AND ds.status = 'working'
      AND NOT EXISTS (
        SELECT 1 FROM queue q
        JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
        WHERE qd.dentist_id = ds.dentist_id
        AND DATE(q.time) = ds.schedule_date
        AND HOUR(q.time) = ds.hour
        AND q.queue_status IN ('pending', 'confirm')
      )
      ORDER BY ds.schedule_date, ds.hour`,
      [dentistId, startDate, endDate]
    );

    return availability;
  }

  /**
   * ดึงรายการทันตแพทย์ที่มี schedule (สำหรับ booking form เก่า)
   * @returns {Promise<Array>}
   */
  static async findAllWithSchedules() {
    const [dentists] = await db.execute(
      `SELECT DISTINCT d.*, CONCAT(d.fname, ' ', d.lname) as full_name
       FROM dentist d
       JOIN dentist_schedule ds ON d.dentist_id = ds.dentist_id
       WHERE d.user_id IS NOT NULL
       AND ds.schedule_date >= CURDATE()
       AND ds.status = 'working'
       ORDER BY d.fname`
    );
    return dentists;
  }
}

module.exports = DentistModel;
