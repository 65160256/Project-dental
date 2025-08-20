// controllers/dentist.controller.js
const db = require('../models/db');
const path = require('path');

// helper: แปลง Date เป็น 'YYYY-MM-DD' เพื่อเทียบค่าวันให้แม่น
const toYMD = (d) => {
  if (!d) return null;
  const dt = (d instanceof Date) ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const da = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
};

// helper: จัดรูปแบบวันที่สำหรับแสดงผล
const formatDate = (date) => {
  return new Date(date).toLocaleDateString('th-TH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

// helper: จัดรูปแบบเวลาสำหรับแสดงผล
const formatTime = (time) => {
  return new Date(`2000-01-01T${time}`).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
};

const dentistController = {
  // Dashboard หลัก
  getDashboard: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;

      const [dentistResult] = await db.execute(`
        SELECT d.*, u.email, u.username, u.last_login 
        FROM dentist d 
        JOIN user u ON d.user_id = u.user_id 
        WHERE d.user_id = ?
      `, [userId]);

      if (dentistResult.length === 0) {
        return res.redirect('/login');
      }

      const dentist = dentistResult[0];
      const dentistId = dentist.dentist_id;

      // 1) ผู้ป่วยวันนี้
      const [todayPatientsResult] = await db.execute(`
        SELECT COUNT(DISTINCT q.patient_id) as count
        FROM queue q
        WHERE q.dentist_id = ? 
          AND DATE(q.time) = CURDATE()
          AND q.queue_status IN ('pending', 'completed')
      `, [dentistId]);

      // 2) ผู้ป่วยทั้งหมด
      const [totalPatientsResult] = await db.execute(`
        SELECT COUNT(DISTINCT q.patient_id) as count
        FROM queue q
        WHERE q.dentist_id = ?
      `, [dentistId]);

      // 3) นัดหมายที่ยกเลิก
      const [cancelledResult] = await db.execute(`
        SELECT COUNT(*) as count
        FROM queue q
        WHERE q.dentist_id = ? 
          AND q.queue_status = 'cancel'
      `, [dentistId]);

      // 4) นัดหมายที่เสร็จสิ้น
      const [completedResult] = await db.execute(`
        SELECT COUNT(*) as count
        FROM queue q
        WHERE q.dentist_id = ? 
          AND q.queue_status = 'completed'
          AND q.time < NOW()
      `, [dentistId]);

      // 5) นัดหมายล่าสุด
      const [latestAppointments] = await db.execute(`
        SELECT 
          q.queue_id,
          q.time,
          q.queue_status,
          q.diagnosis,
          p.fname,
          p.lname,
          t.treatment_name,
          t.duration
        FROM queue q
        JOIN patient p ON q.patient_id = p.patient_id
        JOIN treatment t ON q.treatment_id = t.treatment_id
        WHERE q.dentist_id = ?
        ORDER BY q.time DESC
        LIMIT 10
      `, [dentistId]);

      // 6) นัดหมายที่กำลังจะมาถึง
      const [upcomingAppointments] = await db.execute(`
        SELECT 
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
          AND q.time >= NOW()
          AND q.queue_status IN ('pending', 'completed')
        ORDER BY q.time ASC
        LIMIT 5
      `, [dentistId]);

      // 7) เวรวันนี้
      const [todaySchedule] = await db.execute(`
        SELECT 
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
          AND q.queue_status IN ('pending', 'completed')
        ORDER BY q.time ASC
        LIMIT 1
      `, [dentistId]);

      // 8) ปฏิทินเดือนนี้
      const [monthlyAppointments] = await db.execute(`
        SELECT DAY(q.time) as day, COUNT(*) as count
        FROM queue q
        WHERE q.dentist_id = ? 
          AND MONTH(q.time) = MONTH(CURDATE())
          AND YEAR(q.time) = YEAR(CURDATE())
          AND q.queue_status IN ('pending', 'completed')
        GROUP BY DAY(q.time)
      `, [dentistId]);

      const dashboardData = {
        dentist,
        stats: {
          todayPatients: todayPatientsResult[0].count || 0,
          totalPatients: totalPatientsResult[0].count || 0,
          cancelledAppointments: cancelledResult[0].count || 0,
          completedAppointments: completedResult[0].count || 0,
        },
        latestAppointments: latestAppointments || [],
        upcomingAppointments: upcomingAppointments || [],
        todaySchedule: todaySchedule[0] || null,
        monthlyAppointments: monthlyAppointments || [],
        currentDate: new Date().toLocaleDateString('th-TH', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        currentYear: new Date().getFullYear(),
        currentMonth: new Date().getMonth() + 1
      };

      res.render('dentist/dashboard', dashboardData);
    } catch (error) {
      console.error('Error in getDashboard:', error);
      res.status(500).render('error', { 
        message: 'เกิดข้อผิดพลาดในการโหลดข้อมูล Dashboard',
        error 
      });
    }
  },

  // หน้านัดหมายทั้งหมด
  getAppointments: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;
      const [dentistResult] = await db.execute(`
        SELECT dentist_id, fname, lname FROM dentist WHERE user_id = ?
      `, [userId]);

      if (dentistResult.length === 0) return res.redirect('/login');
      const dentist = dentistResult[0];
      const dentistId = dentist.dentist_id;

      // ดึงข้อมูลนัดหมายทั้งหมด เรียงจากใหม่ไปเก่า
      const [appointments] = await db.execute(`
        SELECT 
          q.queue_id,
          q.time,
          q.queue_status,
          q.diagnosis,
          q.next_appointment,
          p.fname,
          p.lname,
          p.phone,
          t.treatment_name,
          t.duration
        FROM queue q
        JOIN patient p ON q.patient_id = p.patient_id
        JOIN treatment t ON q.treatment_id = t.treatment_id
        WHERE q.dentist_id = ?
        ORDER BY q.time DESC
      `, [dentistId]);

      // นับนัดหมายแต่ละสถานะ
      const [statusCounts] = await db.execute(`
        SELECT 
          queue_status,
          COUNT(*) as count
        FROM queue q
        WHERE q.dentist_id = ?
        GROUP BY queue_status
      `, [dentistId]);

      // นับนัดหมายวันนี้
      const [todayCount] = await db.execute(`
        SELECT COUNT(*) as count
        FROM queue q
        WHERE q.dentist_id = ? 
          AND DATE(q.time) = CURDATE()
      `, [dentistId]);

      // สร้าง object สำหรับสถิติ
      const stats = {
        total: appointments.length,
        today: todayCount[0]?.count || 0,
        pending: statusCounts.find(s => s.queue_status === 'pending')?.count || 0,
        completed: statusCounts.find(s => s.queue_status === 'completed')?.count || 0,
        cancelled: statusCounts.find(s => s.queue_status === 'cancel')?.count || 0
      };

      res.render('dentist/appointments', { 
        appointments: appointments || [],
        dentist,
        stats,
        currentDate: new Date().toISOString().split('T')[0]
      });
    } catch (error) {
      console.error('Error in getAppointments:', error);
      res.status(500).render('error', { 
        message: 'เกิดข้อผิดพลาดในการโหลดข้อมูลนัดหมาย',
        error 
      });
    }
  },

  // รายละเอียดนัดหมาย
  getAppointmentDetail: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;
      const queueId = req.params.id;

      const [appointmentResult] = await db.execute(`
        SELECT 
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
        WHERE q.queue_id = ? AND d.user_id = ?
      `, [queueId, userId]);

      if (appointmentResult.length === 0) {
        return res.status(404).render('error', { 
          message: 'ไม่พบข้อมูลนัดหมาย',
          error: { status: 404 }
        });
      }

      res.render('dentist/appointment-detail', { appointment: appointmentResult[0] });
    } catch (error) {
      console.error('Error in getAppointmentDetail:', error);
      res.status(500).render('error', { 
        message: 'เกิดข้อผิดพลาดในการโหลดรายละเอียดนัดหมาย',
        error 
      });
    }
  },

  // อัพเดทสถานะนัดหมาย
  updateAppointmentStatus: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;
      const { queueId, status, diagnosis, nextAppointment } = req.body;

      // ตรวจสอบสิทธิ์
      const [appointmentCheck] = await db.execute(`
        SELECT q.queue_id 
        FROM queue q
        JOIN dentist d ON q.dentist_id = d.dentist_id
        WHERE q.queue_id = ? AND d.user_id = ?
      `, [queueId, userId]);

      if (appointmentCheck.length === 0) {
        return res.status(403).json({ success: false, error: 'ไม่มีสิทธิ์แก้ไขนัดหมายนี้' });
      }

      // อัพเดทข้อมูล
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

      res.json({ success: true, message: 'อัพเดทสถานะนัดหมายเรียบร้อยแล้ว' });
    } catch (error) {
      console.error('Error in updateAppointmentStatus:', error);
      res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการอัพเดทสถานะ' });
    }
  },

  // หน้าผู้ป่วย
  getPatients: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;

      const [dentistResult] = await db.execute(`
        SELECT dentist_id FROM dentist WHERE user_id = ?
      `, [userId]);
      if (dentistResult.length === 0) return res.redirect('/login');

      const dentistId = dentistResult[0].dentist_id;

      const [patients] = await db.execute(`
        SELECT DISTINCT
          p.patient_id,
          p.fname,
          p.lname,
          p.phone,
          p.dob,
          p.address,
          COUNT(q.queue_id) as total_visits,
          MAX(q.time) as last_visit
        FROM patient p
        JOIN queue q ON p.patient_id = q.patient_id
        WHERE q.dentist_id = ?
        GROUP BY p.patient_id, p.fname, p.lname, p.phone, p.dob, p.address
        ORDER BY last_visit DESC
      `, [dentistId]);

      res.render('dentist/patients', { patients });
    } catch (error) {
      console.error('Error in getPatients:', error);
      res.status(500).render('error', { 
        message: 'เกิดข้อผิดพลาดในการโหลดข้อมูลผู้ป่วย',
        error 
      });
    }
  },

  // รายละเอียดผู้ป่วย
  getPatientDetail: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;
      const patientId = req.params.id;

      // ตรวจสอบสิทธิ์หมอ
      const [dentistResult] = await db.execute(`
        SELECT dentist_id FROM dentist WHERE user_id = ?
      `, [userId]);

      if (dentistResult.length === 0) return res.redirect('/login');
      const dentistId = dentistResult[0].dentist_id;

      // ดึงข้อมูลผู้ป่วย
      const [patientResult] = await db.execute(`
        SELECT * FROM patient WHERE patient_id = ?
      `, [patientId]);

      if (patientResult.length === 0) {
        return res.status(404).render('error', { 
          message: 'ไม่พบข้อมูลผู้ป่วย',
          error: { status: 404 }
        });
      }

      // ตรวจสอบว่าผู้ป่วยเคยมีนัดกับหมอคนนี้หรือไม่
      const [accessCheck] = await db.execute(`
        SELECT COUNT(*) as count 
        FROM queue q 
        WHERE q.patient_id = ? AND q.dentist_id = ?
      `, [patientId, dentistId]);

      if (accessCheck[0].count === 0) {
        return res.status(403).render('error', { 
          message: 'ไม่มีสิทธิ์เข้าถึงข้อมูลผู้ป่วยรายนี้',
          error: { status: 403 }
        });
      }

      // ดึงประวัติการรักษาทั้งหมดของผู้ป่วยกับหมอคนนี้
      const [treatmentHistory] = await db.execute(`
        SELECT 
          q.queue_id,
          q.time,
          q.queue_status,
          q.diagnosis,
          q.next_appointment,
          t.treatment_name,
          t.duration,
          d.fname as dentist_fname,
          d.lname as dentist_lname
        FROM queue q
        JOIN treatment t ON q.treatment_id = t.treatment_id
        JOIN dentist d ON q.dentist_id = d.dentist_id
        WHERE q.patient_id = ? AND q.dentist_id = ?
        ORDER BY q.time DESC
      `, [patientId, dentistId]);

      res.render('dentist/patient-detail', { 
        patient: patientResult[0],
        treatmentHistory: treatmentHistory || []
      });
    } catch (error) {
      console.error('Error in getPatientDetail:', error);
      res.status(500).render('error', { 
        message: 'เกิดข้อผิดพลาดในการโหลดรายละเอียดผู้ป่วย',
        error 
      });
    }
  },

  // หน้าตารางเวลา
  getSchedule: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;

      const [dentistResult] = await db.execute(`
        SELECT * FROM dentist WHERE user_id = ?
      `, [userId]);

      if (dentistResult.length === 0) return res.redirect('/login');

      const dentist = dentistResult[0];

      res.render('dentist/schedule', { 
        dentist,
        currentDate: new Date().toISOString().split('T')[0]
      });
    } catch (error) {
      console.error('Error in getSchedule:', error);
      res.status(500).render('error', { 
        message: 'เกิดข้อผิดพลาดในการโหลดตารางเวลา',
        error 
      });
    }
  },

  // หน้าประวัติ
  getHistory: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;

      const [dentistResult] = await db.execute(`
        SELECT dentist_id FROM dentist WHERE user_id = ?
      `, [userId]);

      if (dentistResult.length === 0) return res.redirect('/login');

      const dentistId = dentistResult[0].dentist_id;

      const [treatmentHistory] = await db.execute(`
        SELECT 
          q.*,
          p.fname,
          p.lname,
          t.treatment_name,
          t.duration
        FROM queue q
        JOIN patient p ON q.patient_id = p.patient_id
        JOIN treatment t ON q.treatment_id = t.treatment_id
        WHERE q.dentist_id = ? 
          AND q.queue_status = 'completed'
          AND q.time < NOW()
        ORDER BY q.time DESC
      `, [dentistId]);

      res.render('dentist/history', { treatmentHistory });
    } catch (error) {
      console.error('Error in getHistory:', error);
      res.status(500).render('error', { 
        message: 'เกิดข้อผิดพลาดในการโหลดประวัติ',
        error 
      });
    }
  },

  // หน้าโปรไฟล์
  getProfile: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;

      const [dentistResult] = await db.execute(`
        SELECT d.*, u.email, u.username 
        FROM dentist d 
        JOIN user u ON d.user_id = u.user_id 
        WHERE d.user_id = ?
      `, [userId]);

      if (dentistResult.length === 0) return res.redirect('/login');

      res.render('dentist/profile', { dentist: dentistResult[0] });
    } catch (error) {
      console.error('Error in getProfile:', error);
      res.status(500).render('error', { 
        message: 'เกิดข้อผิดพลาดในการโหลดโปรไฟล์',
        error 
      });
    }
  },

  // อัพเดทโปรไฟล์
  updateProfile: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;
      const { fname, lname, phone, specialty, address, education, work_start, work_end } = req.body;

      await db.execute(`
        UPDATE dentist 
        SET fname = ?, lname = ?, phone = ?, specialty = ?, address = ?, education = ?, work_start = ?, work_end = ?
        WHERE user_id = ?
      `, [fname, lname, phone, specialty, address, education, work_start, work_end, userId]);

      res.json({ success: true, message: 'อัพเดทโปรไฟล์เรียบร้อยแล้ว' });
    } catch (error) {
      console.error('Error in updateProfile:', error);
      res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการอัพเดทโปรไฟล์' });
    }
  },

  // เปลี่ยนรหัสผ่าน
  updatePassword: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;
      const { currentPassword, newPassword, confirmPassword } = req.body;

      if (newPassword !== confirmPassword) {
        return res.status(400).json({ success: false, error: 'รหัสผ่านใหม่ไม่ตรงกัน' });
      }

      // สำหรับการทดสอบ ใช้การเปรียบเทียบแบบง่าย
      // ในการใช้งานจริงควรใช้ bcrypt
      const [userResult] = await db.execute(`SELECT password FROM user WHERE user_id = ?`, [userId]);
      
      if (userResult.length === 0) {
        return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลผู้ใช้' });
      }

      // Simple password comparison (ใช้ bcrypt ในการใช้งานจริง)
      if (userResult[0].password !== currentPassword) {
        return res.status(400).json({ success: false, error: 'รหัสผ่านเดิมไม่ถูกต้อง' });
      }

      // อัพเดทรหัสผ่านใหม่
      await db.execute(`UPDATE user SET password = ? WHERE user_id = ?`, [newPassword, userId]);

      res.json({ success: true, message: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว' });
    } catch (error) {
      console.error('Error in updatePassword:', error);
      res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน' });
    }
  },

  // หน้าการรักษา
  getTreatments: async (req, res) => {
    try {
      const [treatments] = await db.execute(`SELECT * FROM treatment ORDER BY treatment_name`);
      res.render('dentist/treatments', { treatments });
    } catch (error) {
      console.error('Error in getTreatments:', error);
      res.status(500).render('error', { 
        message: 'เกิดข้อผิดพลาดในการโหลดข้อมูลการรักษา',
        error 
      });
    }
  },

  // เพิ่มการรักษาใหม่
  addTreatment: async (req, res) => {
    try {
      const { treatment_name, duration } = req.body;
      
      await db.execute(`
        INSERT INTO treatment (treatment_name, duration) VALUES (?, ?)
      `, [treatment_name, duration]);

      res.json({ success: true, message: 'เพิ่มการรักษาเรียบร้อยแล้ว' });
    } catch (error) {
      console.error('Error in addTreatment:', error);
      res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการเพิ่มการรักษา' });
    }
  },

  // แก้ไขการรักษา
  updateTreatment: async (req, res) => {
    try {
      const treatmentId = req.params.id;
      const { treatment_name, duration } = req.body;
      
      await db.execute(`
        UPDATE treatment SET treatment_name = ?, duration = ? WHERE treatment_id = ?
      `, [treatment_name, duration, treatmentId]);

      res.json({ success: true, message: 'แก้ไขการรักษาเรียบร้อยแล้ว' });
    } catch (error) {
      console.error('Error in updateTreatment:', error);
      res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการแก้ไขการรักษา' });
    }
  },

  // ลบการรักษา
  deleteTreatment: async (req, res) => {
    try {
      const treatmentId = req.params.id;
      
      // ตรวจสอบว่ามีการใช้งานอยู่หรือไม่
      const [usage] = await db.execute(`SELECT COUNT(*) as count FROM queue WHERE treatment_id = ?`, [treatmentId]);
      
      if (usage[0].count > 0) {
        return res.status(400).json({ success: false, error: 'ไม่สามารถลบได้ เนื่องจากมีการใช้งานอยู่' });
      }
      
      await db.execute(`DELETE FROM treatment WHERE treatment_id = ?`, [treatmentId]);

      res.json({ success: true, message: 'ลบการรักษาเรียบร้อยแล้ว' });
    } catch (error) {
      console.error('Error in deleteTreatment:', error);
      res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการลบการรักษา' });
    }
  },

  // หน้ารายงาน
  getReports: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;
      const [dentistResult] = await db.execute(`SELECT dentist_id FROM dentist WHERE user_id = ?`, [userId]);
      
      if (dentistResult.length === 0) return res.redirect('/login');
      const dentistId = dentistResult[0].dentist_id;

      // สรุปรายงานรายเดือน
      const [monthlyStats] = await db.execute(`
        SELECT 
          MONTH(q.time) as month,
          YEAR(q.time) as year,
          COUNT(*) as total_appointments,
          COUNT(CASE WHEN q.queue_status = 'completed' THEN 1 END) as confirmed,
          COUNT(CASE WHEN q.queue_status = 'cancel' THEN 1 END) as cancelled,
          COUNT(DISTINCT q.patient_id) as unique_patients
        FROM queue q
        WHERE q.dentist_id = ?
          AND q.time >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
        GROUP BY YEAR(q.time), MONTH(q.time)
        ORDER BY year DESC, month DESC
      `, [dentistId]);

      res.render('dentist/reports', { monthlyStats });
    } catch (error) {
      console.error('Error in getReports:', error);
      res.status(500).render('error', { 
        message: 'เกิดข้อผิดพลาดในการโหลดรายงาน',
        error 
      });
    }
  },

  // รายงานรายเดือน
  getMonthlyReport: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;
      const { year, month } = req.query;
      
      const [dentistResult] = await db.execute(`SELECT dentist_id FROM dentist WHERE user_id = ?`, [userId]);
      if (dentistResult.length === 0) return res.redirect('/login');
      
      const dentistId = dentistResult[0].dentist_id;

      const [monthlyData] = await db.execute(`
        SELECT 
          q.*,
          p.fname,
          p.lname,
          t.treatment_name
        FROM queue q
        JOIN patient p ON q.patient_id = p.patient_id
        JOIN treatment t ON q.treatment_id = t.treatment_id
        WHERE q.dentist_id = ?
          AND YEAR(q.time) = ?
          AND MONTH(q.time) = ?
        ORDER BY q.time
      `, [dentistId, year, month]);

      res.json({ success: true, data: monthlyData });
    } catch (error) {
      console.error('Error in getMonthlyReport:', error);
      res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการโหลดรายงานรายเดือน' });
    }
  },

  // รายงานประวัติผู้ป่วย
  getPatientHistoryReport: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;
      const patientId = req.params.id;

      const [patientHistory] = await db.execute(`
        SELECT 
          q.*,
          t.treatment_name,
          d.fname as dentist_fname,
          d.lname as dentist_lname
        FROM queue q
        JOIN treatment t ON q.treatment_id = t.treatment_id
        JOIN dentist d ON q.dentist_id = d.dentist_id
        WHERE q.patient_id = ? AND d.user_id = ?
        ORDER BY q.time DESC
      `, [patientId, userId]);

      res.json({ success: true, data: patientHistory });
    } catch (error) {
      console.error('Error in getPatientHistoryReport:', error);
      res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการโหลดประวัติผู้ป่วย' });
    }
  },

  // API: ดึงข้อมูลนัดหมายรายวัน
  getAppointmentsAPI: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;
      const date = req.query.date || new Date().toISOString().split('T')[0];

      const [dentistResult] = await db.execute(`
        SELECT dentist_id FROM dentist WHERE user_id = ?
      `, [userId]);

      if (dentistResult.length === 0) {
        return res.status(404).json({ error: 'Dentist not found' });
      }

      const dentistId = dentistResult[0].dentist_id;

      const [appointments] = await db.execute(`
        SELECT 
          q.queue_id,
          q.time,
          q.queue_status,
          q.diagnosis,
          p.fname,
          p.lname,
          p.phone,
          t.treatment_name,
          t.duration
        FROM queue q
        JOIN patient p ON q.patient_id = p.patient_id
        JOIN treatment t ON q.treatment_id = t.treatment_id
        WHERE q.dentist_id = ? 
          AND DATE(q.time) = ?
        ORDER BY q.time ASC
      `, [dentistId, date]);

      res.json({ success: true, appointments, date });
    } catch (error) {
      console.error('Error in getAppointmentsAPI:', error);
      res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลนัดหมาย' });
    }
  },

  // API: นัดหมายวันนี้
  getTodayAppointments: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;
      const [dentistResult] = await db.execute(`SELECT dentist_id FROM dentist WHERE user_id = ?`, [userId]);
      
      if (dentistResult.length === 0) {
        return res.status(404).json({ error: 'Dentist not found' });
      }

      const dentistId = dentistResult[0].dentist_id;

      const [appointments] = await db.execute(`
        SELECT 
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
          AND q.queue_status IN ('pending', 'completed')
        ORDER BY q.time ASC
      `, [dentistId]);

      res.json({ success: true, appointments });
    } catch (error) {
      console.error('Error in getTodayAppointments:', error);
      res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลนัดหมายวันนี้' });
    }
  },

  // API: นัดหมายที่กำลังจะมาถึง
  getUpcomingAppointments: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;
      const [dentistResult] = await db.execute(`SELECT dentist_id FROM dentist WHERE user_id = ?`, [userId]);
      
      if (dentistResult.length === 0) {
        return res.status(404).json({ error: 'Dentist not found' });
      }

      const dentistId = dentistResult[0].dentist_id;

      const [appointments] = await db.execute(`
        SELECT 
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
          AND q.queue_status IN ('pending', 'completed')
        ORDER BY q.time ASC
        LIMIT 10
      `, [dentistId]);

      res.json({ success: true, appointments });
    } catch (error) {
      console.error('Error in getUpcomingAppointments:', error);
      res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลนัดหมายที่กำลังจะมาถึง' });
    }
  },

  // API: สถิติ Dashboard
  getDashboardStats: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;
      const [dentistResult] = await db.execute(`SELECT dentist_id FROM dentist WHERE user_id = ?`, [userId]);
      
      if (dentistResult.length === 0) {
        return res.status(404).json({ error: 'Dentist not found' });
      }

      const dentistId = dentistResult[0].dentist_id;

      const [todayPatients] = await db.execute(`
        SELECT COUNT(DISTINCT patient_id) as count
        FROM queue WHERE dentist_id = ? AND DATE(time) = CURDATE() AND queue_status IN ('pending', 'completed')
      `, [dentistId]);

      const [totalPatients] = await db.execute(`
        SELECT COUNT(DISTINCT patient_id) as count FROM queue WHERE dentist_id = ?
      `, [dentistId]);

      const [cancelled] = await db.execute(`
        SELECT COUNT(*) as count FROM queue WHERE dentist_id = ? AND queue_status = 'cancel'
      `, [dentistId]);

      const [completed] = await db.execute(`
        SELECT COUNT(*) as count FROM queue 
        WHERE dentist_id = ? AND queue_status = 'completed' AND time < NOW()
      `, [dentistId]);

      res.json({
        success: true,
        stats: {
          todayPatients: todayPatients[0].count,
          totalPatients: totalPatients[0].count,
          cancelledAppointments: cancelled[0].count,
          completedAppointments: completed[0].count
        }
      });
    } catch (error) {
      console.error('Error in getDashboardStats:', error);
      res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงสถิติ' });
    }
  },

  // API: ค้นหาผู้ป่วย
  searchPatients: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;
      const { q } = req.query;
      
      const [dentistResult] = await db.execute(`SELECT dentist_id FROM dentist WHERE user_id = ?`, [userId]);
      if (dentistResult.length === 0) {
        return res.status(404).json({ error: 'Dentist not found' });
      }

      const dentistId = dentistResult[0].dentist_id;

      const [patients] = await db.execute(`
        SELECT DISTINCT p.patient_id, p.fname, p.lname, p.phone
        FROM patient p
        JOIN queue q ON p.patient_id = q.patient_id
        WHERE q.dentist_id = ? 
          AND (p.fname LIKE ? OR p.lname LIKE ? OR p.phone LIKE ?)
        LIMIT 10
      `, [dentistId, `%${q}%`, `%${q}%`, `%${q}%`]);

      res.json({ success: true, patients });
    } catch (error) {
      console.error('Error in searchPatients:', error);
      res.status(500).json({ error: 'เกิดข้อผิดพลาดในการค้นหาผู้ป่วย' });
    }
  },

  // API: ดึงข้อมูลปฏิทิน
  getCalendarData: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;
      const year = req.params.year;
      const month = req.params.month;

      const [dentistResult] = await db.execute(`
        SELECT dentist_id FROM dentist WHERE user_id = ?
      `, [userId]);

      if (dentistResult.length === 0) {
        return res.status(404).json({ error: 'Dentist not found' });
      }

      const dentistId = dentistResult[0].dentist_id;

      const [calendarData] = await db.execute(`
        SELECT DAY(q.time) as day, COUNT(*) as count
        FROM queue q
        WHERE q.dentist_id = ? 
          AND YEAR(q.time) = ?
          AND MONTH(q.time) = ?
          AND q.queue_status IN ('pending', 'completed')
        GROUP BY DAY(q.time)
      `, [dentistId, year, month]);

      res.json({ success: true, calendarData });
    } catch (error) {
      console.error('Error in getCalendarData:', error);
      res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูลปฏิทิน' });
    }
  },

  // API: ยืนยันนัดหมาย
  confirmAppointment: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;
      const { queueId } = req.body;

      const [appointmentCheck] = await db.execute(`
        SELECT q.queue_id 
        FROM queue q
        JOIN dentist d ON q.dentist_id = d.dentist_id
        WHERE q.queue_id = ? AND d.user_id = ?
      `, [queueId, userId]);

      if (appointmentCheck.length === 0) {
        return res.status(403).json({ success: false, error: 'ไม่มีสิทธิ์' });
      }

      await db.execute(`UPDATE queue SET queue_status = 'completed' WHERE queue_id = ?`, [queueId]);

      res.json({ success: true, message: 'ยืนยันนัดหมายเรียบร้อยแล้ว' });
    } catch (error) {
      console.error('Error in confirmAppointment:', error);
      res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาด' });
    }
  },

  // API: ยกเลิกนัดหมาย
  cancelAppointment: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;
      const { queueId } = req.body;

      const [appointmentCheck] = await db.execute(`
        SELECT q.queue_id 
        FROM queue q
        JOIN dentist d ON q.dentist_id = d.dentist_id
        WHERE q.queue_id = ? AND d.user_id = ?
      `, [queueId, userId]);

      if (appointmentCheck.length === 0) {
        return res.status(403).json({ success: false, error: 'ไม่มีสิทธิ์' });
      }

      await db.execute(`UPDATE queue SET queue_status = 'cancel' WHERE queue_id = ?`, [queueId]);

      res.json({ success: true, message: 'ยกเลิกนัดหมายเรียบร้อยแล้ว' });
    } catch (error) {
      console.error('Error in cancelAppointment:', error);
      res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาด' });
    }
  },

  // API: ทำเครื่องหมายเสร็จสิ้น
  completeAppointment: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;
      const { queueId, status, diagnosis, nextAppointment } = req.body;

      const [appointmentCheck] = await db.execute(`
        SELECT q.queue_id, q.queue_status
        FROM queue q
        JOIN dentist d ON q.dentist_id = d.dentist_id
        WHERE q.queue_id = ? AND d.user_id = ?
      `, [queueId, userId]);

      if (appointmentCheck.length === 0) {
        return res.status(403).json({ success: false, error: 'ไม่มีสิทธิ์' });
      }

      // ตรวจสอบว่าสถานะปัจจุบันเป็น pending หรือไม่
      if (appointmentCheck[0].queue_status !== 'pending') {
        return res.status(400).json({ success: false, error: 'สามารถเปลี่ยนสถานะได้เฉพาะนัดหมายที่ยังไม่ได้รักษา' });
      }

      let updateQuery = `UPDATE queue SET queue_status = ?`;
      const params = [status || 'completed'];

      if (diagnosis) {
        updateQuery += `, diagnosis = ?`;
        params.push(diagnosis);
      }

      if (nextAppointment) {
        updateQuery += `, next_appointment = ?`;
        params.push(nextAppointment);
      }

      updateQuery += ` WHERE queue_id = ?`;
      params.push(queueId);

      await db.execute(updateQuery, params);

      res.json({ success: true, message: 'ทำเครื่องหมายการรักษาเสร็จสิ้นแล้ว' });
    } catch (error) {
      console.error('Error in completeAppointment:', error);
      res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการทำเครื่องหมายเสร็จสิ้น' });
    }
  },

  // API: ดึงข้อมูลนัดหมายล่าสุดของผู้ป่วย
  getPatientLatestAppointments: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;
      const patientId = req.params.patientId;

      const [dentistResult] = await db.execute(`
        SELECT dentist_id FROM dentist WHERE user_id = ?
      `, [userId]);

      if (dentistResult.length === 0) {
        return res.status(404).json({ success: false, error: 'Dentist not found' });
      }

      const dentistId = dentistResult[0].dentist_id;

      // ดึงนัดหมายล่าสุด 5 รายการ
      const [appointments] = await db.execute(`
        SELECT 
          q.queue_id,
          q.time,
          q.queue_status,
          q.diagnosis,
          t.treatment_name
        FROM queue q
        JOIN treatment t ON q.treatment_id = t.treatment_id
        WHERE q.patient_id = ? 
          AND q.dentist_id = ?
        ORDER BY q.time DESC
        LIMIT 5
      `, [patientId, dentistId]);

      res.json({ success: true, appointments });
    } catch (error) {
      console.error('Error in getPatientLatestAppointments:', error);
      res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการดึงข้อมูลนัดหมาย' });
    }
  },

  // API: เพิ่มประวัติการรักษา
  addTreatmentHistory: async (req, res) => {
    try {
      const userId = req.session.user?.user_id || req.session.userId;
      const { patientId, queueId, diagnosis, followUpdate, nextAppointment } = req.body;

      // ตรวจสอบสิทธิ์
      const [appointmentCheck] = await db.execute(`
        SELECT q.queue_id, qd.queuedetail_id
        FROM queue q
        LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
        JOIN dentist d ON q.dentist_id = d.dentist_id
        WHERE q.queue_id = ? AND q.patient_id = ? AND d.user_id = ?
      `, [queueId, patientId, userId]);

      if (appointmentCheck.length === 0) {
        return res.status(403).json({ success: false, error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้' });
      }

      const queuedetailId = appointmentCheck[0].queuedetail_id;

      // อัพเดท diagnosis ในตาราง queue
      await db.execute(`
        UPDATE queue 
        SET diagnosis = ?, next_appointment = ?, queue_status = 'completed'
        WHERE queue_id = ?
      `, [diagnosis, nextAppointment || null, queueId]);

      // เพิ่มข้อมูลในตาราง treatmentHistory หากมี queuedetail_id
      if (queuedetailId) {
        // ตรวจสอบว่ามีประวัติอยู่แล้วหรือไม่
        const [existingHistory] = await db.execute(`
          SELECT tmh_id FROM treatmentHistory WHERE queuedetail_id = ?
        `, [queuedetailId]);

        if (existingHistory.length > 0) {
          // อัพเดทประวัติที่มีอยู่
          await db.execute(`
            UPDATE treatmentHistory 
            SET diagnosis = ?, followUpdate = ?
            WHERE queuedetail_id = ?
          `, [diagnosis, followUpdate || '', queuedetailId]);
        } else {
          // เพิ่มประวัติใหม่
          await db.execute(`
            INSERT INTO treatmentHistory (queuedetail_id, diagnosis, followUpdate)
            VALUES (?, ?, ?)
          `, [queuedetailId, diagnosis, followUpdate || '']);
        }
      }

      res.json({ success: true, message: 'บันทึกประวัติการรักษาเรียบร้อยแล้ว' });
    } catch (error) {
      console.error('Error in addTreatmentHistory:', error);
      res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการบันทึกประวัติการรักษา' });
    }
  },

  // ฟังก์ชัน API อื่นๆ ที่เหลือ (สำหรับให้ครบตาม routes)
  saveSchedule: async (req, res) => {
    res.json({ success: true, message: 'Feature not implemented yet' });
  },

  loadSchedule: async (req, res) => {
    res.json({ success: true, schedules: [] });
  },

  deleteSchedule: async (req, res) => {
    res.json({ success: true, message: 'Feature not implemented yet' });
  },

  getAvailableSlots: async (req, res) => {
    res.json({ success: true, slots: [] });
  },

  getAvailableDentists: async (req, res) => {
    res.json({ success: true, dentists: [] });
  },

  getNotifications: async (req, res) => {
    res.json({ success: true, notifications: [] });
  },

  exportAppointments: async (req, res) => {
    res.json({ success: true, data: [] });
  },

  exportPatients: async (req, res) => {
    res.json({ success: true, data: [] });
  }
};

module.exports = dentistController;