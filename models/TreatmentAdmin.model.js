/**
 * Treatment Admin Model
 * 
 * จัดการข้อมูลและ business logic ที่เกี่ยวข้องกับการรักษาสำหรับ admin
 * - CRUD operations สำหรับการรักษา
 * - การจัดการการรักษาของทันตแพทย์
 * - การตรวจสอบข้อมูลซ้ำ
 */

const db = require('../config/db');

class TreatmentAdminModel {
  /**
   * ดึงรายการการรักษาทั้งหมด
   * @returns {Array} รายการการรักษา
   */
  static async getAllTreatments() {
    try {
      const [rows] = await db.execute(`
        SELECT 
          t.treatment_id,
          t.name,
          t.duration,
          t.description,
          COUNT(dt.dentist_id) as dentist_count
        FROM treatment t
        LEFT JOIN dentist_treatment dt ON t.treatment_id = dt.treatment_id
        GROUP BY t.treatment_id, t.name, t.duration, t.description
        ORDER BY t.name
      `);

      return rows;
    } catch (error) {
      console.error('Error getting all treatments:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลการรักษาตาม ID
   * @param {number} treatmentId - ID ของการรักษา
   * @returns {Object} ข้อมูลการรักษา
   */
  static async getTreatmentById(treatmentId) {
    try {
      const [rows] = await db.execute(`
        SELECT 
          t.*,
          GROUP_CONCAT(CONCAT(d.fname, ' ', d.lname) SEPARATOR ', ') as dentist_names,
          GROUP_CONCAT(d.dentist_id SEPARATOR ',') as dentist_ids
        FROM treatment t
        LEFT JOIN dentist_treatment dt ON t.treatment_id = dt.treatment_id
        LEFT JOIN dentist d ON dt.dentist_id = d.dentist_id
        WHERE t.treatment_id = ?
        GROUP BY t.treatment_id
      `, [treatmentId]);

      return rows[0] || null;
    } catch (error) {
      console.error('Error getting treatment by ID:', error);
      throw error;
    }
  }

  /**
   * สร้างการรักษาใหม่
   * @param {Object} treatmentData - ข้อมูลการรักษา
   * @returns {Object} ผลลัพธ์การสร้าง
   */
  static async createTreatment(treatmentData) {
    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();

      // สร้าง treatment record
      const [treatmentResult] = await connection.execute(`
        INSERT INTO treatment (name, duration, description)
        VALUES (?, ?, ?)
      `, [
        treatmentData.name,
        treatmentData.duration,
        treatmentData.description
      ]);

      const treatmentId = treatmentResult.insertId;

      // สร้าง dentist_treatment mapping
      if (treatmentData.dentist_ids && treatmentData.dentist_ids.length > 0) {
        for (const dentistId of treatmentData.dentist_ids) {
          await connection.execute(`
            INSERT INTO dentist_treatment (dentist_id, treatment_id)
            VALUES (?, ?)
          `, [dentistId, treatmentId]);
        }
      }

      await connection.commit();
      
      return {
        success: true,
        treatmentId: treatmentId,
        message: 'การรักษาถูกสร้างเรียบร้อยแล้ว'
      };

    } catch (error) {
      await connection.rollback();
      console.error('Error creating treatment:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * อัปเดตข้อมูลการรักษา
   * @param {number} treatmentId - ID ของการรักษา
   * @param {Object} updateData - ข้อมูลที่ต้องการอัปเดต
   * @returns {Object} ผลลัพธ์การอัปเดต
   */
  static async updateTreatment(treatmentId, updateData) {
    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();

      // อัปเดต treatment table
      await connection.execute(`
        UPDATE treatment SET
          name = ?, duration = ?, description = ?
        WHERE treatment_id = ?
      `, [
        updateData.name,
        updateData.duration,
        updateData.description,
        treatmentId
      ]);

      // ลบ dentist_treatment mapping เก่า
      await connection.execute(
        'DELETE FROM dentist_treatment WHERE treatment_id = ?',
        [treatmentId]
      );

      // สร้าง dentist_treatment mapping ใหม่
      if (updateData.dentist_ids && updateData.dentist_ids.length > 0) {
        for (const dentistId of updateData.dentist_ids) {
          await connection.execute(`
            INSERT INTO dentist_treatment (dentist_id, treatment_id)
            VALUES (?, ?)
          `, [dentistId, treatmentId]);
        }
      }

      await connection.commit();
      
      return {
        success: true,
        message: 'ข้อมูลการรักษาถูกอัปเดตเรียบร้อยแล้ว'
      };

    } catch (error) {
      await connection.rollback();
      console.error('Error updating treatment:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * ลบการรักษา
   * @param {number} treatmentId - ID ของการรักษา
   * @returns {Object} ผลลัพธ์การลบ
   */
  static async deleteTreatment(treatmentId) {
    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();

      // ตรวจสอบว่ามีการใช้งานการรักษานี้หรือไม่
      const [usageCheck] = await connection.execute(`
        SELECT COUNT(*) as count FROM queuedetail WHERE treatment_id = ?
      `, [treatmentId]);

      if (usageCheck[0].count > 0) {
        throw new Error('ไม่สามารถลบการรักษานี้ได้ เนื่องจากมีการใช้งานอยู่');
      }

      // ลบข้อมูลที่เกี่ยวข้อง
      await connection.execute(
        'DELETE FROM dentist_treatment WHERE treatment_id = ?',
        [treatmentId]
      );

      await connection.execute(
        'DELETE FROM treatment WHERE treatment_id = ?',
        [treatmentId]
      );

      await connection.commit();
      
      return {
        success: true,
        message: 'การรักษาถูกลบเรียบร้อยแล้ว'
      };

    } catch (error) {
      await connection.rollback();
      console.error('Error deleting treatment:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * ดึงรายการทันตแพทย์ที่สามารถทำการรักษาได้
   * @returns {Array} รายการทันตแพทย์
   */
  static async getAvailableDentists() {
    try {
      const [rows] = await db.execute(`
        SELECT 
          d.dentist_id,
          CONCAT(d.fname, ' ', d.lname) as name,
          d.specialty
        FROM dentist d
        ORDER BY d.fname, d.lname
      `);

      return rows;
    } catch (error) {
      console.error('Error getting available dentists:', error);
      throw error;
    }
  }

  /**
   * ดึงรายการการรักษาสำหรับ API
   * @returns {Array} รายการการรักษา
   */
  static async getTreatmentsForAPI() {
    try {
      const [rows] = await db.execute(`
        SELECT 
          t.treatment_id,
          t.name,
          t.duration,
          t.description,
          COUNT(dt.dentist_id) as dentist_count
        FROM treatment t
        LEFT JOIN dentist_treatment dt ON t.treatment_id = dt.treatment_id
        GROUP BY t.treatment_id, t.name, t.duration, t.description
        ORDER BY t.name
      `);

      return rows;
    } catch (error) {
      console.error('Error getting treatments for API:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลการรักษาตาม ID สำหรับ API
   * @param {number} treatmentId - ID ของการรักษา
   * @returns {Object} ข้อมูลการรักษา
   */
  static async getTreatmentByIdForAPI(treatmentId) {
    try {
      const [rows] = await db.execute(`
        SELECT 
          t.treatment_id,
          t.name,
          t.duration,
          t.description,
          GROUP_CONCAT(d.dentist_id SEPARATOR ',') as dentist_ids,
          GROUP_CONCAT(CONCAT(d.fname, ' ', d.lname) SEPARATOR ', ') as dentist_names
        FROM treatment t
        LEFT JOIN dentist_treatment dt ON t.treatment_id = dt.treatment_id
        LEFT JOIN dentist d ON dt.dentist_id = d.dentist_id
        WHERE t.treatment_id = ?
        GROUP BY t.treatment_id
      `, [treatmentId]);

      const treatment = rows[0];
      if (treatment && treatment.dentist_ids) {
        treatment.dentist_ids = treatment.dentist_ids.split(',').map(id => parseInt(id));
      }

      return treatment || null;
    } catch (error) {
      console.error('Error getting treatment by ID for API:', error);
      throw error;
    }
  }

  /**
   * ดึงรายการทันตแพทย์ที่สามารถทำการรักษาเฉพาะ
   * @param {number} treatmentId - ID ของการรักษา
   * @returns {Array} รายการทันตแพทย์
   */
  static async getDentistsForTreatment(treatmentId) {
    try {
      const [rows] = await db.execute(`
        SELECT 
          d.dentist_id,
          CONCAT(d.fname, ' ', d.lname) as name,
          d.specialty
        FROM dentist d
        JOIN dentist_treatment dt ON d.dentist_id = dt.dentist_id
        WHERE dt.treatment_id = ?
        ORDER BY d.fname, d.lname
      `, [treatmentId]);

      return rows;
    } catch (error) {
      console.error('Error getting dentists for treatment:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลการรักษาของทันตแพทย์
   * @param {number} dentistId - ID ของทันตแพทย์
   * @returns {Array} รายการการรักษา
   */
  static async getDentistTreatments(dentistId) {
    try {
      const [rows] = await db.execute(`
        SELECT 
          t.treatment_id,
          t.name,
          t.duration,
          t.description
        FROM treatment t
        JOIN dentist_treatment dt ON t.treatment_id = dt.treatment_id
        WHERE dt.dentist_id = ?
        ORDER BY t.name
      `, [dentistId]);

      return rows;
    } catch (error) {
      console.error('Error getting dentist treatments:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลการรักษาของทันตแพทย์สำหรับ API
   * @param {number} dentistId - ID ของทันตแพทย์
   * @returns {Array} รายการการรักษา
   */
  static async getDentistTreatmentsForAPI(dentistId) {
    try {
      const [rows] = await db.execute(`
        SELECT 
          t.treatment_id,
          t.name,
          t.duration,
          t.description
        FROM treatment t
        JOIN dentist_treatment dt ON t.treatment_id = dt.treatment_id
        WHERE dt.dentist_id = ?
        ORDER BY t.name
      `, [dentistId]);

      return rows;
    } catch (error) {
      console.error('Error getting dentist treatments for API:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลการรักษาของทันตแพทย์ทั้งหมด
   * @returns {Array} รายการการรักษาของทันตแพทย์
   */
  static async getDentistTreatmentMappings() {
    try {
      const [rows] = await db.execute(`
        SELECT 
          dt.dentist_id,
          CONCAT(d.fname, ' ', d.lname) as dentist_name,
          dt.treatment_id,
          t.name as treatment_name
        FROM dentist_treatment dt
        JOIN dentist d ON dt.dentist_id = d.dentist_id
        JOIN treatment t ON dt.treatment_id = t.treatment_id
        ORDER BY d.fname, d.lname, t.name
      `);

      return rows;
    } catch (error) {
      console.error('Error getting dentist treatment mappings:', error);
      throw error;
    }
  }
}

module.exports = TreatmentAdminModel;

