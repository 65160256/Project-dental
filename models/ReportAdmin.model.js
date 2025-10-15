/**
 * Report Admin Model
 * 
 * จัดการข้อมูลและ business logic ที่เกี่ยวข้องกับรายงานและสถิติสำหรับ admin
 * - สถิติการนัดหมาย
 * - สถิติการรักษา
 * - สถิติทันตแพทย์
 * - สถิติผู้ป่วย
 */

const db = require('../config/db');

class ReportAdminModel {
  /**
   * ดึงข้อมูลสถิติการนัดหมาย
   * @param {Object} filters - ตัวกรองข้อมูล
   * @returns {Object} สถิติการนัดหมาย
   */
  static async getAppointmentStats(filters = {}) {
    try {
      let whereClause = '';
      let params = [];

      if (filters.start_date && filters.end_date) {
        whereClause = 'WHERE DATE(qd.date) BETWEEN ? AND ?';
        params = [filters.start_date, filters.end_date];
      }

      const [stats] = await db.execute(`
        SELECT 
          COUNT(*) as total_appointments,
          SUM(CASE WHEN q.queue_status = 'pending' THEN 1 ELSE 0 END) as pending_count,
          SUM(CASE WHEN q.queue_status = 'confirm' THEN 1 ELSE 0 END) as confirmed_count,
          SUM(CASE WHEN q.queue_status = 'completed' THEN 1 ELSE 0 END) as completed_count,
          SUM(CASE WHEN q.queue_status = 'cancel' THEN 1 ELSE 0 END) as cancelled_count,
          AVG(CASE WHEN q.queue_status = 'completed' THEN 1 ELSE 0 END) * 100 as completion_rate
        FROM queuedetail qd
        JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
        ${whereClause}
      `, params);

      return stats[0] || {};
    } catch (error) {
      console.error('Error getting appointment stats:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลสถิติการรักษา
   * @param {Object} filters - ตัวกรองข้อมูล
   * @returns {Array} สถิติการรักษา
   */
  static async getTreatmentStats(filters = {}) {
    try {
      let whereClause = '';
      let params = [];

      if (filters.start_date && filters.end_date) {
        whereClause = 'WHERE DATE(qd.date) BETWEEN ? AND ?';
        params = [filters.start_date, filters.end_date];
      }

      const [stats] = await db.execute(`
        SELECT 
          t.treatment_id,
          t.name as treatment_name,
          COUNT(*) as total_count,
          AVG(t.duration) as avg_duration,
          SUM(CASE WHEN q.queue_status = 'completed' THEN 1 ELSE 0 END) as completed_count
        FROM queuedetail qd
        JOIN treatment t ON qd.treatment_id = t.treatment_id
        JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
        ${whereClause}
        GROUP BY t.treatment_id, t.name
        ORDER BY total_count DESC
      `, params);

      return stats;
    } catch (error) {
      console.error('Error getting treatment stats:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลสถิติทันตแพทย์
   * @param {Object} filters - ตัวกรองข้อมูล
   * @returns {Array} สถิติทันตแพทย์
   */
  static async getDentistStats(filters = {}) {
    try {
      let whereClause = '';
      let params = [];

      if (filters.start_date && filters.end_date) {
        whereClause = 'WHERE DATE(qd.date) BETWEEN ? AND ?';
        params = [filters.start_date, filters.end_date];
      }

      const [stats] = await db.execute(`
        SELECT 
          d.dentist_id,
          CONCAT(d.fname, ' ', d.lname) as dentist_name,
          d.specialty,
          COUNT(*) as total_appointments,
          SUM(CASE WHEN q.queue_status = 'completed' THEN 1 ELSE 0 END) as completed_appointments,
          AVG(CASE WHEN q.queue_status = 'completed' THEN 1 ELSE 0 END) * 100 as completion_rate
        FROM queuedetail qd
        JOIN dentist d ON qd.dentist_id = d.dentist_id
        JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
        ${whereClause}
        GROUP BY d.dentist_id, d.fname, d.lname, d.specialty
        ORDER BY total_appointments DESC
      `, params);

      return stats;
    } catch (error) {
      console.error('Error getting dentist stats:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลสถิติผู้ป่วย
   * @param {Object} filters - ตัวกรองข้อมูล
   * @returns {Array} สถิติผู้ป่วย
   */
  static async getPatientStats(filters = {}) {
    try {
      let whereClause = '';
      let params = [];

      if (filters.start_date && filters.end_date) {
        whereClause = 'WHERE DATE(qd.date) BETWEEN ? AND ?';
        params = [filters.start_date, filters.end_date];
      }

      const [stats] = await db.execute(`
        SELECT 
          p.patient_id,
          CONCAT(p.fname, ' ', p.lname) as patient_name,
          p.phone,
          COUNT(*) as total_appointments,
          MAX(qd.date) as last_appointment,
          MIN(qd.date) as first_appointment
        FROM queuedetail qd
        JOIN patient p ON qd.patient_id = p.patient_id
        JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
        ${whereClause}
        GROUP BY p.patient_id, p.fname, p.lname, p.phone
        ORDER BY total_appointments DESC
      `, params);

      return stats;
    } catch (error) {
      console.error('Error getting patient stats:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลสถิติรายเดือน
   * @param {number} year - ปี
   * @returns {Array} สถิติรายเดือน
   */
  static async getMonthlyStats(year) {
    try {
      const [stats] = await db.execute(`
        SELECT 
          MONTH(qd.date) as month,
          COUNT(*) as total_appointments,
          SUM(CASE WHEN q.queue_status = 'completed' THEN 1 ELSE 0 END) as completed_count,
          SUM(CASE WHEN q.queue_status = 'cancel' THEN 1 ELSE 0 END) as cancelled_count
        FROM queuedetail qd
        JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
        WHERE YEAR(qd.date) = ?
        GROUP BY MONTH(qd.date)
        ORDER BY month
      `, [year]);

      return stats;
    } catch (error) {
      console.error('Error getting monthly stats:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลสถิติรายวัน
   * @param {string} startDate - วันที่เริ่มต้น
   * @param {string} endDate - วันที่สิ้นสุด
   * @returns {Array} สถิติรายวัน
   */
  static async getDailyStats(startDate, endDate) {
    try {
      const [stats] = await db.execute(`
        SELECT 
          DATE(qd.date) as date,
          COUNT(*) as total_appointments,
          SUM(CASE WHEN q.queue_status = 'completed' THEN 1 ELSE 0 END) as completed_count,
          SUM(CASE WHEN q.queue_status = 'cancel' THEN 1 ELSE 0 END) as cancelled_count
        FROM queuedetail qd
        JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
        WHERE DATE(qd.date) BETWEEN ? AND ?
        GROUP BY DATE(qd.date)
        ORDER BY date
      `, [startDate, endDate]);

      return stats;
    } catch (error) {
      console.error('Error getting daily stats:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลสถิติรายชั่วโมง
   * @param {string} date - วันที่
   * @returns {Array} สถิติรายชั่วโมง
   */
  static async getHourlyStats(date) {
    try {
      const [stats] = await db.execute(`
        SELECT 
          HOUR(qd.time) as hour,
          COUNT(*) as total_appointments,
          SUM(CASE WHEN q.queue_status = 'completed' THEN 1 ELSE 0 END) as completed_count
        FROM queuedetail qd
        JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
        WHERE DATE(qd.date) = ?
        GROUP BY HOUR(qd.time)
        ORDER BY hour
      `, [date]);

      return stats;
    } catch (error) {
      console.error('Error getting hourly stats:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลสถิติการรักษาที่ได้รับความนิยม
   * @param {Object} filters - ตัวกรองข้อมูล
   * @returns {Array} สถิติการรักษาที่ได้รับความนิยม
   */
  static async getPopularTreatments(filters = {}) {
    try {
      let whereClause = '';
      let params = [];

      if (filters.start_date && filters.end_date) {
        whereClause = 'WHERE DATE(qd.date) BETWEEN ? AND ?';
        params = [filters.start_date, filters.end_date];
      }

      const [stats] = await db.execute(`
        SELECT 
          t.treatment_id,
          t.name as treatment_name,
          t.duration,
          COUNT(*) as total_count,
          COUNT(DISTINCT qd.patient_id) as unique_patients,
          COUNT(DISTINCT qd.dentist_id) as unique_dentists
        FROM queuedetail qd
        JOIN treatment t ON qd.treatment_id = t.treatment_id
        JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
        ${whereClause}
        GROUP BY t.treatment_id, t.name, t.duration
        ORDER BY total_count DESC
        LIMIT ?
      `, [...params, filters.limit || 10]);

      return stats;
    } catch (error) {
      console.error('Error getting popular treatments:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลสถิติการใช้งานระบบ
   * @param {Object} filters - ตัวกรองข้อมูล
   * @returns {Object} สถิติการใช้งานระบบ
   */
  static async getSystemUsageStats(filters = {}) {
    try {
      let whereClause = '';
      let params = [];

      if (filters.start_date && filters.end_date) {
        whereClause = 'WHERE DATE(qd.date) BETWEEN ? AND ?';
        params = [filters.start_date, filters.end_date];
      }

      const [stats] = await db.execute(`
        SELECT 
          COUNT(DISTINCT qd.patient_id) as active_patients,
          COUNT(DISTINCT qd.dentist_id) as active_dentists,
          COUNT(DISTINCT qd.treatment_id) as treatments_used,
          COUNT(*) as total_appointments,
          AVG(DATEDIFF(CURDATE(), p.created_at)) as avg_patient_age_days
        FROM queuedetail qd
        JOIN patient p ON qd.patient_id = p.patient_id
        JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
        ${whereClause}
      `, params);

      return stats[0] || {};
    } catch (error) {
      console.error('Error getting system usage stats:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลสถิติการยกเลิกนัดหมาย
   * @param {Object} filters - ตัวกรองข้อมูล
   * @returns {Array} สถิติการยกเลิกนัดหมาย
   */
  static async getCancellationStats(filters = {}) {
    try {
      let whereClause = '';
      let params = [];

      if (filters.start_date && filters.end_date) {
        whereClause = 'WHERE DATE(qd.date) BETWEEN ? AND ?';
        params = [filters.start_date, filters.end_date];
      }

      const [stats] = await db.execute(`
        SELECT 
          DATE(qd.date) as date,
          COUNT(*) as total_cancellations,
          COUNT(DISTINCT qd.patient_id) as unique_patients_cancelled,
          COUNT(DISTINCT qd.dentist_id) as unique_dentists_affected
        FROM queuedetail qd
        JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
        WHERE q.queue_status = 'cancel'
        ${whereClause}
        GROUP BY DATE(qd.date)
        ORDER BY date DESC
      `, params);

      return stats;
    } catch (error) {
      console.error('Error getting cancellation stats:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลสถิติประสิทธิภาพทันตแพทย์
   * @param {Object} filters - ตัวกรองข้อมูล
   * @returns {Array} สถิติประสิทธิภาพทันตแพทย์
   */
  static async getDentistPerformanceStats(filters = {}) {
    try {
      let whereClause = '';
      let params = [];

      if (filters.start_date && filters.end_date) {
        whereClause = 'WHERE DATE(qd.date) BETWEEN ? AND ?';
        params = [filters.start_date, filters.end_date];
      }

      const [stats] = await db.execute(`
        SELECT 
          d.dentist_id,
          CONCAT(d.fname, ' ', d.lname) as dentist_name,
          d.specialty,
          COUNT(*) as total_appointments,
          SUM(CASE WHEN q.queue_status = 'completed' THEN 1 ELSE 0 END) as completed_count,
          SUM(CASE WHEN q.queue_status = 'cancel' THEN 1 ELSE 0 END) as cancelled_count,
          AVG(CASE WHEN q.queue_status = 'completed' THEN 1 ELSE 0 END) * 100 as completion_rate,
          COUNT(DISTINCT qd.patient_id) as unique_patients,
          COUNT(DISTINCT qd.treatment_id) as treatments_offered
        FROM queuedetail qd
        JOIN dentist d ON qd.dentist_id = d.dentist_id
        JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
        ${whereClause}
        GROUP BY d.dentist_id, d.fname, d.lname, d.specialty
        ORDER BY completion_rate DESC, total_appointments DESC
      `, params);

      return stats;
    } catch (error) {
      console.error('Error getting dentist performance stats:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลสถิติการรักษาตามสาขาวิชาเฉพาะ
   * @param {Object} filters - ตัวกรองข้อมูล
   * @returns {Array} สถิติการรักษาตามสาขาวิชาเฉพาะ
   */
  static async getSpecialtyStats(filters = {}) {
    try {
      let whereClause = '';
      let params = [];

      if (filters.start_date && filters.end_date) {
        whereClause = 'WHERE DATE(qd.date) BETWEEN ? AND ?';
        params = [filters.start_date, filters.end_date];
      }

      const [stats] = await db.execute(`
        SELECT 
          d.specialty,
          COUNT(*) as total_appointments,
          COUNT(DISTINCT qd.patient_id) as unique_patients,
          COUNT(DISTINCT d.dentist_id) as dentists_count,
          AVG(t.duration) as avg_treatment_duration
        FROM queuedetail qd
        JOIN dentist d ON qd.dentist_id = d.dentist_id
        JOIN treatment t ON qd.treatment_id = t.treatment_id
        JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
        ${whereClause}
        GROUP BY d.specialty
        ORDER BY total_appointments DESC
      `, params);

      return stats;
    } catch (error) {
      console.error('Error getting specialty stats:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลสถิติการใช้งานระบบตามช่วงเวลา
   * @param {string} startDate - วันที่เริ่มต้น
   * @param {string} endDate - วันที่สิ้นสุด
   * @returns {Array} สถิติการใช้งานระบบตามช่วงเวลา
   */
  static async getTimeBasedStats(startDate, endDate) {
    try {
      const [stats] = await db.execute(`
        SELECT 
          DATE(qd.date) as date,
          HOUR(qd.time) as hour,
          COUNT(*) as appointment_count,
          SUM(CASE WHEN q.queue_status = 'completed' THEN 1 ELSE 0 END) as completed_count
        FROM queuedetail qd
        JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
        WHERE DATE(qd.date) BETWEEN ? AND ?
        GROUP BY DATE(qd.date), HOUR(qd.time)
        ORDER BY date, hour
      `, [startDate, endDate]);

      return stats;
    } catch (error) {
      console.error('Error getting time-based stats:', error);
      throw error;
    }
  }
}

module.exports = ReportAdminModel;

