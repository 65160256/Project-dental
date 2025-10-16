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
   * ดึงข้อมูลสถิติการนัดหมายแบบละเอียดสำหรับ admin dashboard
   * @param {Object} filters - ตัวกรองข้อมูล
   * @returns {Object} สถิติการนัดหมายแบบละเอียด
   */
  static async getDetailedAppointmentStatistics(filters = {}) {
    try {
      const { start_date, end_date } = filters;
      const startDate = start_date || new Date().toISOString().split('T')[0];
      const endDate = end_date || new Date().toISOString().split('T')[0];

      // Get total appointments by status
      const [statusStats] = await db.execute(`
        SELECT 
          queue_status,
          COUNT(*) as count,
          ROUND((COUNT(*) * 100.0 / (SELECT COUNT(*) FROM queue WHERE DATE(time) BETWEEN ? AND ?)), 2) as percentage
        FROM queue 
        WHERE DATE(time) BETWEEN ? AND ?
        GROUP BY queue_status
      `, [startDate, endDate, startDate, endDate]);

      // Get daily appointment trends
      const [dailyTrends] = await db.execute(`
        SELECT 
          DATE(time) as date,
          COUNT(*) as total_appointments,
          COUNT(CASE WHEN queue_status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN queue_status = 'confirm' THEN 1 END) as confirmed,
          COUNT(CASE WHEN queue_status = 'cancel' THEN 1 END) as cancelled
        FROM queue 
        WHERE DATE(time) BETWEEN ? AND ?
        GROUP BY DATE(time)
        ORDER BY date
      `, [startDate, endDate]);

      // Get top treatments
      const [topTreatments] = await db.execute(`
        SELECT 
          t.treatment_name,
          COUNT(*) as booking_count,
          COUNT(CASE WHEN q.queue_status = 'confirm' THEN 1 END) as confirmed_count
        FROM queue q
        JOIN treatment t ON q.treatment_id = t.treatment_id
        WHERE DATE(q.time) BETWEEN ? AND ?
        GROUP BY t.treatment_id, t.treatment_name
        ORDER BY booking_count DESC
        LIMIT 10
      `, [startDate, endDate]);

      // Get dentist performance
      const [dentistStats] = await db.execute(`
        SELECT 
          d.fname,
          d.lname,
          COUNT(*) as total_appointments,
          COUNT(CASE WHEN q.queue_status = 'confirm' THEN 1 END) as confirmed_appointments,
          COUNT(CASE WHEN q.queue_status = 'completed' THEN 1 END) as completed_appointments,
          ROUND((COUNT(CASE WHEN q.queue_status = 'completed' THEN 1 END) * 100.0 / COUNT(*)), 2) as completion_rate
        FROM queue q
        JOIN dentist d ON q.dentist_id = d.dentist_id
        WHERE DATE(q.time) BETWEEN ? AND ?
        GROUP BY d.dentist_id, d.fname, d.lname
        ORDER BY total_appointments DESC
        LIMIT 10
      `, [startDate, endDate]);

      return {
        statusStats,
        dailyTrends,
        topTreatments,
        dentistStats
      };
    } catch (error) {
      console.error('Error getting detailed appointment statistics:', error);
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
          t.treatment_name as treatment_name,
          COUNT(*) as total_count,
          AVG(t.duration) as avg_duration,
          SUM(CASE WHEN q.queue_status = 'completed' THEN 1 ELSE 0 END) as completed_count
        FROM queuedetail qd
        JOIN treatment t ON qd.treatment_id = t.treatment_id
        JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
        ${whereClause}
        GROUP BY t.treatment_id, t.treatment_name
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
          HOUR(q.time) as hour,
          COUNT(*) as total_appointments,
          SUM(CASE WHEN q.queue_status = 'completed' THEN 1 ELSE 0 END) as completed_count
        FROM queuedetail qd
        JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
        WHERE DATE(qd.date) = ?
        GROUP BY HOUR(q.time)
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
          t.treatment_name as treatment_name,
          t.duration,
          COUNT(*) as total_count,
          COUNT(DISTINCT qd.patient_id) as unique_patients,
          COUNT(DISTINCT qd.dentist_id) as unique_dentists
        FROM queuedetail qd
        JOIN treatment t ON qd.treatment_id = t.treatment_id
        JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
        ${whereClause}
        GROUP BY t.treatment_id, t.treatment_name, t.duration
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
          HOUR(q.time) as hour,
          COUNT(*) as appointment_count,
          SUM(CASE WHEN q.queue_status = 'completed' THEN 1 ELSE 0 END) as completed_count
        FROM queuedetail qd
        JOIN queue q ON q.queuedetail_id = qd.queuedetail_id
        WHERE DATE(qd.date) BETWEEN ? AND ?
        GROUP BY DATE(qd.date), HOUR(q.time)
        ORDER BY date, hour
      `, [startDate, endDate]);

      return stats;
    } catch (error) {
      console.error('Error getting time-based stats:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลสถิติการนัดหมายสำหรับ API
   * @param {Object} params - พารามิเตอร์การค้นหา
   * @returns {Object} ผลลัพธ์การค้นหา
   */
  static async getAppointmentStatsAPI(params) {
    try {
      const { period = 'month', status } = params;
      
      let dateFilter = '';
      let queryParams = [];
      
      if (period === 'today') {
        dateFilter = 'DATE(time) = CURDATE()';
      } else if (period === 'week') {
        dateFilter = 'DATE(time) BETWEEN DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND CURDATE()';
      } else if (period === 'month') {
        dateFilter = 'MONTH(time) = MONTH(CURDATE()) AND YEAR(time) = YEAR(CURDATE())';
      }
      
      let statusFilter = '';
      if (status && status !== 'all') {
        statusFilter = 'AND queue_status = ?';
        queryParams.push(status);
      }

      const [appointments] = await db.execute(`
        SELECT 
          q.queue_id,
          q.time,
          q.queue_status,
          CONCAT(p.fname, ' ', p.lname) as patient_name,
          CONCAT(d.fname, ' ', d.lname) as dentist_name,
          t.treatment_name
        FROM queue q
        JOIN patient p ON q.patient_id = p.patient_id
        JOIN dentist d ON q.dentist_id = d.dentist_id
        JOIN treatment t ON q.treatment_id = t.treatment_id
        WHERE ${dateFilter} ${statusFilter}
        ORDER BY q.time DESC
      `, queryParams);

      return {
        appointments,
        total: appointments.length
      };
    } catch (error) {
      console.error('Error getting appointment stats API:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลสถิติการรักษาสำหรับ API
   * @param {Object} params - พารามิเตอร์การค้นหา
   * @returns {Object} ผลลัพธ์การค้นหา
   */
  static async getTreatmentStatsAPI(params) {
    try {
      const { period = 'month' } = params;
      
      let dateFilter = '';
      if (period === 'today') {
        dateFilter = 'AND DATE(q.time) = CURDATE()';
      } else if (period === 'week') {
        dateFilter = 'AND DATE(q.time) BETWEEN DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND CURDATE()';
      } else if (period === 'month') {
        dateFilter = 'AND MONTH(q.time) = MONTH(CURDATE()) AND YEAR(q.time) = YEAR(CURDATE())';
      } else if (period === 'year') {
        dateFilter = 'AND YEAR(q.time) = YEAR(CURDATE())';
      }

      const [treatmentStats] = await db.execute(`
        SELECT 
          t.treatment_name,
          COUNT(q.queue_id) as count,
          COUNT(CASE WHEN q.queue_status = 'confirm' THEN 1 END) as confirmed_count
        FROM treatment t
        LEFT JOIN queue q ON t.treatment_id = q.treatment_id ${dateFilter}
        GROUP BY t.treatment_id, t.treatment_name
        HAVING count > 0
        ORDER BY count DESC
        LIMIT 10
      `);

      return {
        treatments: treatmentStats
      };
    } catch (error) {
      console.error('Error getting treatment stats API:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลปฏิทินสำหรับผู้ดูแลระบบ
   * @param {Object} params - { year, month, treatment_id }
   * @returns {Object} { calendarData }
   */
  static async getCalendarDataForAdmin(params) {
    try {
      const { year, month, treatment_id } = params;

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

      if (treatment_id) {
        mainQuery += ` AND EXISTS (
          SELECT 1 FROM dentist_treatment dt 
          WHERE dt.dentist_id = d.dentist_id 
          AND dt.treatment_id = ?
        )`;
        queryParams.push(treatment_id);
      }

      mainQuery += `
        GROUP BY s.date, d.dentist_id, d.fname, d.lname, d.specialty, d.photo
        HAVING dentist_available_slots > 0
        ORDER BY s.date, d.fname, d.lname
      `;

      const [rawData] = await db.execute(mainQuery, queryParams);

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

      const calendarData = Object.values(groupedByDate);

      return { calendarData };
    } catch (error) {
      console.error('Error getting calendar data for admin:', error);
      throw error;
    }
  }

  /**
   * ดึงข้อมูลแดชบอร์ดรายงาน
   * @returns {Object} ข้อมูลแดชบอร์ด
   */
  static async getReportsDashboardData() {
    try {
      const today = new Date();
      const currentMonth = today.getMonth() + 1;
      const currentYear = today.getFullYear();
      const firstDayOfMonth = new Date(currentYear, currentMonth - 1, 1);
      const lastDayOfMonth = new Date(currentYear, currentMonth, 0);

      // 1. นับจำนวนผู้ป่วยทั้งหมด
      const [totalPatientsResult] = await db.execute(`
        SELECT COUNT(*) as total_patients FROM patient
      `);
      const totalPatients = totalPatientsResult[0].total_patients;

      // 2. สถิติการนัดหมายตามสถานะ
      const [appointmentStats] = await db.execute(`
        SELECT 
          queue_status,
          COUNT(*) as count
        FROM queue 
        WHERE DATE(time) BETWEEN ? AND ?
        GROUP BY queue_status
      `, [firstDayOfMonth.toISOString().split('T')[0], lastDayOfMonth.toISOString().split('T')[0]]);

      const appointmentSummary = {
        confirmed: 0,
        pending: 0,
        cancelled: 0,
        completed: 0,
        total: 0
      };

      appointmentStats.forEach(stat => {
        if (stat.queue_status === 'confirm') {
          appointmentSummary.confirmed = stat.count;
        } else if (stat.queue_status === 'pending') {
          appointmentSummary.pending = stat.count;
        } else if (stat.queue_status === 'cancel') {
          appointmentSummary.cancelled = stat.count;
        } else if (stat.queue_status === 'completed') {
          appointmentSummary.completed = stat.count;
        }
        appointmentSummary.total += stat.count;
      });

      // คำนวณ completion rate
      appointmentSummary.completionRate = appointmentSummary.total > 0 
        ? Math.round((appointmentSummary.completed / appointmentSummary.total) * 100) 
        : 0;

      // 3. สถิติการรักษา
      const [treatmentStats] = await db.execute(`
        SELECT 
          t.treatment_name,
          COUNT(q.queue_id) as count
        FROM treatment t
        LEFT JOIN queue q ON t.treatment_id = q.treatment_id 
          AND DATE(q.time) BETWEEN ? AND ?
        GROUP BY t.treatment_id, t.treatment_name
        ORDER BY count DESC
        LIMIT 10
      `, [firstDayOfMonth.toISOString().split('T')[0], lastDayOfMonth.toISOString().split('T')[0]]);

      // 4. สถิติผู้ป่วยต่อทันตแพทย์
      const [doctorStats] = await db.execute(`
        SELECT 
          d.dentist_id,
          CONCAT(d.fname, ' ', d.lname) as doctor_name,
          d.specialty,
          COUNT(DISTINCT q.patient_id) as unique_patients,
          COUNT(q.queue_id) as total_appointments
        FROM dentist d
        LEFT JOIN queue q ON d.dentist_id = q.dentist_id 
          AND DATE(q.time) BETWEEN ? AND ?
        GROUP BY d.dentist_id, d.fname, d.lname, d.specialty
        ORDER BY total_appointments DESC
      `, [firstDayOfMonth.toISOString().split('T')[0], lastDayOfMonth.toISOString().split('T')[0]]);

      // 5. ทันตแพทย์ที่ทำงานวันนี้
      const [todaysDoctors] = await db.execute(`
        SELECT DISTINCT
          d.dentist_id,
          d.fname,
          d.lname,
          d.specialty,
          d.photo
        FROM dentist d
        JOIN dentist_schedule ds ON d.dentist_id = ds.dentist_id
        WHERE ds.schedule_date = CURDATE() AND ds.status = 'working'
        ORDER BY d.fname, d.lname
      `);

      // 6. การนัดหมายที่จะมาถึงใน 7 วันข้างหน้า
      const nextWeek = new Date();
      nextWeek.setDate(today.getDate() + 7);
      
      const [upcomingAppointments] = await db.execute(`
        SELECT 
          q.queue_id,
          q.time,
          q.queue_status,
          CONCAT(p.fname, ' ', p.lname) as patient_name,
          CONCAT(d.fname, ' ', d.lname) as doctor_name,
          t.treatment_name
        FROM queue q
        JOIN patient p ON q.patient_id = p.patient_id
        JOIN dentist d ON q.dentist_id = d.dentist_id
        JOIN treatment t ON q.treatment_id = t.treatment_id
        WHERE DATE(q.time) BETWEEN CURDATE() AND ?
          AND q.queue_status IN ('pending', 'confirm')
        ORDER BY q.time ASC
        LIMIT 10
      `, [nextWeek.toISOString().split('T')[0]]);

      // 7. ข้อมูลแนวโน้มรายเดือน
      const [monthlyTrends] = await db.execute(`
        SELECT 
          DATE(time) as appointment_date,
          COUNT(*) as daily_count
        FROM queue
        WHERE DATE(time) BETWEEN ? AND ?
        GROUP BY DATE(time)
        ORDER BY appointment_date
      `, [firstDayOfMonth.toISOString().split('T')[0], lastDayOfMonth.toISOString().split('T')[0]]);

      return {
        totalPatients,
        appointmentSummary,
        treatmentStats,
        doctorStats,
        todaysDoctors,
        upcomingAppointments,
        monthlyTrends,
        currentMonth: today.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })
      };
    } catch (error) {
      console.error('Error getting reports dashboard data:', error);
      throw error;
    }
  }
}

module.exports = ReportAdminModel;

