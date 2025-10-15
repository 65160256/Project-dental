const db = require('../config/db');

class PatientModel {
  /**
   * สร้างผู้ป่วยใหม่
   * @param {Object} patientData - ข้อมูลผู้ป่วย
   * @returns {Promise<Object>} { patientId, success }
   */
  static async create(patientData) {
    const {
      fname,
      lname,
      dob,
      gender,
      phone,
      address,
      id_card,
      chronic_disease,
      allergy_history,
      userId
    } = patientData;

    // Validate required fields
    if (!fname || !lname || !phone) {
      throw new Error('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน (ชื่อ, นามสกุล, เบอร์โทร)');
    }

    // Check for duplicate ID card if provided
    if (id_card) {
      const existing = await this.findByIdCard(id_card);
      if (existing) {
        throw new Error('เลขบัตรประชาชนนี้มีในระบบแล้ว');
      }
    }

    // Check for duplicate phone
    const existingPhone = await this.findByPhone(phone);
    if (existingPhone) {
      throw new Error('เบอร์โทรศัพท์นี้มีในระบบแล้ว');
    }

    const [result] = await db.execute(
      `INSERT INTO patient
       (fname, lname, dob, gender, phone, address, id_card, chronic_disease, allergy_history, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fname,
        lname,
        dob || null,
        gender || null,
        phone,
        address || null,
        id_card || null,
        chronic_disease || null,
        allergy_history || null,
        userId || null
      ]
    );

    return {
      patientId: result.insertId,
      success: true
    };
  }

  /**
   * ค้นหาผู้ป่วยด้วย ID
   * @param {number} patientId
   * @returns {Promise<Object|null>}
   */
  static async findById(patientId) {
    const [rows] = await db.execute(
      `SELECT * FROM patient WHERE patient_id = ?`,
      [patientId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ค้นหาผู้ป่วยด้วย user_id
   * @param {number} userId
   * @returns {Promise<Object|null>}
   */
  static async findByUserId(userId) {
    const [rows] = await db.execute(
      `SELECT * FROM patient WHERE user_id = ?`,
      [userId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ค้นหาผู้ป่วยด้วยเลขบัตรประชาชน
   * @param {string} idCard
   * @returns {Promise<Object|null>}
   */
  static async findByIdCard(idCard) {
    const [rows] = await db.execute(
      `SELECT * FROM patient WHERE id_card = ?`,
      [idCard]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ค้นหาผู้ป่วยด้วยเบอร์โทรศัพท์
   * @param {string} phone
   * @returns {Promise<Object|null>}
   */
  static async findByPhone(phone) {
    const [rows] = await db.execute(
      `SELECT * FROM patient WHERE phone = ?`,
      [phone]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ดึงรายการผู้ป่วยทั้งหมด (พร้อม pagination)
   * @param {Object} options - { limit, offset, search }
   * @returns {Promise<Array>}
   */
  static async findAll(options = {}) {
    const { limit = 50, offset = 0, search = '' } = options;

    let query = `
      SELECT
        p.*,
        TIMESTAMPDIFF(YEAR, p.dob, CURDATE()) as age
      FROM patient p
    `;

    const params = [];

    if (search) {
      query += ` WHERE
        p.fname LIKE ? OR
        p.lname LIKE ? OR
        p.phone LIKE ? OR
        p.id_card LIKE ?
      `;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    query += ` ORDER BY p.patient_id DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [rows] = await db.execute(query, params);
    return rows;
  }

  /**
   * นับจำนวนผู้ป่วยทั้งหมด
   * @param {string} search - คำค้นหา (optional)
   * @returns {Promise<number>}
   */
  static async count(search = '') {
    let query = `SELECT COUNT(*) as total FROM patient`;
    const params = [];

    if (search) {
      query += ` WHERE
        fname LIKE ? OR
        lname LIKE ? OR
        phone LIKE ? OR
        id_card LIKE ?
      `;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    const [rows] = await db.execute(query, params);
    return rows[0].total;
  }

  /**
   * อัปเดตข้อมูลผู้ป่วย
   * @param {number} patientId
   * @param {Object} updateData
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async update(patientId, updateData) {
    const {
      fname,
      lname,
      dob,
      gender,
      phone,
      address,
      id_card,
      chronic_disease,
      allergy_history
    } = updateData;

    // Validate required fields
    if (!fname || !lname || !phone) {
      throw new Error('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน');
    }

    // Check if patient exists
    const existing = await this.findById(patientId);
    if (!existing) {
      throw new Error('ไม่พบข้อมูลผู้ป่วย');
    }

    // Check for duplicate ID card (exclude current patient)
    if (id_card && id_card !== existing.id_card) {
      const duplicateIdCard = await this.findByIdCard(id_card);
      if (duplicateIdCard && duplicateIdCard.patient_id !== patientId) {
        throw new Error('เลขบัตรประชาชนนี้มีในระบบแล้ว');
      }
    }

    // Check for duplicate phone (exclude current patient)
    if (phone !== existing.phone) {
      const duplicatePhone = await this.findByPhone(phone);
      if (duplicatePhone && duplicatePhone.patient_id !== patientId) {
        throw new Error('เบอร์โทรศัพท์นี้มีในระบบแล้ว');
      }
    }

    const [result] = await db.execute(
      `UPDATE patient
       SET fname = ?, lname = ?, dob = ?, gender = ?,
           phone = ?, address = ?, id_card = ?,
           chronic_disease = ?, allergy_history = ?
       WHERE patient_id = ?`,
      [
        fname,
        lname,
        dob || null,
        gender || null,
        phone,
        address || null,
        id_card || null,
        chronic_disease || null,
        allergy_history || null,
        patientId
      ]
    );

    return {
      success: true,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ลบผู้ป่วย
   * @param {number} patientId
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async delete(patientId) {
    // Check if patient has appointments
    const [appointments] = await db.execute(
      `SELECT COUNT(*) as count FROM queue WHERE patient_id = ?`,
      [patientId]
    );

    if (appointments[0].count > 0) {
      throw new Error('ไม่สามารถลบผู้ป่วยที่มีประวัติการนัดหมายได้');
    }

    const [result] = await db.execute(
      `DELETE FROM patient WHERE patient_id = ?`,
      [patientId]
    );

    return {
      success: result.affectedRows > 0,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ดึงข้อมูลผู้ป่วยพร้อมข้อมูล user
   * @param {number} patientId
   * @returns {Promise<Object|null>}
   */
  static async findByIdWithUser(patientId) {
    const [rows] = await db.execute(
      `SELECT
        p.*,
        u.email,
        u.username,
        TIMESTAMPDIFF(YEAR, p.dob, CURDATE()) as age
       FROM patient p
       LEFT JOIN user u ON p.user_id = u.user_id
       WHERE p.patient_id = ?`,
      [patientId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ตรวจสอบว่าผู้ป่วยเคยรักษากับทันตแพทย์คนนี้หรือไม่
   * @param {number} patientId
   * @param {number} dentistId
   * @returns {Promise<boolean>}
   */
  static async hasVisitedDentist(patientId, dentistId) {
    const [rows] = await db.execute(
      `SELECT COUNT(*) as count
       FROM queue
       WHERE patient_id = ? AND dentist_id = ?`,
      [patientId, dentistId]
    );
    return rows[0].count > 0;
  }

  /**
   * ดึงข้อมูลผู้ป่วยพร้อมประวัติการรักษากับทันตแพทย์
   * @param {number} patientId
   * @param {number} dentistId
   * @returns {Promise<Object|null>}
   */
  static async findByIdWithTreatmentHistory(patientId, dentistId) {
    // ดึงข้อมูลผู้ป่วย
    const patient = await this.findByIdWithUser(patientId);
    if (!patient) {
      return null;
    }

    // ดึงประวัติการรักษา
    const [treatmentHistory] = await db.execute(
      `SELECT
        q.queue_id,
        q.time,
        q.queue_status,
        th.diagnosis,
        th.followUpdate,
        t.treatment_name,
        t.duration,
        d.fname as dentist_fname,
        d.lname as dentist_lname
      FROM queue q
      JOIN treatment t ON q.treatment_id = t.treatment_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      LEFT JOIN treatmentHistory th ON qd.queuedetail_id = th.queuedetail_id
      WHERE q.patient_id = ? AND q.dentist_id = ?
      ORDER BY q.time DESC`,
      [patientId, dentistId]
    );

    // คำนวณสถิติ
    const stats = {
      total: treatmentHistory.length,
      completed: treatmentHistory.filter(t =>
        t.queue_status === 'completed' || t.queue_status === 'confirm'
      ).length,
      pending: treatmentHistory.filter(t =>
        t.queue_status === 'pending'
      ).length,
      cancelled: treatmentHistory.filter(t =>
        t.queue_status === 'cancel'
      ).length
    };

    // จัดกลุ่มตามปี
    const treatmentsByYear = {};
    treatmentHistory.forEach(treatment => {
      const year = new Date(treatment.time).getFullYear();
      if (!treatmentsByYear[year]) {
        treatmentsByYear[year] = [];
      }
      treatmentsByYear[year].push(treatment);
    });

    return {
      patient,
      treatmentHistory,
      treatmentsByYear,
      stats
    };
  }

  /**
   * ดึงรายการผู้ป่วยทั้งหมดพร้อมสถิติการรักษา (สำหรับทันตแพทย์)
   * @param {number} dentistId - ID ของทันตแพทย์
   * @param {Object} options - { limit, offset }
   * @returns {Promise<Array>}
   */
  static async findAllWithStats(dentistId, options = {}) {
    const { limit = 100, offset = 0 } = options;

    // ใช้ query() แทน execute() และใส่ค่าโดยตรงเพื่อหลีกเลี่ยงปัญหา prepared statement
    const [patients] = await db.query(
      `SELECT
        p.patient_id,
        p.fname,
        p.lname,
        p.phone,
        p.dob,
        p.address,
        p.id_card,
        p.chronic_disease,
        p.allergy_history,
        p.created_at as patient_since,
        TIMESTAMPDIFF(YEAR, p.dob, CURDATE()) as age,
        COUNT(DISTINCT q_all.queue_id) as total_visits_all,
        COUNT(DISTINCT CASE WHEN q_my.dentist_id = ? THEN q_my.queue_id END) as my_visits,
        MAX(q_all.time) as last_visit_all,
        MAX(CASE WHEN q_my.dentist_id = ? THEN q_my.time END) as my_last_visit
      FROM patient p
      LEFT JOIN queue q_all ON p.patient_id = q_all.patient_id
      LEFT JOIN queue q_my ON p.patient_id = q_my.patient_id AND q_my.dentist_id = ?
      GROUP BY p.patient_id, p.fname, p.lname, p.phone, p.dob, p.address,
               p.id_card, p.chronic_disease, p.allergy_history, p.created_at
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?`,
      [dentistId, dentistId, dentistId, parseInt(limit), parseInt(offset)]
    );

    // คำนวณสถานะและข้อมูลเพิ่มเติม
    return patients.map(patient => {
      const isMyPatient = patient.my_visits > 0;
      const relevantLastVisit = isMyPatient ? patient.my_last_visit : patient.last_visit_all;
      const relevantVisits = isMyPatient ? patient.my_visits : patient.total_visits_all;

      // คำนวณสถานะ: active ถ้ามารักษาภายใน 90 วัน
      const isActive = relevantLastVisit &&
        (Date.now() - new Date(relevantLastVisit).getTime()) < (90 * 24 * 60 * 60 * 1000);

      return {
        patient_id: patient.patient_id,
        fname: patient.fname,
        lname: patient.lname,
        phone: patient.phone,
        dob: patient.dob,
        address: patient.address,
        id_card: patient.id_card,
        chronic_disease: patient.chronic_disease,
        allergy_history: patient.allergy_history,
        patient_since: patient.patient_since,
        age: patient.age,
        isMyPatient,
        total_visits: relevantVisits,
        last_visit: relevantLastVisit,
        status: isActive ? 'active' : 'inactive'
      };
    });
  }

  /**
   * ค้นหาผู้ป่วยตามชื่อหรือเบอร์โทรที่เคยรักษากับทันตแพทย์
   * @param {number} dentistId - ID ของทันตแพทย์
   * @param {string} searchQuery - คำค้นหา (ชื่อ, นามสกุล, หรือเบอร์โทร)
   * @param {number} limit - จำนวนผลลัพธ์สูงสุด (default = 10)
   * @returns {Promise<Array>}
   */
  static async searchByDentist(dentistId, searchQuery, limit = 10) {
    if (!searchQuery || searchQuery.trim() === '') {
      return [];
    }

    const searchPattern = `%${searchQuery}%`;

    const [patients] = await db.execute(
      `SELECT DISTINCT p.patient_id, p.fname, p.lname, p.phone
       FROM patient p
       JOIN queue q ON p.patient_id = q.patient_id
       WHERE q.dentist_id = ?
         AND (p.fname LIKE ? OR p.lname LIKE ? OR p.phone LIKE ?)
       LIMIT ?`,
      [dentistId, searchPattern, searchPattern, searchPattern, limit]
    );

    return patients;
  }

  /**
   * ค้นหาผู้ป่วยด้วยตัวกรอง (Search, Age, Visits, LastVisit, Sort)
   * @param {number} dentistId
   * @param {Object} filters - { q, age, visits, lastVisit, sort, page, limit }
   * @returns {Promise<Object>} { patients, pagination }
   */
  static async searchWithFilters(dentistId, filters = {}) {
    const {
      q: searchQuery,
      age,
      visits,
      lastVisit,
      sort,
      page = 1,
      limit = 10
    } = filters;

    // สร้าง WHERE clause
    let whereConditions = ['q.dentist_id = ?'];
    let queryParams = [dentistId];

    // ค้นหาตามชื่อหรือเบอร์โทร
    if (searchQuery) {
      whereConditions.push('(p.fname LIKE ? OR p.lname LIKE ? OR p.phone LIKE ?)');
      queryParams.push(`%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`);
    }

    // กรองตามอายุ
    if (age) {
      let ageCondition = '';
      switch (age) {
        case 'child':
          ageCondition = 'TIMESTAMPDIFF(YEAR, p.dob, CURDATE()) BETWEEN 0 AND 12';
          break;
        case 'teen':
          ageCondition = 'TIMESTAMPDIFF(YEAR, p.dob, CURDATE()) BETWEEN 13 AND 17';
          break;
        case 'adult':
          ageCondition = 'TIMESTAMPDIFF(YEAR, p.dob, CURDATE()) BETWEEN 18 AND 59';
          break;
        case 'senior':
          ageCondition = 'TIMESTAMPDIFF(YEAR, p.dob, CURDATE()) >= 60';
          break;
      }
      if (ageCondition) {
        whereConditions.push(ageCondition);
      }
    }

    // สร้าง ORDER BY clause
    let orderBy = 'MAX(q.time) DESC';
    switch (sort) {
      case 'name':
        orderBy = 'p.fname ASC, p.lname ASC';
        break;
      case 'visits':
        orderBy = 'COUNT(q.queue_id) DESC';
        break;
      case 'oldest':
        orderBy = 'MAX(q.time) ASC';
        break;
      case 'recent':
      default:
        orderBy = 'MAX(q.time) DESC';
        break;
    }

    // HAVING clause สำหรับกรองตามจำนวนการเยือน
    let havingConditions = [];
    if (visits) {
      switch (visits) {
        case 'new':
          havingConditions.push('COUNT(q.queue_id) BETWEEN 1 AND 2');
          break;
        case 'regular':
          havingConditions.push('COUNT(q.queue_id) BETWEEN 3 AND 10');
          break;
        case 'frequent':
          havingConditions.push('COUNT(q.queue_id) > 10');
          break;
      }
    }

    // กรองตามวันที่เข้ารักษาล่าสุด
    if (lastVisit) {
      let dateCondition = '';
      switch (lastVisit) {
        case 'week':
          dateCondition = 'MAX(q.time) >= DATE_SUB(CURDATE(), INTERVAL 1 WEEK)';
          break;
        case 'month':
          dateCondition = 'MAX(q.time) >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)';
          break;
        case 'quarter':
          dateCondition = 'MAX(q.time) >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)';
          break;
        case 'year':
          dateCondition = 'MAX(q.time) >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)';
          break;
      }
      if (dateCondition) {
        havingConditions.push(dateCondition);
      }
    }

    const offset = (page - 1) * limit;

    const query = `
      SELECT DISTINCT
        p.patient_id,
        p.fname,
        p.lname,
        p.phone,
        p.dob,
        p.address,
        COUNT(q.queue_id) as total_visits,
        MAX(q.time) as last_visit,
        TIMESTAMPDIFF(YEAR, p.dob, CURDATE()) as age
      FROM patient p
      JOIN queue q ON p.patient_id = q.patient_id
      WHERE ${whereConditions.join(' AND ')}
      GROUP BY p.patient_id, p.fname, p.lname, p.phone, p.dob, p.address
      ${havingConditions.length > 0 ? 'HAVING ' + havingConditions.join(' AND ') : ''}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `;

    queryParams.push(parseInt(limit), parseInt(offset));

    const [results] = await db.execute(query, queryParams);

    // นับจำนวนทั้งหมด
    const countQuery = `
      SELECT COUNT(DISTINCT p.patient_id) as total
      FROM patient p
      JOIN queue q ON p.patient_id = q.patient_id
      WHERE ${whereConditions.join(' AND ')}
      ${havingConditions.length > 0 ? 'GROUP BY p.patient_id HAVING ' + havingConditions.join(' AND ') : ''}
    `;

    const [countResult] = await db.execute(countQuery, queryParams.slice(0, -2));
    const totalCount = havingConditions.length > 0 ? countResult.length : countResult[0].total;

    return {
      patients: results,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    };
  }

  /**
   * ดึงข้อมูลผู้ป่วยทั้งหมดสำหรับ Export (CSV/JSON)
   * @param {number} dentistId
   * @returns {Promise<Array>}
   */
  static async findAllForExport(dentistId) {
    const [patients] = await db.execute(
      `SELECT
        p.patient_id,
        p.fname,
        p.lname,
        p.phone,
        p.dob,
        p.address,
        p.created_at,
        COUNT(q.queue_id) as total_visits,
        COUNT(CASE WHEN q.queue_status = 'confirm' THEN 1 END) as completed_visits,
        COUNT(CASE WHEN q.queue_status = 'cancel' THEN 1 END) as cancelled_visits,
        MAX(q.time) as last_visit,
        MIN(q.time) as first_visit,
        TIMESTAMPDIFF(YEAR, p.dob, CURDATE()) as age
      FROM patient p
      JOIN queue q ON p.patient_id = q.patient_id
      WHERE q.dentist_id = ?
      GROUP BY p.patient_id
      ORDER BY p.fname, p.lname`,
      [dentistId]
    );

    return patients;
  }

  /**
   * ค้นหาประวัติการรักษาของผู้ป่วยตามวันที่
   * @param {number} patientId
   * @param {number} dentistId
   * @param {string} date - วันที่ที่ต้องการค้นหา (optional)
   * @returns {Promise<Array>}
   */
  static async searchTreatmentsByDate(patientId, dentistId, date = null) {
    let query = `
      SELECT
        q.queue_id,
        q.time,
        q.queue_status,
        th.diagnosis,
        th.next_appointment,
        t.treatment_name,
        t.duration
      FROM queue q
      JOIN treatment t ON q.treatment_id = t.treatment_id
      LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      LEFT JOIN treatmentHistory th ON qd.queuedetail_id = th.queuedetail_id
      WHERE q.patient_id = ? AND q.dentist_id = ?
    `;

    const params = [patientId, dentistId];

    if (date) {
      query += ` AND DATE(q.time) = ?`;
      params.push(date);
    }

    query += ` ORDER BY q.time DESC`;

    const [treatments] = await db.execute(query, params);

    return treatments;
  }

  /**
   * ดึงข้อมูลผู้ป่วยพร้อมข้อมูลการจองล่าสุด (สำหรับเพิ่มประวัติ)
   * @param {number} patientId
   * @param {number} dentistId
   * @returns {Promise<Object|null>}
   */
  static async findByIdWithLatestAppointment(patientId, dentistId) {
    // ดึงข้อมูลผู้ป่วย
    const patient = await this.findById(patientId);
    if (!patient) {
      return null;
    }

    // ดึงการจองล่าสุดที่ยังไม่ได้บันทึกประวัติ
    const [latestAppointment] = await db.execute(
      `SELECT
        q.*,
        t.treatment_name,
        t.duration,
        p.fname,
        p.lname,
        p.phone,
        p.dob
      FROM queue q
      JOIN treatment t ON q.treatment_id = t.treatment_id
      JOIN patient p ON q.patient_id = p.patient_id
      WHERE q.patient_id = ?
        AND q.dentist_id = ?
        AND q.queue_status IN ('pending', 'confirm')
      ORDER BY q.time DESC
      LIMIT 1`,
      [patientId, dentistId]
    );

    if (latestAppointment.length === 0) {
      // หาการจองล่าสุดไม่ว่าสถานะ
      const [anyAppointment] = await db.execute(
        `SELECT
          q.*,
          t.treatment_name,
          t.duration,
          p.fname,
          p.lname,
          p.phone,
          p.dob
        FROM queue q
        JOIN treatment t ON q.treatment_id = t.treatment_id
        JOIN patient p ON q.patient_id = p.patient_id
        WHERE q.patient_id = ? AND q.dentist_id = ?
        ORDER BY q.time DESC
        LIMIT 1`,
        [patientId, dentistId]
      );

      return {
        patient,
        appointment: anyAppointment[0] || null,
        isCompleted: true
      };
    }

    return {
      patient,
      appointment: latestAppointment[0],
      isCompleted: false
    };
  }

  /**
   * ดึงข้อมูลการจองของผู้ป่วยที่รอบันทึกประวัติ
   * @param {number} patientId
   * @param {number} dentistId
   * @param {number} limit - จำนวนสูงสุด
   * @returns {Promise<Array>}
   */
  static async findPendingHistoryAppointments(patientId, dentistId, limit = 5) {
    const [appointments] = await db.execute(
      `SELECT
        q.queue_id,
        q.patient_id,
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
      WHERE q.patient_id = ?
        AND q.dentist_id = ?
        AND q.queue_status IN ('pending', 'confirm')
      ORDER BY q.time DESC
      LIMIT ?`,
      [patientId, dentistId, limit]
    );

    return appointments;
  }

  /**
   * ดึงข้อมูลผู้ป่วยสำหรับ Dashboard (พร้อมนัดหมายถัดไป, ประวัติล่าสุด)
   * @param {number} userId
   * @returns {Promise<Object|null>} { patient, nextAppointment, appointments, treatmentHistory, dentists, currentDate }
   */
  static async getDashboardData(userId) {
    // Get patient info
    const [patientRows] = await db.execute(
      'SELECT p.*, u.email FROM patient p JOIN user u ON p.user_id = u.user_id WHERE p.user_id = ?',
      [userId]
    );

    if (patientRows.length === 0) {
      return null;
    }

    const patient = patientRows[0];

    // Get next appointment
    const [nextAppointmentRows] = await db.execute(
      `SELECT q.queue_id, q.time, t.treatment_name AS treatment,
              CONCAT(d.fname, ' ', d.lname) AS dentist, q.queue_status
       FROM queue q
       JOIN treatment t ON q.treatment_id = t.treatment_id
       JOIN dentist d ON q.dentist_id = d.dentist_id
       WHERE q.patient_id = ? AND q.time > NOW() AND q.queue_status IN ('pending', 'confirm')
       ORDER BY q.time ASC LIMIT 1`,
      [patient.patient_id]
    );

    // Get appointments history
    const [appointmentsRows] = await db.execute(
      `SELECT q.time, CONCAT(p.fname, ' ', p.lname) AS name,
              t.treatment_name AS treatment, CONCAT(d.fname, ' ', d.lname) AS dentist,
              q.queue_status
       FROM queue q
       JOIN patient p ON q.patient_id = p.patient_id
       JOIN treatment t ON q.treatment_id = t.treatment_id
       JOIN dentist d ON q.dentist_id = d.dentist_id
       WHERE q.patient_id = ? ORDER BY q.time DESC LIMIT 5`,
      [patient.patient_id]
    );

    // Get treatment history
    const [treatmentHistoryRows] = await db.execute(
      `SELECT th.diagnosis, th.followUpdate, t.treatment_name AS treatment,
              CONCAT(d.fname, ' ', d.lname) AS dentist
       FROM treatmentHistory th
       JOIN queuedetail qd ON th.queuedetail_id = qd.queuedetail_id
       JOIN treatment t ON qd.treatment_id = t.treatment_id
       JOIN dentist d ON qd.dentist_id = d.dentist_id
       WHERE qd.patient_id = ?
       ORDER BY th.tmh_id DESC LIMIT 1`,
      [patient.patient_id]
    );

    // Get today's working dentists
    const [dentistsRows] = await db.execute(
      `SELECT DISTINCT
          CONCAT(d.fname, ' ', d.lname) AS name,
          d.photo,
          d.specialty
       FROM dentist d
       JOIN available_slots s ON d.dentist_id = s.dentist_id
       WHERE s.date = CURDATE()
       AND s.is_available = 1`
    );

    return {
      patient,
      nextAppointment: nextAppointmentRows[0] || null,
      recentAppointments: appointmentsRows, // เปลี่ยนจาก appointments เป็น recentAppointments
      latestTreatmentHistory: treatmentHistoryRows[0] || null, // เปลี่ยนจาก treatmentHistory เป็น latestTreatmentHistory
      todayDentists: dentistsRows, // เปลี่ยนจาก dentists เป็น todayDentists
      currentDate: new Date().toLocaleDateString('th-TH', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    };
  }

  /**
   * ดึงข้อมูล Profile ของผู้ป่วยสำหรับหน้า Profile
   * @param {number} userId
   * @returns {Promise<Object|null>}
   */
  static async getProfileData(userId) {
    const [patientRows] = await db.execute(
      `SELECT
        p.patient_id,
        p.fname,
        p.lname,
        p.dob,
        p.phone,
        p.address,
        p.id_card,
        p.gender,
        p.chronic_disease,
        p.allergy_history,
        u.email,
        u.last_login
       FROM patient p
       JOIN user u ON p.user_id = u.user_id
       WHERE p.user_id = ?`,
      [userId]
    );

    if (patientRows.length === 0) {
      return null;
    }

    const patient = patientRows[0];

    // Format the data
    const genderTh = patient.gender === 'male' ? 'ชาย'
                : patient.gender === 'female' ? 'หญิง'
                : patient.gender === 'other' ? 'อื่นๆ' : 'ยังไม่ระบุ';

    return {
      ...patient,
      dob_formatted: patient.dob ? new Date(patient.dob).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      }) : 'Not specified',
      last_login_formatted: patient.last_login ? new Date(patient.last_login).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      }) + ' - ' + new Date(patient.last_login).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit'
      }) + ' AM' : 'Never logged in',
      full_name: `${patient.fname} ${patient.lname}`,
      masked_password: '******',
      gender_th: genderTh,
      id_card_display: patient.id_card || 'Not specified'
    };
  }

  /**
   * อัปเดต Profile ผู้ป่วย (พร้อมอัปเดต user table)
   * @param {number} userId
   * @param {Object} profileData - { fname, lname, dob, id_card, address, phone, email, gender, chronic_disease, allergy_history }
   * @returns {Promise<Object>} { success }
   */
  static async updateProfileWithEmail(userId, profileData) {
    const {
      fname, lname, dob, id_card, address, phone, email,
      gender, chronic_disease, allergy_history
    } = profileData;

    // Validate required fields
    if (!fname || !lname || !email) {
      throw new Error('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน (ชื่อ, นามสกุล, อีเมล)');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('รูปแบบอีเมลไม่ถูกต้อง');
    }

    // Validate ID Card format (13 digits) if provided
    if (id_card && !/^\d{13}$/.test(id_card)) {
      throw new Error('เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก');
    }

    // Validate phone format (10 digits) if provided
    if (phone && !/^\d{10}$/.test(phone)) {
      throw new Error('เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก');
    }

    // Get patient ID
    const [patientRows] = await db.execute(
      'SELECT patient_id, id_card FROM patient WHERE user_id = ?',
      [userId]
    );

    if (patientRows.length === 0) {
      throw new Error('ไม่พบข้อมูลผู้ป่วย');
    }

    const patientId = patientRows[0].patient_id;
    const currentIdCard = patientRows[0].id_card;

    // Check if email is already used by another user
    const [emailCheck] = await db.execute(
      'SELECT user_id FROM user WHERE email = ? AND user_id != ?',
      [email, userId]
    );

    if (emailCheck.length > 0) {
      throw new Error('อีเมลนี้ถูกใช้งานแล้ว');
    }

    // Check if ID card is already used by another patient (only if changed)
    if (id_card && id_card !== currentIdCard) {
      const [idCardCheck] = await db.execute(
        'SELECT patient_id FROM patient WHERE id_card = ? AND patient_id != ?',
        [id_card, patientId]
      );

      if (idCardCheck.length > 0) {
        throw new Error('เลขบัตรประชาชนนี้ถูกใช้งานแล้ว');
      }
    }

    // Start transaction
    const connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      // Update user table
      await connection.execute(
        'UPDATE user SET email = ? WHERE user_id = ?',
        [email, userId]
      );

      // Update patient table
      await connection.execute(
        `UPDATE patient SET
         fname = ?, lname = ?, dob = ?, id_card = ?, address = ?, phone = ?,
         gender = ?, chronic_disease = ?, allergy_history = ?
         WHERE patient_id = ?`,
        [
          fname, lname, dob || null, id_card || null, address || null, phone || null,
          gender || null, chronic_disease || null, allergy_history || null, patientId
        ]
      );

      // Commit transaction
      await connection.commit();
      connection.release();

      return { success: true };
    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }
  }

  /**
   * ดึงข้อมูลผู้ป่วยพร้อมอีเมลสำหรับหน้าต่างๆ (simple query)
   * @param {number} userId
   * @returns {Promise<Object|null>}
   */
  static async findByUserIdWithEmail(userId) {
    const [rows] = await db.execute(
      'SELECT p.*, u.email FROM patient p JOIN user u ON p.user_id = u.user_id WHERE p.user_id = ?',
      [userId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ดึงข้อมูลผู้ป่วยสำหรับการจอง (GET /patient/appointment/new)
   * @param {number} userId
   * @returns {Promise<Object|null>}
   */
  static async findForBooking(userId) {
    return await this.findByUserIdWithEmail(userId);
  }

  /**
   * ดึงข้อมูล Profile พื้นฐานสำหรับ API
   * @param {number} userId
   * @returns {Promise<Object|null>} { fname, lname, phone, email }
   */
  static async getBasicProfile(userId) {
    const [rows] = await db.execute(
      'SELECT fname, lname, phone, email FROM patient p JOIN user u ON p.user_id = u.user_id WHERE p.user_id = ?',
      [userId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ดึงรายการนัดหมายทั้งหมดของผู้ป่วยพร้อมรายละเอียด
   * @param {number} patientId
   * @returns {Promise<Array>}
   */
  static async getAppointmentsWithDetails(patientId) {
    const [appointments] = await db.execute(
      `SELECT
        q.queue_id,
        q.time,
        q.queue_status,
        th.diagnosis,
        th.next_appointment,
        d.fname as dentist_fname,
        d.lname as dentist_lname,
        d.specialty,
        t.treatment_name,
        t.duration,
        CASE
          WHEN q.time > NOW() AND q.queue_status IN ('pending', 'confirm') THEN TRUE
          ELSE FALSE
        END as can_cancel,
        CASE
          WHEN q.time > DATE_ADD(NOW(), INTERVAL 2 HOUR) AND q.queue_status IN ('pending', 'confirm') THEN TRUE
          ELSE FALSE
        END as can_modify
      FROM queue q
      LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      LEFT JOIN treatmentHistory th ON qd.queuedetail_id = th.queuedetail_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      WHERE q.patient_id = ?
      ORDER BY q.time DESC`,
      [patientId]
    );
    return appointments;
  }

  /**
   * ดึงรายการนัดหมายที่กำลังจะมาถึงของผู้ป่วย
   * @param {number} patientId
   * @returns {Promise<Array>}
   */
  static async getUpcomingAppointments(patientId) {
    const [appointments] = await db.execute(
      `SELECT
        q.queue_id,
        q.time,
        q.queue_status,
        th.diagnosis as notes,
        CONCAT(d.fname, ' ', d.lname) as dentist_name,
        d.specialty as dentist_specialty,
        t.treatment_name,
        t.duration,
        CASE
          WHEN q.time > DATE_ADD(NOW(), INTERVAL 24 HOUR) AND q.queue_status IN ('pending', 'confirm') THEN TRUE
          ELSE FALSE
        END as can_cancel
      FROM queue q
      LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      LEFT JOIN treatmentHistory th ON qd.queuedetail_id = th.queuedetail_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      WHERE q.patient_id = ?
      AND q.time > NOW()
      AND q.queue_status IN ('pending', 'confirm')
      ORDER BY q.time ASC`,
      [patientId]
    );
    return appointments;
  }

  /**
   * ค้นหา patient_id จาก user_id (simple query)
   * @param {number} userId
   * @returns {Promise<number|null>}
   */
  static async findIdByUserId(userId) {
    const [rows] = await db.execute(
      `SELECT patient_id FROM patient WHERE user_id = ?`,
      [userId]
    );
    return rows.length > 0 ? rows[0].patient_id : null;
  }

  /**
   * ดึงข้อมูลผู้ป่วยสำหรับหน้า history (พร้อมข้อมูล user)
   * @param {number} userId
   * @returns {Promise<Object|null>}
   */
  static async findForHistoryPage(userId) {
    const [rows] = await db.execute(
      'SELECT p.*, u.email FROM patient p JOIN user u ON p.user_id = u.user_id WHERE p.user_id = ?',
      [userId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ดึงข้อมูลผู้ป่วยพร้อม id_card สำหรับหน้า change password
   * @param {number} userId
   * @returns {Promise<Object|null>}
   */
  static async findForChangePassword(userId) {
    const [rows] = await db.execute(
      `SELECT
        p.patient_id,
        p.fname,
        p.lname,
        u.email,
        u.last_login
       FROM patient p
       JOIN user u ON p.user_id = u.user_id
       WHERE p.user_id = ?`,
      [userId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ดึงข้อมูลผู้ป่วยสำหรับหน้า edit profile
   * @param {number} userId
   * @returns {Promise<Object|null>}
   */
  static async findForEditProfile(userId) {
    const [rows] = await db.execute(
      `SELECT
        p.patient_id,
        p.fname,
        p.lname,
        p.dob,
        p.phone,
        p.address,
        p.id_card,
        p.gender,
        p.chronic_disease,
        p.allergy_history,
        u.email,
        u.last_login
       FROM patient p
       JOIN user u ON p.user_id = u.user_id
       WHERE p.user_id = ?`,
      [userId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * ตรวจสอบว่ามีนัดหมายในวันเดียวกันหรือไม่
   * @param {number} patientId
   * @param {string} date - รูปแบบ YYYY-MM-DD
   * @returns {Promise<boolean>}
   */
  static async hasAppointmentOnDate(patientId, date) {
    const [rows] = await db.execute(
      `SELECT COUNT(*) as count
       FROM queue q
       WHERE q.patient_id = ?
       AND DATE(q.time) = ?
       AND q.queue_status IN ('pending', 'confirm')`,
      [patientId, date]
    );
    return rows[0].count > 0;
  }
}

module.exports = PatientModel;
