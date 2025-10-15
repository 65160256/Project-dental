const db = require('../config/db');

/**
 * DentistTreatment Model
 * จัดการความสัมพันธ์ระหว่างทันตแพทย์และการรักษา (many-to-many relationship)
 */
class DentistTreatmentModel {
  /**
   * เพิ่มความสัมพันธ์ระหว่างทันตแพทย์และการรักษา
   * @param {number} dentistId
   * @param {number} treatmentId
   * @returns {Promise<Object>} { success }
   */
  static async create(dentistId, treatmentId) {
    // Validate required fields
    if (!dentistId || !treatmentId) {
      throw new Error('กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน (dentistId, treatmentId)');
    }

    // Check if relationship already exists
    const existing = await this.exists(dentistId, treatmentId);
    if (existing) {
      throw new Error('ความสัมพันธ์นี้มีอยู่ในระบบแล้ว');
    }

    // Verify dentist exists
    const [dentistCheck] = await db.execute(
      `SELECT dentist_id FROM dentist WHERE dentist_id = ?`,
      [dentistId]
    );

    if (dentistCheck.length === 0) {
      throw new Error('ไม่พบข้อมูลทันตแพทย์');
    }

    // Verify treatment exists
    const [treatmentCheck] = await db.execute(
      `SELECT treatment_id FROM treatment WHERE treatment_id = ?`,
      [treatmentId]
    );

    if (treatmentCheck.length === 0) {
      throw new Error('ไม่พบข้อมูลการรักษา');
    }

    const [result] = await db.execute(
      `INSERT INTO dentist_treatment (dentist_id, treatment_id)
       VALUES (?, ?)`,
      [dentistId, treatmentId]
    );

    return {
      success: true,
      insertId: result.insertId
    };
  }

  /**
   * ตรวจสอบว่าความสัมพันธ์มีอยู่หรือไม่
   * @param {number} dentistId
   * @param {number} treatmentId
   * @returns {Promise<boolean>}
   */
  static async exists(dentistId, treatmentId) {
    const [rows] = await db.execute(
      `SELECT COUNT(*) as count
       FROM dentist_treatment
       WHERE dentist_id = ? AND treatment_id = ?`,
      [dentistId, treatmentId]
    );

    return rows[0].count > 0;
  }

  /**
   * ดึงรายการการรักษาทั้งหมดของทันตแพทย์
   * @param {number} dentistId
   * @returns {Promise<Array>}
   */
  static async findByDentistId(dentistId) {
    const [rows] = await db.execute(
      `SELECT
        t.treatment_id,
        t.treatment_name,
        t.description,
        t.duration,
        t.price
       FROM dentist_treatment dt
       JOIN treatment t ON dt.treatment_id = t.treatment_id
       WHERE dt.dentist_id = ?
       ORDER BY t.treatment_name`,
      [dentistId]
    );

    return rows;
  }

  /**
   * ดึงรายการทันตแพทย์ทั้งหมดที่ทำการรักษานี้ได้
   * @param {number} treatmentId
   * @returns {Promise<Array>}
   */
  static async findByTreatmentId(treatmentId) {
    const [rows] = await db.execute(
      `SELECT
        d.dentist_id,
        d.fname,
        d.lname,
        d.specialty,
        d.license_number
       FROM dentist_treatment dt
       JOIN dentist d ON dt.dentist_id = d.dentist_id
       WHERE dt.treatment_id = ?
       ORDER BY d.fname, d.lname`,
      [treatmentId]
    );

    return rows;
  }

  /**
   * ลบความสัมพันธ์ระหว่างทันตแพทย์และการรักษา
   * @param {number} dentistId
   * @param {number} treatmentId
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async delete(dentistId, treatmentId) {
    const [result] = await db.execute(
      `DELETE FROM dentist_treatment
       WHERE dentist_id = ? AND treatment_id = ?`,
      [dentistId, treatmentId]
    );

    return {
      success: result.affectedRows > 0,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ลบความสัมพันธ์ทั้งหมดของทันตแพทย์
   * @param {number} dentistId
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async deleteAllByDentist(dentistId) {
    const [result] = await db.execute(
      `DELETE FROM dentist_treatment WHERE dentist_id = ?`,
      [dentistId]
    );

    return {
      success: true,
      affectedRows: result.affectedRows
    };
  }

  /**
   * ลบความสัมพันธ์ทั้งหมดของการรักษา
   * @param {number} treatmentId
   * @returns {Promise<Object>} { success, affectedRows }
   */
  static async deleteAllByTreatment(treatmentId) {
    const [result] = await db.execute(
      `DELETE FROM dentist_treatment WHERE treatment_id = ?`,
      [treatmentId]
    );

    return {
      success: true,
      affectedRows: result.affectedRows
    };
  }

  /**
   * อัปเดตรายการการรักษาของทันตแพทย์ (ลบทั้งหมดแล้วเพิ่มใหม่)
   * @param {number} dentistId
   * @param {Array} treatmentIds - [1, 2, 3, ...]
   * @returns {Promise<Object>} { success, insertedCount }
   */
  static async updateDentistTreatments(dentistId, treatmentIds) {
    if (!Array.isArray(treatmentIds)) {
      throw new Error('treatmentIds ต้องเป็น Array');
    }

    // Start transaction
    await db.query('START TRANSACTION');

    try {
      // ลบความสัมพันธ์เก่าทั้งหมด
      await this.deleteAllByDentist(dentistId);

      // เพิ่มความสัมพันธ์ใหม่
      if (treatmentIds.length > 0) {
        const values = treatmentIds.map(treatmentId => [dentistId, treatmentId]);
        const placeholders = values.map(() => '(?, ?)').join(', ');
        const flatValues = values.flat();

        await db.execute(
          `INSERT INTO dentist_treatment (dentist_id, treatment_id)
           VALUES ${placeholders}`,
          flatValues
        );
      }

      await db.query('COMMIT');

      return {
        success: true,
        insertedCount: treatmentIds.length
      };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  }

  /**
   * เพิ่มความสัมพันธ์หลายรายการพร้อมกัน (bulk insert)
   * @param {Array} relationships - [{ dentistId, treatmentId }, ...]
   * @returns {Promise<Object>} { success, insertedCount }
   */
  static async createBulk(relationships) {
    if (!Array.isArray(relationships) || relationships.length === 0) {
      throw new Error('กรุณาระบุข้อมูลความสัมพันธ์');
    }

    const values = [];
    const params = [];

    for (const rel of relationships) {
      const { dentistId, treatmentId } = rel;

      if (!dentistId || !treatmentId) {
        throw new Error('ข้อมูลไม่ครบถ้วน');
      }

      values.push('(?, ?)');
      params.push(dentistId, treatmentId);
    }

    const query = `
      INSERT INTO dentist_treatment (dentist_id, treatment_id)
      VALUES ${values.join(', ')}
      ON DUPLICATE KEY UPDATE dentist_id = dentist_id
    `;

    const [result] = await db.execute(query, params);

    return {
      success: true,
      insertedCount: result.affectedRows
    };
  }

  /**
   * นับจำนวนความสัมพันธ์
   * @param {Object} filters - { dentistId, treatmentId }
   * @returns {Promise<number>}
   */
  static async count(filters = {}) {
    const { dentistId, treatmentId } = filters;

    let query = `SELECT COUNT(*) as total FROM dentist_treatment WHERE 1=1`;
    const params = [];

    if (dentistId) {
      query += ` AND dentist_id = ?`;
      params.push(dentistId);
    }

    if (treatmentId) {
      query += ` AND treatment_id = ?`;
      params.push(treatmentId);
    }

    const [rows] = await db.execute(query, params);
    return rows[0].total;
  }

  /**
   * ดึงทันตแพทย์ที่ทำการรักษาได้พร้อมตรวจสอบความพร้อม
   * @param {number} treatmentId
   * @param {string} date - 'YYYY-MM-DD' (optional)
   * @returns {Promise<Array>}
   */
  static async findAvailableDentistsByTreatment(treatmentId, date = null) {
    let query = `
      SELECT DISTINCT
        d.dentist_id,
        d.fname,
        d.lname,
        d.specialty,
        d.license_number
      FROM dentist_treatment dt
      JOIN dentist d ON dt.dentist_id = d.dentist_id
      WHERE dt.treatment_id = ?
    `;

    const params = [treatmentId];

    // ถ้ามีการระบุวันที่ ให้ตรวจสอบว่าทันตแพทย์มีตารางเวลาในวันนั้นหรือไม่
    if (date) {
      query += `
        AND EXISTS (
          SELECT 1 FROM dentist_schedule ds
          WHERE ds.dentist_id = d.dentist_id
            AND ds.schedule_date = ?
            AND ds.status = 'working'
        )
      `;
      params.push(date);
    }

    query += ` ORDER BY d.fname, d.lname`;

    const [rows] = await db.execute(query, params);
    return rows;
  }

  /**
   * ดึงข้อมูลสถิติการรักษาของทันตแพทย์
   * @param {number} dentistId
   * @returns {Promise<Array>} [ { treatmentName, count }, ... ]
   */
  static async getTreatmentStatsByDentist(dentistId) {
    const [rows] = await db.execute(
      `SELECT
        t.treatment_name,
        COUNT(q.queue_id) as count
       FROM dentist_treatment dt
       JOIN treatment t ON dt.treatment_id = t.treatment_id
       LEFT JOIN queue q ON q.dentist_id = dt.dentist_id
         AND q.treatment_id = dt.treatment_id
         AND q.queue_status = 'completed'
       WHERE dt.dentist_id = ?
       GROUP BY t.treatment_id, t.treatment_name
       ORDER BY count DESC`,
      [dentistId]
    );

    return rows;
  }

  /**
   * ดึงทันตแพทย์ที่แนะนำสำหรับการรักษานี้ (เรียงตามประสบการณ์)
   * @param {number} treatmentId
   * @param {number} limit - จำนวนสูงสุด (default = 5)
   * @returns {Promise<Array>}
   */
  static async findRecommendedDentists(treatmentId, limit = 5) {
    const [rows] = await db.execute(
      `SELECT
        d.dentist_id,
        d.fname,
        d.lname,
        d.specialty,
        COUNT(q.queue_id) as experience_count
       FROM dentist_treatment dt
       JOIN dentist d ON dt.dentist_id = d.dentist_id
       LEFT JOIN queue q ON q.dentist_id = d.dentist_id
         AND q.treatment_id = dt.treatment_id
         AND q.queue_status = 'completed'
       WHERE dt.treatment_id = ?
       GROUP BY d.dentist_id, d.fname, d.lname, d.specialty
       ORDER BY experience_count DESC, d.fname, d.lname
       LIMIT ?`,
      [treatmentId, limit]
    );

    return rows;
  }
}

module.exports = DentistTreatmentModel;
