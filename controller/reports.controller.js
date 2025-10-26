const ReportAdminModel = require('../models/ReportAdmin.model');

class ReportsController {
  /**
   * ดึงสถิติการรักษา
   */
  static async getTreatmentStats(req, res) {
    try {
      const rows = await ReportAdminModel.getTreatmentStatsForAPI();

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
      const rows = await ReportAdminModel.getDoctorStatsForAPI();

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
      const data = await ReportAdminModel.getAppointmentStatsForAPI();

      res.json({
        success: true,
        data: data
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

      const rows = await ReportAdminModel.getCalendarAppointmentsForAPI(year, month);

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
      
      const rows = await ReportAdminModel.getRevenueStatsForAPI(period);

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
