const db = require('../config/db');

class ReportsController {
  /**
   * ดึงสถิติการรักษา
   */
  static async getTreatmentStats(req, res) {
    try {
      const [rows] = await db.execute(`
        SELECT 
          t.treatment_name,
          COUNT(q.queue_id) as count
        FROM treatment t
        LEFT JOIN queuedetail qd ON t.treatment_id = qd.treatment_id
        LEFT JOIN queue q ON qd.queuedetail_id = q.queuedetail_id
        WHERE q.queue_status IN ('confirm', 'waiting_for_treatment', 'completed')
        AND q.time >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
        GROUP BY t.treatment_id, t.treatment_name
        HAVING count > 0
        ORDER BY count DESC
        LIMIT 10
      `);

      // ถ้าไม่มีข้อมูลจริง ให้แสดงข้อมูลจำลอง
      if (rows.length === 0) {
        const mockData = [
          { treatment_name: 'การตรวจสุขภาพฟัน', count: 0 },
          { treatment_name: 'การทำความสะอาดฟัน', count: 0 },
          { treatment_name: 'การอุดฟัน', count: 0 },
          { treatment_name: 'การถอนฟัน', count: 0 },
          { treatment_name: 'การรักษารากฟัน', count: 0 }
        ];
        
        res.json({
          success: true,
          data: mockData
        });
        return;
      }

      res.json({
        success: true,
        data: rows
      });
    } catch (error) {
      console.error('Error getting treatment stats:', error);
      res.status(500).json({
        success: false,
        error: 'เกิดข้อผิดพลาดในการดึงข้อมูลสถิติการรักษา'
      });
    }
  }

  /**
   * ดึงสถิติทันตแพทย์
   */
  static async getDoctorStats(req, res) {
    try {
      const [rows] = await db.execute(`
        SELECT 
          CONCAT(d.fname, ' ', d.lname) as dentist_name,
          COUNT(q.queue_id) as appointment_count
        FROM dentist d
        LEFT JOIN queuedetail qd ON d.dentist_id = qd.dentist_id
        LEFT JOIN queue q ON qd.queuedetail_id = q.queuedetail_id
        WHERE q.queue_status IN ('confirm', 'waiting_for_treatment', 'completed')
        AND q.time >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
        GROUP BY d.dentist_id, d.fname, d.lname
        HAVING appointment_count > 0
        ORDER BY appointment_count DESC
        LIMIT 10
      `);

      // ถ้าไม่มีข้อมูลจริง ให้แสดงข้อมูลจำลอง
      if (rows.length === 0) {
        const mockData = [
          { dentist_name: 'ไม่มีข้อมูลทันตแพทย์', appointment_count: 0 }
        ];
        
        res.json({
          success: true,
          data: mockData
        });
        return;
      }

      res.json({
        success: true,
        data: rows
      });
    } catch (error) {
      console.error('Error getting doctor stats:', error);
      res.status(500).json({
        success: false,
        error: 'เกิดข้อผิดพลาดในการดึงข้อมูลสถิติทันตแพทย์'
      });
    }
  }

  /**
   * ดึงสถิติการนัดหมาย
   */
  static async getAppointmentStats(req, res) {
    try {
      // ดึงสถิติรวม
      const [totalRows] = await db.execute(`
        SELECT COUNT(*) as total_appointments
        FROM queue
        WHERE queue_status IN ('pending', 'confirm', 'waiting_for_treatment', 'completed', 'cancel')
        AND time >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      `);

      const [completedRows] = await db.execute(`
        SELECT COUNT(*) as completed_appointments
        FROM queue
        WHERE queue_status = 'completed'
        AND time >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      `);

      const [pendingRows] = await db.execute(`
        SELECT COUNT(*) as pending_appointments
        FROM queue
        WHERE queue_status IN ('pending', 'confirm', 'waiting_for_treatment')
        AND time >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      `);

      const [cancelledRows] = await db.execute(`
        SELECT COUNT(*) as cancelled_appointments
        FROM queue
        WHERE queue_status = 'cancel'
        AND time >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      `);

      // ดึงสถิติรายเดือน
      const [monthlyRows] = await db.execute(`
        SELECT 
          DATE_FORMAT(time, '%Y-%m') as month,
          COUNT(*) as count
        FROM queue
        WHERE queue_status IN ('confirm', 'waiting_for_treatment', 'completed')
        AND time >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
        GROUP BY DATE_FORMAT(time, '%Y-%m')
        ORDER BY month DESC
        LIMIT 12
      `);

      res.json({
        success: true,
        data: {
          total_appointments: totalRows[0].total_appointments || 0,
          completed_appointments: completedRows[0].completed_appointments || 0,
          pending_appointments: pendingRows[0].pending_appointments || 0,
          cancelled_appointments: cancelledRows[0].cancelled_appointments || 0,
          monthly_stats: monthlyRows || []
        }
      });
    } catch (error) {
      console.error('Error getting appointment stats:', error);
      res.status(500).json({
        success: false,
        error: 'เกิดข้อผิดพลาดในการดึงข้อมูลสถิติการนัดหมาย'
      });
    }
  }

  /**
   * ดึงข้อมูลนัดหมายสำหรับปฏิทิน
   */
  static async getCalendarAppointments(req, res) {
    try {
      const { year, month } = req.query;
      
      if (!year || !month) {
        return res.status(400).json({
          success: false,
          error: 'กรุณาระบุปีและเดือน'
        });
      }

      const [rows] = await db.execute(`
        SELECT 
          q.queue_id,
          q.time,
          q.queue_status,
          CONCAT(p.fname, ' ', p.lname) as patient_name,
          t.treatment_name,
          CONCAT(d.fname, ' ', d.lname) as dentist_name
        FROM queue q
        JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
        JOIN patient p ON q.patient_id = p.patient_id
        JOIN treatment t ON qd.treatment_id = t.treatment_id
        JOIN dentist d ON qd.dentist_id = d.dentist_id
        WHERE YEAR(q.time) = ? AND MONTH(q.time) = ?
        AND q.queue_status IN ('confirm', 'waiting_for_treatment', 'completed')
        ORDER BY q.time ASC
      `, [year, month]);

      // ถ้าไม่มีข้อมูลจริง ให้แสดงข้อมูลจำลอง
      if (rows.length === 0) {
        const mockData = [
          {
            queue_id: 0,
            time: new Date().toISOString(),
            queue_status: 'pending',
            patient_name: 'ไม่มีข้อมูลนัดหมาย',
            treatment_name: 'ไม่มีข้อมูลการรักษา',
            dentist_name: 'ไม่มีข้อมูลทันตแพทย์'
          }
        ];
        
        res.json({
          success: true,
          data: mockData
        });
        return;
      }

      res.json({
        success: true,
        data: rows
      });
    } catch (error) {
      console.error('Error getting calendar appointments:', error);
      res.status(500).json({
        success: false,
        error: 'เกิดข้อผิดพลาดในการดึงข้อมูลนัดหมาย'
      });
    }
  }

  /**
   * ดึงสถิติรายได้
   */
  static async getRevenueStats(req, res) {
    try {
      const { period = 'month' } = req.query;
      
      let dateFilter = '';
      if (period === 'month') {
        dateFilter = 'AND q.time >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
      } else if (period === 'year') {
        dateFilter = 'AND q.time >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';
      }

      const [rows] = await db.execute(`
        SELECT 
          DATE_FORMAT(q.time, '%Y-%m') as period,
          COUNT(*) as appointment_count,
          SUM(t.price) as total_revenue
        FROM queue q
        JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
        JOIN treatment t ON qd.treatment_id = t.treatment_id
        WHERE q.queue_status = 'completed'
        ${dateFilter}
        GROUP BY DATE_FORMAT(q.time, '%Y-%m')
        ORDER BY period DESC
        LIMIT 12
      `);

      // ถ้าไม่มีข้อมูลจริง ให้แสดงข้อมูลจำลอง
      if (rows.length === 0) {
        const mockData = [
          {
            period: new Date().toISOString().substring(0, 7),
            appointment_count: 0,
            total_revenue: 0
          }
        ];
        
        res.json({
          success: true,
          data: mockData
        });
        return;
      }

      res.json({
        success: true,
        data: rows
      });
    } catch (error) {
      console.error('Error getting revenue stats:', error);
      res.status(500).json({
        success: false,
        error: 'เกิดข้อผิดพลาดในการดึงข้อมูลสถิติรายได้'
      });
    }
  }
}

module.exports = ReportsController;
