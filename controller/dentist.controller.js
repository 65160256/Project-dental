// controllers/dentist.controller.js
const db = require('../config/db');

const path = require('path');
const bcrypt = require('bcrypt'); 

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

// Helper function to get status display text
const getStatusDisplayText = (status) => {
  switch (status) {
    case 'completed':
      return 'Recorded';
    case 'pending':
      return 'Not yet filed';
    case 'cancel':
      return 'Cancelled';
    default:
      return 'Unknown';
  }
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

    // 1) ผู้ป่วยวันนี้ (รอรักษา)
    const [todayPatientsResult] = await db.execute(`
      SELECT COUNT(DISTINCT q.patient_id) as count
      FROM queue q
      WHERE q.dentist_id = ? 
        AND DATE(q.time) = CURDATE()
        AND q.queue_status IN ('pending', 'confirm')
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

    // 4) นัดหมายที่เสร็จสิ้น (เฉพาะ completed)
    const [completedResult] = await db.execute(`
      SELECT COUNT(*) as count
      FROM queue q
      WHERE q.dentist_id = ? 
        AND q.queue_status = 'completed'
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

    // 6) นัดหมายที่กำลังจะมาถึง (รอรักษา)
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
        AND q.queue_status IN ('pending', 'confirm')
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
        AND q.queue_status IN ('pending', 'confirm')
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
        AND q.queue_status IN ('pending', 'confirm')
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
      SELECT dentist_id, fname, lname, photo FROM dentist WHERE user_id = ?
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

    // นับนัดหมายวันนี้ (เฉพาะที่รอรักษา)
    const [todayCount] = await db.execute(`
      SELECT COUNT(*) as count
      FROM queue q
      WHERE q.dentist_id = ? 
        AND DATE(q.time) = CURDATE()
        AND q.queue_status IN ('pending', 'confirm')
    `, [dentistId]);

    // สร้าง object สำหรับสถิติ
    const stats = {
      total: appointments.length,
      today: todayCount[0]?.count || 0,
      pending: (statusCounts.find(s => s.queue_status === 'pending')?.count || 0) + 
               (statusCounts.find(s => s.queue_status === 'confirm')?.count || 0), // รวม pending + confirm
      completed: statusCounts.find(s => s.queue_status === 'completed')?.count || 0,
      cancelled: statusCounts.find(s => s.queue_status === 'cancel')?.count || 0
    };

    console.log('Appointments data:', appointments.map(a => ({ 
      id: a.queue_id, 
      status: a.queue_status,
      patient: a.fname + ' ' + a.lname 
    })));

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

  // ฟังก์ชันบันทึกตารางงาน
saveScheduleRange: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const { startDate, endDate, status, startTime, endTime, note } = req.body;

    console.log('Received schedule save request:', { startDate, endDate, status, startTime, endTime });

    // Validation
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        success: false, 
        error: 'กรุณาระบุช่วงวันที่' 
      });
    }

    if (status === 'working' && (!startTime || !endTime)) {
      return res.status(400).json({ 
        success: false, 
        error: 'กรุณาระบุเวลาทำงาน' 
      });
    }

    // ตรวจสอบสิทธิ์หมอ
    const [dentistResult] = await db.execute(`
      SELECT dentist_id FROM dentist WHERE user_id = ?
    `, [userId]);

    if (dentistResult.length === 0) {
      return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลทันตแพทย์' });
    }

    const dentistId = dentistResult[0].dentist_id;
    
    // เริ่ม transaction
    await db.query('START TRANSACTION');

    try {
      // ลบตารางเวลาเก่าในช่วงวันที่นี้
      await db.execute(`
        DELETE FROM dentist_schedule 
        WHERE dentist_id = ? 
          AND schedule_date BETWEEN ? AND ?
      `, [dentistId, startDate, endDate]);

      // แปลง string เป็น Date objects (ใช้วิธีที่ป้องกัน timezone issue)
      const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
      const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
      
      const start = new Date(startYear, startMonth - 1, startDay);
      const end = new Date(endYear, endMonth - 1, endDay);

      console.log('Processing dates:', {
        start: start.toISOString(),
        end: end.toISOString(),
        startLocal: `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`,
        endLocal: `${end.getFullYear()}-${String(end.getMonth()+1).padStart(2,'0')}-${String(end.getDate()).padStart(2,'0')}`
      });

      let insertedDays = 0;
      let skippedSundays = 0;

      // วนลูปทีละวัน
      const currentDate = new Date(start);
      
      while (currentDate <= end) {
        const dayOfWeek = currentDate.getDay();
        
        // Format วันที่สำหรับบันทึกลงฐานข้อมูล (แบบ local time)
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        const scheduleDate = `${year}-${month}-${day}`;

        console.log(`Processing date: ${scheduleDate}, day of week: ${dayOfWeek}`);

        // ข้ามวันอาทิตย์
        if (dayOfWeek === 0) {
          skippedSundays++;
          console.log(`Skipped Sunday: ${scheduleDate}`);
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        // บันทึกเฉพาะวันจันทร์-เสาร์
        if (status === 'dayoff') {
          // บันทึกวันหยุด
          await db.execute(`
            INSERT INTO dentist_schedule 
            (dentist_id, schedule_date, day_of_week, hour, status, start_time, end_time, note)
            VALUES (?, ?, ?, 0, 'dayoff', '00:00:00', '23:59:59', ?)
          `, [dentistId, scheduleDate, dayOfWeek, note || 'วันหยุดพิเศษ']);
          insertedDays++;
          console.log(`Inserted dayoff: ${scheduleDate}`);
        } else {
          // บันทึกชั่วโมงทำงาน
          const startHour = parseInt(startTime.split(':')[0]);
          const endHour = parseInt(endTime.split(':')[0]);

          for (let hour = startHour; hour < endHour; hour++) {
            const hourStartTime = `${hour.toString().padStart(2, '0')}:00:00`;
            const hourEndTime = `${(hour + 1).toString().padStart(2, '0')}:00:00`;

            await db.execute(`
              INSERT INTO dentist_schedule 
              (dentist_id, schedule_date, day_of_week, hour, status, start_time, end_time, note)
              VALUES (?, ?, ?, ?, 'working', ?, ?, ?)
            `, [dentistId, scheduleDate, dayOfWeek, hour, hourStartTime, hourEndTime, note || '']);
          }
          insertedDays++;
          console.log(`Inserted working hours: ${scheduleDate}, ${startTime}-${endTime}`);
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Commit transaction
      await db.query('COMMIT');

      console.log(`Successfully saved schedule. Inserted: ${insertedDays} days, Skipped sundays: ${skippedSundays}`);

      let message = '';
      if (status === 'dayoff') {
        message = `บันทึกวันหยุดสำเร็จ (${insertedDays} วัน${skippedSundays > 0 ? `, ข้ามวันอาทิตย์ ${skippedSundays} วัน` : ''})`;
      } else {
        message = `บันทึกเวลาทำงานสำเร็จ (${insertedDays} วัน${skippedSundays > 0 ? `, ข้ามวันอาทิตย์ ${skippedSundays} วัน` : ''})`;
      }
      
      res.json({ 
        success: true, 
        message,
        insertedDays,
        skippedSundays
      });

    } catch (error) {
      // Rollback transaction
      await db.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error saving schedule range:', error);
    res.status(500).json({ 
      success: false, 
      error: 'เกิดข้อผิดพลาดในการบันทึกตารางเวลา'
    });
  }
},

// เพิ่มฟังก์ชันแสดงหน้า monthly schedule
getMonthlySchedule: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;

    const [dentistResult] = await db.execute(`
      SELECT d.*, u.email, u.username 
      FROM dentist d 
      JOIN user u ON d.user_id = u.user_id 
      WHERE d.user_id = ?
    `, [userId]);

    if (dentistResult.length === 0) return res.redirect('/login');

    res.render('dentist/schedule-monthly', { 
      dentist: dentistResult[0],
      currentDate: new Date().toISOString().split('T')[0]
    });
  } catch (error) {
    console.error('Error in getMonthlySchedule:', error);
    res.status(500).render('error', { 
      message: 'เกิดข้อผิดพลาดในการโหลดหน้าตารางเวลา',
      error 
    });
  }
},
// เพิ่มฟังก์ชันลบช่วงวันที่
deleteScheduleRange: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const { startDate, endDate } = req.body;

    const [dentistResult] = await db.execute(`
      SELECT dentist_id FROM dentist WHERE user_id = ?
    `, [userId]);

    if (dentistResult.length === 0) {
      return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลทันตแพทย์' });
    }

    const dentistId = dentistResult[0].dentist_id;

    // ตรวจสอบว่ามีนัดหมายในช่วงนี้หรือไม่
    const [appointmentCheck] = await db.execute(`
      SELECT COUNT(*) as count
      FROM queue
      WHERE dentist_id = ? 
        AND DATE(time) BETWEEN ? AND ?
        AND queue_status IN ('pending', 'confirm')
    `, [dentistId, startDate, endDate]);

    if (appointmentCheck[0].count > 0) {
      return res.status(400).json({ 
        success: false, 
        error: `ไม่สามารถลบได้ เนื่องจากมีนัดหมายในช่วงนี้อยู่ ${appointmentCheck[0].count} รายการ` 
      });
    }

    // ลบตารางเวลา
    await db.execute(`
      DELETE FROM dentist_schedule
      WHERE dentist_id = ? 
        AND schedule_date BETWEEN ? AND ?
    `, [dentistId, startDate, endDate]);

    res.json({ 
      success: true, 
      message: 'ลบตารางเวลาเรียบร้อยแล้ว' 
    });

  } catch (error) {
    console.error('Error deleting schedule range:', error);
    res.status(500).json({ 
      success: false, 
      error: 'เกิดข้อผิดพลาดในการลบตารางเวลา' 
    });
  }
},
  // หน้าผู้ป่วย
 // หน้าผู้ป่วย
getPatients: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;

    const [dentistResult] = await db.execute(`
      SELECT dentist_id, fname, lname, photo FROM dentist WHERE user_id = ?
    `, [userId]);
    
    if (dentistResult.length === 0) return res.redirect('/login');

    const dentist = dentistResult[0];
    const dentistId = dentist.dentist_id;

    // ดึงข้อมูลผู้ป่วยทั้งหมดในระบบ
    const [allPatients] = await db.execute(`
      SELECT 
        p.patient_id,
        p.fname,
        p.lname,
        p.phone,
        p.dob,
        p.address,
        p.id_card,
        p.created_at as patient_since,
        -- นับจำนวนครั้งที่มารักษาทั้งหมด
        (SELECT COUNT(*) FROM queue WHERE patient_id = p.patient_id) as total_visits_all,
        -- นับจำนวนครั้งที่มารักษากับหมอคนนี้
        (SELECT COUNT(*) FROM queue WHERE patient_id = p.patient_id AND dentist_id = ?) as my_visits,
        -- วันที่มารักษาล่าสุด (ทุกหมอ)
        (SELECT MAX(time) FROM queue WHERE patient_id = p.patient_id) as last_visit_all,
        -- วันที่มารักษาล่าสุดกับหมอคนนี้
        (SELECT MAX(time) FROM queue WHERE patient_id = p.patient_id AND dentist_id = ?) as my_last_visit
      FROM patient p
      ORDER BY p.created_at DESC
    `, [dentistId, dentistId]);

    // เพิ่มข้อมูลอายุและสถานะ
    const patientsWithDetails = allPatients.map(patient => {
      let age = null;
      if (patient.dob) {
        const birthDate = new Date(patient.dob);
        const today = new Date();
        age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
      }
      
      // ตรวจสอบว่าเป็นผู้ป่วยของหมอคนนี้หรือไม่
      const isMyPatient = patient.my_visits > 0;
      
      // ใช้วันที่ล่าสุดที่เหมาะสม
      const relevantLastVisit = isMyPatient ? patient.my_last_visit : patient.last_visit_all;
      const relevantVisits = isMyPatient ? patient.my_visits : patient.total_visits_all;
      
      return {
        ...patient,
        age: age,
        isMyPatient: isMyPatient,
        total_visits: relevantVisits,
        last_visit: relevantLastVisit,
        status: relevantLastVisit && (Date.now() - new Date(relevantLastVisit).getTime()) < (90 * 24 * 60 * 60 * 1000) ? 'active' : 'inactive'
      };
    });

    res.render('dentist/patients', { 
      patients: patientsWithDetails || [],
      dentist,
      currentDate: new Date().toISOString().split('T')[0],
      title: 'All Patients'
    });
    
  } catch (error) {
    console.error('Error in getPatients:', error);
    res.status(500).render('error', { 
      message: 'เกิดข้อผิดพลาดในการโหลดข้อมูลผู้ป่วย',
      error 
    });
  }
},

// ฟังก์ชันสำหรับดึงรายละเอียดผู้ป่วย API
// API: ดึงข้อมูลผู้ป่วยพร้อมประวัติการรักษา
getPatientDetailAPI: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const patientId = req.params.patientId;

    // ตรวจสอบสิทธิ์หมอ
    const [dentistResult] = await db.execute(`
      SELECT dentist_id FROM dentist WHERE user_id = ?
    `, [userId]);

    if (dentistResult.length === 0) {
      return res.status(404).json({ success: false, error: 'Dentist not found' });
    }

    const dentistId = dentistResult[0].dentist_id;

    // ดึงข้อมูลผู้ป่วย
    const [patientResult] = await db.execute(`
      SELECT * FROM patient WHERE patient_id = ?
    `, [patientId]);

    if (patientResult.length === 0) {
      return res.status(404).json({ success: false, error: 'Patient not found' });
    }

    // ตรวจสอบว่าผู้ป่วยเคยมีนัดกับหมอคนนี้หรือไม่
    const [accessCheck] = await db.execute(`
      SELECT COUNT(*) as count 
      FROM queue q 
      WHERE q.patient_id = ? AND q.dentist_id = ?
    `, [patientId, dentistId]);

    if (accessCheck[0].count === 0) {
      return res.status(403).json({ 
        success: false, 
        error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลผู้ป่วยรายนี้' 
      });
    }

    const patient = patientResult[0];

    // คำนวณอายุ
    let age = null;
    if (patient.dob) {
      const birthDate = new Date(patient.dob);
      const today = new Date();
      age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
    }

    // ดึงประวัติการรักษาทั้งหมด
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

    // นับสถิติ
    const totalTreatments = treatmentHistory.length;
    const completedTreatments = treatmentHistory.filter(t => 
      t.queue_status === 'completed' || t.queue_status === 'confirm'
    ).length;
    const pendingTreatments = treatmentHistory.filter(t => 
      t.queue_status === 'pending'
    ).length;
    const cancelledTreatments = treatmentHistory.filter(t => 
      t.queue_status === 'cancel'
    ).length;

    // จัดกลุ่มตามปี
    const treatmentsByYear = {};
    treatmentHistory.forEach(treatment => {
      const year = new Date(treatment.time).getFullYear();
      if (!treatmentsByYear[year]) {
        treatmentsByYear[year] = [];
      }
      treatmentsByYear[year].push({
        ...treatment,
        formattedDate: new Date(treatment.time).toLocaleDateString('th-TH', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }),
        formattedTime: new Date(treatment.time).toLocaleTimeString('th-TH', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }),
        statusText: treatment.queue_status === 'completed' || treatment.queue_status === 'confirm' ? 
          'รักษาแล้ว' : 
          treatment.queue_status === 'pending' ? 'รอการรักษา' : 'ยกเลิก'
      });
    });

    res.json({
      success: true,
      patient: {
        ...patient,
        age: age,
        formattedDob: patient.dob ? 
          new Date(patient.dob).toLocaleDateString('th-TH', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          }) : 'ไม่ระบุ',
        formattedCreatedAt: patient.created_at ?
          new Date(patient.created_at).toLocaleDateString('th-TH', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          }) : 'ไม่ทราบ'
      },
      treatmentsByYear,
      stats: {
        total: totalTreatments,
        completed: completedTreatments,
        pending: pendingTreatments,
        cancelled: cancelledTreatments
      }
    });

  } catch (error) {
    console.error('Error in getPatientDetailAPI:', error);
    res.status(500).json({ 
      success: false, 
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลผู้ป่วย' 
    });
  }
},

// API: ค้นหาประวัติการรักษาของผู้ป่วย
searchPatientTreatments: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const patientId = req.params.patientId;
    const { date } = req.query;

    const [dentistResult] = await db.execute(`
      SELECT dentist_id FROM dentist WHERE user_id = ?
    `, [userId]);

    if (dentistResult.length === 0) {
      return res.status(404).json({ success: false, error: 'Dentist not found' });
    }

    const dentistId = dentistResult[0].dentist_id;

    let query = `
      SELECT 
        q.queue_id,
        q.time,
        q.queue_status,
        q.diagnosis,
        q.next_appointment,
        t.treatment_name,
        t.duration
      FROM queue q
      JOIN treatment t ON q.treatment_id = t.treatment_id
      WHERE q.patient_id = ? AND q.dentist_id = ?
    `;

    const params = [patientId, dentistId];

    if (date) {
      query += ` AND DATE(q.time) = ?`;
      params.push(date);
    }

    query += ` ORDER BY q.time DESC`;

    const [treatments] = await db.execute(query, params);

    res.json({
      success: true,
      treatments: treatments.map(t => ({
        ...t,
        formattedDate: new Date(t.time).toLocaleDateString('th-TH', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }),
        formattedTime: new Date(t.time).toLocaleTimeString('th-TH', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        })
      }))
    });

  } catch (error) {
    console.error('Error in searchPatientTreatments:', error);
    res.status(500).json({ 
      success: false, 
      error: 'เกิดข้อผิดพลาดในการค้นหา' 
    });
  }
},

// ฟังก์ชันสำหรับค้นหาผู้ป่วย API
searchPatientsAPI: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const { 
      q: searchQuery, 
      age, 
      visits, 
      lastVisit, 
      sort, 
      page = 1, 
      limit = 10 
    } = req.query;

    const [dentistResult] = await db.execute(`
      SELECT dentist_id FROM dentist WHERE user_id = ?
    `, [userId]);

    if (dentistResult.length === 0) {
      return res.status(404).json({ success: false, error: 'Dentist not found' });
    }

    const dentistId = dentistResult[0].dentist_id;

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
      const currentDate = new Date();
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

    res.json({
      success: true,
      patients: results.map(patient => ({
        ...patient,
        formattedLastVisit: patient.last_visit ? 
          new Date(patient.last_visit).toLocaleDateString('en-GB') : 'Never',
        status: patient.last_visit && 
          (Date.now() - new Date(patient.last_visit).getTime()) < (90 * 24 * 60 * 60 * 1000) ? 
          'active' : 'inactive'
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    });

  } catch (error) {
    console.error('Error in searchPatientsAPI:', error);
    res.status(500).json({ 
      success: false, 
      error: 'เกิดข้อผิดพลาดในการค้นหาผู้ป่วย' 
    });
  }
},


// ฟังก์ชันสำหรับส่งออกข้อมูลผู้ป่วย
exportPatientsData: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const { format = 'csv' } = req.query;

    const [dentistResult] = await db.execute(`
  SELECT dentist_id, fname, lname, photo FROM dentist WHERE user_id = ?
`, [userId]);

    if (dentistResult.length === 0) {
      return res.status(404).json({ success: false, error: 'Dentist not found' });
    }

    const dentistId = dentistResult[0].dentist_id;
    const dentist = dentistResult[0];

    // ดึงข้อมูลผู้ป่วยทั้งหมด
    const [patients] = await db.execute(`
      SELECT 
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
      ORDER BY p.fname, p.lname
    `, [dentistId]);

    if (format === 'csv') {
      // สร้าง CSV
      const csvHeaders = [
        'Patient ID',
        'First Name',
        'Last Name', 
        'Phone',
        'Age',
        'Date of Birth',
        'Address',
        'Total Visits',
        'Completed Visits',
        'Cancelled Visits',
        'First Visit',
        'Last Visit',
        'Patient Since'
      ];

      const csvRows = patients.map(p => [
        `P${p.patient_id.toString().padStart(4, '0')}`,
        p.fname,
        p.lname,
        p.phone || '',
        p.age || '',
        p.dob ? new Date(p.dob).toLocaleDateString('en-GB') : '',
        p.address || '',
        p.total_visits,
        p.completed_visits,
        p.cancelled_visits,
        p.first_visit ? new Date(p.first_visit).toLocaleDateString('en-GB') : '',
        p.last_visit ? new Date(p.last_visit).toLocaleDateString('en-GB') : '',
        p.created_at ? new Date(p.created_at).toLocaleDateString('en-GB') : ''
      ]);

      const csvContent = [
        csvHeaders.join(','),
        ...csvRows.map(row => row.map(field => `"${field}"`).join(','))
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="patients_${dentist.fname}_${dentist.lname}_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvContent);
    } else {
      // ส่งเป็น JSON
      res.json({
        success: true,
        data: patients,
        exportDate: new Date().toISOString(),
        dentist: `Dr. ${dentist.fname} ${dentist.lname}`,
        totalPatients: patients.length
      });
    }

  } catch (error) {
    console.error('Error in exportPatientsData:', error);
    res.status(500).json({ 
      success: false, 
      error: 'เกิดข้อผิดพลาดในการส่งออกข้อมูล' 
    });
  }
},
  // รายละเอียดผู้ป่วย
  getPatientDetail: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const patientId = req.params.id;

    // ดึงข้อมูลหมอพร้อมข้อมูล user
    const [dentistResult] = await db.execute(`
      SELECT d.*, u.email, u.username 
      FROM dentist d 
      JOIN user u ON d.user_id = u.user_id 
      WHERE d.user_id = ?
    `, [userId]);

    if (dentistResult.length === 0) return res.redirect('/login');
    
    const dentist = dentistResult[0];
    const dentistId = dentist.dentist_id;

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
      dentist: dentist,  // เพิ่มบรรทัดนี้
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

      res.render('dentist/schedule-monthly', { 
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

getEditProfile: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;

    const [dentistResult] = await db.execute(`
      SELECT d.*, u.email, u.username 
      FROM dentist d 
      JOIN user u ON d.user_id = u.user_id 
      WHERE d.user_id = ?
    `, [userId]);

    if (dentistResult.length === 0) return res.redirect('/login');

    res.render('dentist/edit-profile', { 
      dentist: dentistResult[0],
      message: req.query.message || null,
      messageType: req.query.type || 'success'
    });
  } catch (error) {
    console.error('Error in getEditProfile:', error);
    res.status(500).render('error', { 
      message: 'เกิดข้อผิดพลาดในการโหลดหน้าแก้ไขโปรไฟล์',
      error 
    });
  }
},
  // หน้าประวัติ
getHistory: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;

    const [dentistResult] = await db.execute(`
      SELECT d.*, u.email, u.username 
      FROM dentist d 
      JOIN user u ON d.user_id = u.user_id 
      WHERE d.user_id = ?
    `, [userId]);

    if (dentistResult.length === 0) return res.redirect('/login');

    const dentist = dentistResult[0];
    const dentistId = dentist.dentist_id;

    // ดึงประวัติการรักษาทั้งหมด
    const [treatmentHistory] = await db.execute(`
      SELECT 
        q.queue_id,
        q.time,
        q.queue_status,
        q.diagnosis,
        q.next_appointment,
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
      WHERE q.dentist_id = ?
      ORDER BY q.time DESC
    `, [dentistId]);

    // คำนวณสถิติ
    const uniquePatients = new Set(treatmentHistory.map(item => item.patient_id)).size;
    
    const mappedHistory = treatmentHistory.map(item => ({
      ...item,
      age: item.age || 0
    }));

    const completed = mappedHistory.filter(item => item.queue_status === 'completed').length;
    const pending = mappedHistory.filter(item => item.queue_status === 'pending').length;
    const confirm = mappedHistory.filter(item => item.queue_status === 'confirm').length;
    const cancelled = mappedHistory.filter(item => item.queue_status === 'cancel').length;

    const stats = {
      uniquePatients: uniquePatients,
      total: mappedHistory.length,
      completed: completed,
      pending: pending + confirm, // รวม pending และ confirm เป็นรอรักษา
      cancelled: cancelled
    };

    res.render('dentist/history', { 
      dentist: dentist,
      treatmentHistory: mappedHistory,
      patientHistory: mappedHistory,
      history: mappedHistory,
      stats: stats
    });
    
  } catch (error) {
    console.error('Error in getHistory:', error);
    res.status(500).render('error', { 
      message: 'เกิดข้อผิดพลาดในการโหลดประวัติ',
      error 
    });
  }
},


getAddHistoryPage: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const queueId = req.params.queueId || req.query.queueId;

    // ตรวจสอบสิทธิ์หมอ
    const [dentistResult] = await db.execute(`
      SELECT d.*, u.email, u.username 
      FROM dentist d 
      JOIN user u ON d.user_id = u.user_id 
      WHERE d.user_id = ?
    `, [userId]);

    if (dentistResult.length === 0) {
      return res.redirect('/login');
    }

    const dentist = dentistResult[0];
    let appointment = null;

    // ถ้ามี queueId ให้ดึงข้อมูลการจอง
    if (queueId) {
      const [appointmentResult] = await db.execute(`
        SELECT 
          q.queue_id,
          q.patient_id,
          q.time,
          q.diagnosis,
          q.next_appointment,
          q.queue_status,
          p.fname,
          p.lname,
          p.phone,
          p.dob,
          t.treatment_name,
          t.duration,
          d.dentist_id
        FROM queue q
        JOIN patient p ON q.patient_id = p.patient_id
        JOIN treatment t ON q.treatment_id = t.treatment_id
        JOIN dentist d ON q.dentist_id = d.dentist_id
        WHERE q.queue_id = ? AND d.user_id = ?
      `, [queueId, userId]);

      if (appointmentResult.length > 0) {
        appointment = appointmentResult[0];
      }
    }

    res.render('dentist/add-history', { 
      dentist,
      appointment,
      title: 'เพิ่มประวัติการรักษา'
    });

  } catch (error) {
    console.error('Error in getAddHistoryPage:', error);
    res.status(500).render('error', { 
      message: 'เกิดข้อผิดพลาดในการโหลดหน้าเพิ่มประวัติการรักษา',
      error 
    });
  }
},
  
//   // Patient History page (render the HTML page)
// getPatientHistory: async (req, res) => {
//   try {
//     const userId = req.session.user?.user_id || req.session.userId;
    
//     const [dentistResult] = await db.execute(`
//       SELECT d.*, u.email, u.username 
//       FROM dentist d 
//       JOIN user u ON d.user_id = u.user_id 
//       WHERE d.user_id = ?
//     `, [userId]);

//     if (dentistResult.length === 0) {
//       return res.redirect('/login');
//     }

//     const dentist = dentistResult[0];
//     res.render('dentist/patient-history', { 
//       dentist,
//       title: 'Patient History'
//     });
//   } catch (error) {
//     console.error('Error in getPatientHistory:', error);
//     res.status(500).render('error', { 
//       message: 'เกิดข้อผิดพลาดในการโหลดประวัติผู้ป่วย',
//       error 
//     });
//   }
// },

// API to get patient history data  
getPatientHistoryAPI: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    
    const [dentistResult] = await db.execute(`
      SELECT dentist_id FROM dentist WHERE user_id = ?
    `, [userId]);

    if (dentistResult.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Dentist not found' 
      });
    }

    const dentistId = dentistResult[0].dentist_id;

    const [historyResult] = await db.execute(`
      SELECT 
        q.queue_id,
        q.time,
        q.queue_status,
        q.diagnosis,
        q.next_appointment,
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
      WHERE q.dentist_id = ?
      ORDER BY q.time DESC
    `, [dentistId]);

    const totalPatients = new Set(historyResult.map(record => record.patient_id)).size;
    const completedCount = historyResult.filter(record => record.queue_status === 'completed').length;
    const pendingCount = historyResult.filter(record => record.queue_status === 'pending').length;
    const cancelledCount = historyResult.filter(record => record.queue_status === 'cancel').length;

    const formattedHistory = historyResult.map(record => ({
      ...record,
      age: record.age || 0,
      formattedDate: new Date(record.time).toLocaleDateString('en-GB'),
      formattedTime: new Date(record.time).toLocaleTimeString('en-GB', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      }),
      statusText: getStatusDisplayText(record.queue_status)
    }));

    res.json({
      success: true,
      history: formattedHistory,
      stats: {
        totalPatients,
        totalRecords: historyResult.length,
        completed: completedCount,
        pending: pendingCount,
        cancelled: cancelledCount
      }
    });

  } catch (error) {
    console.error('Error in getPatientHistoryAPI:', error);
    res.status(500).json({ 
      success: false, 
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลประวัติผู้ป่วย' 
    });
  }
},

// Get detailed patient history for a specific patient
getPatientDetailedHistory: async (req, res) => {
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

    const [patientResult] = await db.execute(`
      SELECT * FROM patient WHERE patient_id = ?
    `, [patientId]);

    if (patientResult.length === 0) {
      return res.status(404).json({ success: false, error: 'Patient not found' });
    }

    const [appointmentsResult] = await db.execute(`
      SELECT 
        q.*,
        t.treatment_name,
        t.duration,
        th.diagnosis as history_diagnosis,
        th.followUpdate
      FROM queue q
      JOIN treatment t ON q.treatment_id = t.treatment_id
      LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      LEFT JOIN treatmentHistory th ON qd.queuedetail_id = th.queuedetail_id
      WHERE q.patient_id = ? AND q.dentist_id = ?
      ORDER BY q.time DESC
    `, [patientId, dentistId]);

    res.json({
      success: true,
      patient: {
        ...patientResult[0],
        age: patientResult[0].dob ? 
          Math.floor((Date.now() - new Date(patientResult[0].dob)) / (365.25 * 24 * 60 * 60 * 1000)) : 
          null
      },
      appointments: appointmentsResult
    });

  } catch (error) {
    console.error('Error in getPatientDetailedHistory:', error);
    res.status(500).json({ 
      success: false, 
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลประวัติผู้ป่วย' 
    });
  }
},



// Search patient history
searchPatientHistory: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const { query, status, dateFrom, dateTo } = req.query;

    const [dentistResult] = await db.execute(`
      SELECT dentist_id FROM dentist WHERE user_id = ?
    `, [userId]);

    if (dentistResult.length === 0) {
      return res.status(404).json({ success: false, error: 'Dentist not found' });
    }

    const dentistId = dentistResult[0].dentist_id;

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

    const [searchResult] = await db.execute(`
      SELECT 
        q.queue_id,
        q.time,
        q.queue_status,
        q.diagnosis,
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
      ${whereClause}
      ORDER BY q.time DESC
      LIMIT 100
    `, params);

    res.json({
      success: true,
      results: searchResult.map(record => ({
        ...record,
        age: record.age || 0,
        formattedDate: new Date(record.time).toLocaleDateString('en-GB'),
        formattedTime: new Date(record.time).toLocaleTimeString('en-GB', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false 
        })
      }))
    });

  } catch (error) {
    console.error('Error in searchPatientHistory:', error);
    res.status(500).json({ 
      success: false, 
      error: 'เกิดข้อผิดพลาดในการค้นหาประวัติผู้ป่วย' 
    });
  }
},

  // หน้าโปรไฟล์
 getProfile: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;

    // ดึงข้อมูลทันตแพทย์พร้อมข้อมูล user
    const [dentistResult] = await db.execute(`
      SELECT 
        d.*, 
        u.email, 
        u.username, 
        u.last_login,
        DATE_FORMAT(d.dob, '%Y-%m-%d') as formatted_dob
      FROM dentist d 
      JOIN user u ON d.user_id = u.user_id 
      WHERE d.user_id = ?
    `, [userId]);

    if (dentistResult.length === 0) {
      return res.redirect('/login');
    }

    const dentist = dentistResult[0];

    res.render('dentist/profile', { 
      dentist: dentist,
      title: 'My Profile'
    });
  } catch (error) {
    console.error('Error in getProfile:', error);
    res.status(500).render('error', { 
      message: 'เกิดข้อผิดพลาดในการโหลดโปรไฟล์',
      error 
    });
  }
},

  // อัพเดทโปรไฟล์
 // อัพเดทโปรไฟล์
updateProfile: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    
    // รับข้อมูลจาก form
    const { 
      fname, lname, id_card, license_no, email,
      phone, specialty, address, education, dob 
    } = req.body;

    // Validation - ตรวจสอบข้อมูลที่จำเป็น
    if (!fname || !fname.trim()) {
      return res.status(400).json({ success: false, error: 'กรุณากรอกชื่อ' });
    }
    if (!lname || !lname.trim()) {
      return res.status(400).json({ success: false, error: 'กรุณากรอกนามสกุล' });
    }
    if (!id_card || !id_card.trim()) {
      return res.status(400).json({ success: false, error: 'กรุณากรอกเลขบัตรประชาชน' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, error: 'กรุณากรอกอีเมล' });
    }

    // ตรวจสอบรูปแบบเลขบัตรประชาชน (13 หลัก)
    if (!/^\d{13}$/.test(id_card)) {
      return res.status(400).json({ 
        success: false, 
        error: 'เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก' 
      });
    }

    // ตรวจสอบรูปแบบอีเมล
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        success: false, 
        error: 'รูปแบบอีเมลไม่ถูกต้อง' 
      });
    }

    // ตรวจสอบว่าอีเมลซ้ำกับผู้ใช้คนอื่นหรือไม่
    const [emailCheck] = await db.execute(`
      SELECT user_id FROM user WHERE email = ? AND user_id != ?
    `, [email.trim(), userId]);

    if (emailCheck.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'อีเมลนี้ถูกใช้งานแล้ว' 
      });
    }

    // ตรวจสอบว่าเลขบัตรประชาชนซ้ำกับคนอื่นหรือไม่
    const [idCardCheck] = await db.execute(`
      SELECT dentist_id FROM dentist WHERE id_card = ? AND user_id != ?
    `, [id_card.trim(), userId]);

    if (idCardCheck.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'เลขบัตรประชาชนนี้ถูกใช้งานแล้ว' 
      });
    }

    // แปลง undefined เป็น null
    const dobValue = dob && dob.trim() !== '' ? dob : null;
    const phoneValue = phone && phone.trim() !== '' ? phone : null;
    const specialtyValue = specialty && specialty.trim() !== '' ? specialty : null;
    const addressValue = address && address.trim() !== '' ? address : null;
    const educationValue = education && education.trim() !== '' ? education : null;
    const licenseNoValue = license_no && license_no.trim() !== '' ? license_no : null;

    // จัดการไฟล์รูปภาพ (ถ้ามี)
    let photoFilename = null;
    if (req.file) {
      photoFilename = req.file.filename;
    }

    // อัพเดตข้อมูลในตาราง user
    await db.execute(`
      UPDATE user 
      SET email = ?
      WHERE user_id = ?
    `, [email.trim(), userId]);

    // อัพเดตข้อมูลในตาราง dentist
    let updateQuery = `
      UPDATE dentist 
      SET fname = ?, 
          lname = ?, 
          id_card = ?, 
          license_no = ?,
          phone = ?, 
          specialty = ?, 
          address = ?, 
          education = ?, 
          dob = ?
    `;
    
    const updateParams = [
      fname.trim(), 
      lname.trim(), 
      id_card.trim(), 
      licenseNoValue,
      phoneValue, 
      specialtyValue, 
      addressValue, 
      educationValue, 
      dobValue
    ];

    // ถ้ามีการอัพโหลดรูปใหม่
    if (photoFilename) {
      updateQuery += `, photo = ?`;
      updateParams.push(photoFilename);
    }

    updateQuery += ` WHERE user_id = ?`;
    updateParams.push(userId);

    await db.execute(updateQuery, updateParams);

    // อัพเดต session ถ้ามีการเปลี่ยน email
    if (req.session.user) {
      req.session.user.email = email.trim();
    }

    res.json({ 
      success: true, 
      message: 'อัพเดตโปรไฟล์เรียบร้อยแล้ว' 
    });

  } catch (error) {
    console.error('Error in updateProfile:', error);
    res.status(500).json({ 
      success: false, 
      error: 'เกิดข้อผิดพลาดในการอัพเดตโปรไฟล์' 
    });
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

    // ตรวจสอบรหัสผ่านเดิม
    const [userResult] = await db.execute(`SELECT password FROM user WHERE user_id = ?`, [userId]);
    
    if (userResult.length === 0) {
      return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลผู้ใช้' });
    }

    // ใช้ bcrypt เปรียบเทียบรหัสผ่านเดิม
    const bcrypt = require('bcrypt');
    const isValidPassword = await bcrypt.compare(currentPassword, userResult[0].password);
    if (!isValidPassword) {
      return res.status(400).json({ success: false, error: 'รหัสผ่านเดิมไม่ถูกต้อง' });
    }

    // Hash รหัสผ่านใหม่
    const saltRounds = 10;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // อัพเดทรหัสผ่านใหม่
    await db.execute(`UPDATE user SET password = ? WHERE user_id = ?`, [hashedNewPassword, userId]);

    res.json({ success: true, message: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว' });
  } catch (error) {
    console.error('Error in updatePassword:', error);
    res.status(500).json({ success: false, error: 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน' });
  }
},


getChangePassword: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;

    const [dentistResult] = await db.execute(`
      SELECT d.*, u.email, u.username 
      FROM dentist d 
      JOIN user u ON d.user_id = u.user_id 
      WHERE d.user_id = ?
    `, [userId]);

    if (dentistResult.length === 0) return res.redirect('/login');

    res.render('dentist/change-password', { dentist: dentistResult[0] });
  } catch (error) {
    console.error('Error in getChangePassword:', error);
    res.status(500).render('error', { 
      message: 'เกิดข้อผิดพลาดในการโหลดหน้าเปลี่ยนรหัสผ่าน',
      error 
    });
  }
},

// อัพเดทอีเมล
updateEmail: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const { newEmail, confirmEmail, password } = req.body;

    console.log('Update email request:', { userId, newEmail, confirmEmail });

    // Validation
    if (!newEmail || !confirmEmail || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'All fields are required' 
      });
    }

    if (newEmail !== confirmEmail) {
      return res.status(400).json({ 
        success: false, 
        error: 'New email addresses do not match' 
      });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Please enter a valid email address' 
      });
    }

    // ตรวจสอบรหัสผ่านปัจจุบัน
    const [userResult] = await db.execute(`
      SELECT password FROM user WHERE user_id = ?
    `, [userId]);
    
    if (userResult.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    // ใช้ bcrypt เปรียบเทียบรหัสผ่าน
    const bcrypt = require('bcrypt');
    const isValidPassword = await bcrypt.compare(password, userResult[0].password);
    if (!isValidPassword) {
      return res.status(400).json({ 
        success: false, 
        error: 'Current password is incorrect' 
      });
    }

    // ตรวจสอบว่าอีเมลใหม่มีผู้ใช้แล้วหรือไม่
    const [existingUser] = await db.execute(`
      SELECT user_id FROM user WHERE email = ? AND user_id != ?
    `, [newEmail, userId]);

    if (existingUser.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'This email address is already in use' 
      });
    }

    // อัพเดทอีเมล
    await db.execute(`
      UPDATE user SET email = ? WHERE user_id = ?
    `, [newEmail, userId]);

    console.log('Email updated successfully for user:', userId);

    res.json({ 
      success: true, 
      message: 'Email updated successfully. Please check your inbox for confirmation.' 
    });

  } catch (error) {
    console.error('Error in updateEmail:', error);
    res.status(500).json({ 
      success: false, 
      error: 'เกิดข้อผิดพลาดในการอัพเดทอีเมล' 
    });
  }
},

// ดึงการจองล่าสุดของผู้ป่วยกับหมอคนนี้
getLatestPatientAppointment: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const patientId = req.params.patientId;

    // ตรวจสอบสิทธิ์หมอ
    const [dentistResult] = await db.execute(`
      SELECT dentist_id FROM dentist WHERE user_id = ?
    `, [userId]);

    if (dentistResult.length === 0) {
      return res.status(404).json({ success: false, error: 'Dentist not found' });
    }

    const dentistId = dentistResult[0].dentist_id;

    // ดึงข้อมูลผู้ป่วย
    const [patientResult] = await db.execute(`
      SELECT * FROM patient WHERE patient_id = ?
    `, [patientId]);

    if (patientResult.length === 0) {
      return res.status(404).json({ success: false, error: 'Patient not found' });
    }

    // ดึงการจองล่าสุดที่ยังไม่ได้บันทึกประวัติ หรือทั้งหมดถ้าไม่มี
    const [latestAppointment] = await db.execute(`
      SELECT 
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
      LIMIT 1
    `, [patientId, dentistId]);

    if (latestAppointment.length === 0) {
      // หาการจองล่าสุดไม่ว่าสถานะ
      const [anyAppointment] = await db.execute(`
        SELECT 
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
        LIMIT 1
      `, [patientId, dentistId]);

      if (anyAppointment.length === 0) {
        return res.status(404).json({ 
          success: false, 
          error: 'No appointments found for this patient' 
        });
      }

      return res.json({
        success: true,
        appointment: anyAppointment[0],
        patient: patientResult[0],
        isCompleted: true // การจองนี้เสร็จแล้ว
      });
    }

    // ดึงรายการ treatment ทั้งหมดสำหรับ dropdown
    const [treatments] = await db.execute(`
      SELECT treatment_id, treatment_name, duration FROM treatment ORDER BY treatment_name
    `);

    res.json({
      success: true,
      appointment: latestAppointment[0],
      patient: patientResult[0],
      treatments: treatments,
      isCompleted: false
    });

  } catch (error) {
    console.error('Error in getLatestPatientAppointment:', error);
    res.status(500).json({ 
      success: false, 
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลการจอง' 
    });
  }
},

// สร้างประวัติการรักษาใหม่
createTreatmentHistory: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const { 
      patientId, 
      treatmentId, 
      appointmentDate, 
      diagnosis, 
      treatmentNotes,
      followUpDate,
      recommendations,
      prescriptions
    } = req.body;

    // Validation
    if (!patientId || !treatmentId || !appointmentDate || !diagnosis) {
      return res.status(400).json({ 
        success: false, 
        error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' 
      });
    }

    // ตรวจสอบสิทธิ์หมอ
    const [dentistResult] = await db.execute(`
  SELECT dentist_id, fname, lname, photo FROM dentist WHERE user_id = ?
`, [userId]);

    if (dentistResult.length === 0) {
      return res.status(404).json({ success: false, error: 'Dentist not found' });
    }

    const dentist = dentistResult[0];
    const dentistId = dentist.dentist_id;

    // ตรวจสอบว่าผู้ป่วยมีอยู่จริง
    const [patientCheck] = await db.execute(`
      SELECT patient_id FROM patient WHERE patient_id = ?
    `, [patientId]);

    if (patientCheck.length === 0) {
      return res.status(404).json({ success: false, error: 'Patient not found' });
    }

    // สร้างการจองใหม่ใน queue table
    const [insertResult] = await db.execute(`
      INSERT INTO queue (
        patient_id, 
        dentist_id, 
        treatment_id, 
        time, 
        queue_status, 
        diagnosis, 
        next_appointment
      ) VALUES (?, ?, ?, ?, 'confirm', ?, ?)
    `, [
      patientId, 
      dentistId, 
      treatmentId, 
      appointmentDate,
      diagnosis,
      followUpDate || null
    ]);

    const queueId = insertResult.insertId;

    // สร้าง queuedetail ถ้าต้องการ
    const [queueDetailResult] = await db.execute(`
      INSERT INTO queuedetail (queue_id) VALUES (?)
    `, [queueId]);

    const queuedetailId = queueDetailResult.insertId;

    // บันทึกประวัติการรักษาใน treatmentHistory table
    await db.execute(`
      INSERT INTO treatmentHistory (
        queuedetail_id, 
        diagnosis, 
        followUpdate
      ) VALUES (?, ?, ?)
    `, [
      queuedetailId, 
      diagnosis,
      JSON.stringify({
        treatmentNotes: treatmentNotes || '',
        recommendations: recommendations || '',
        prescriptions: prescriptions || '',
        createdAt: new Date().toISOString(),
        dentist: `${dentist.fname} ${dentist.lname}`
      })
    ]);

    // อัพเดท queuedetail ด้วย queuedetail_id
    await db.execute(`
      UPDATE queue SET queuedetail_id = ? WHERE queue_id = ?
    `, [queuedetailId, queueId]);

    res.json({ 
      success: true, 
      message: 'บันทึกประวัติการรักษาเรียบร้อยแล้ว',
      queueId: queueId
    });

  } catch (error) {
    console.error('Error in createTreatmentHistory:', error);
    res.status(500).json({ 
      success: false, 
      error: 'เกิดข้อผิดพลาดในการบันทึกประวัติการรักษา' 
    });
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
        AND q.queue_status IN ('pending', 'confirm')
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
        AND q.queue_status IN ('pending', 'confirm')
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
      FROM queue WHERE dentist_id = ? AND DATE(time) = CURDATE() AND queue_status IN ('pending', 'confirm')
    `, [dentistId]);

    const [totalPatients] = await db.execute(`
      SELECT COUNT(DISTINCT patient_id) as count FROM queue WHERE dentist_id = ?
    `, [dentistId]);

    const [cancelled] = await db.execute(`
      SELECT COUNT(*) as count FROM queue WHERE dentist_id = ? AND queue_status = 'cancel'
    `, [dentistId]);

    const [completed] = await db.execute(`
      SELECT COUNT(*) as count FROM queue 
      WHERE dentist_id = ? AND queue_status = 'confirm' AND time < NOW()
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
        AND q.queue_status IN ('pending', 'confirm')
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

    await db.execute(`UPDATE queue SET queue_status = 'confirm' WHERE queue_id = ?`, [queueId]);

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

    // เปลี่ยนเป็น completed แทน confirm
    let updateQuery = `UPDATE queue SET queue_status = ?`;
    const params = ['completed']; // เปลี่ยนจาก 'confirm' เป็น 'completed'

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
// API: ดึงรายละเอียดประวัติการรักษาตาม queue_id
// เพิ่มในส่วนท้ายของ dentistController object
getTreatmentHistoryDetail: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const queueId = req.params.queueId;

    const [dentistResult] = await db.execute(`
      SELECT dentist_id, fname, lname, photo FROM dentist WHERE user_id = ?
    `, [userId]);

    if (dentistResult.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'ไม่พบข้อมูลทันตแพทย์' 
      });
    }

    const dentist = dentistResult[0];
    const dentistId = dentist.dentist_id;

    const [treatmentResult] = await db.execute(`
      SELECT 
        q.queue_id,
        q.time,
        q.queue_status,
        q.diagnosis,
        q.next_appointment,
        p.patient_id,
        p.fname as patient_fname,
        p.lname as patient_lname,
        p.phone,
        p.dob,
        p.address,
        p.id_card,
        p.gender,
        p.chronic_disease,
        p.allergy_history,
        t.treatment_name,
        t.duration,
        d.fname as dentist_fname,
        d.lname as dentist_lname,
        TIMESTAMPDIFF(YEAR, p.dob, CURDATE()) as age
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      WHERE q.queue_id = ? AND q.dentist_id = ?
    `, [queueId, dentistId]);

    if (treatmentResult.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'ไม่พบข้อมูลประวัติการรักษา' 
      });
    }

    const treatment = treatmentResult[0];

    res.json({
      success: true,
      treatment: {
        ...treatment,
        // แปลง 'confirm' เป็น 'completed' ถ้าต้องการ
        queue_status: treatment.queue_status === 'confirm' ? 'completed' : treatment.queue_status
      }
    });

  } catch (error) {
    console.error('Error in getTreatmentHistoryDetail:', error);
    res.status(500).json({ 
      success: false, 
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลประวัติการรักษา' 
    });
  }
},

getTreatmentHistoryPage: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const queueId = req.params.queueId;
    
    const [dentistResult] = await db.execute(`
      SELECT d.*, u.email, u.username 
      FROM dentist d 
      JOIN user u ON d.user_id = u.user_id 
      WHERE d.user_id = ?
    `, [userId]);

    if (dentistResult.length === 0) {
      return res.redirect('/login');
    }

    const dentist = dentistResult[0];
    
    res.render('dentist/treatment-history-detail', { 
      dentist,
      queueId, // ส่ง queueId ไปด้วย
      title: 'Treatment History Detail'
    });
  } catch (error) {
    console.error('Error in getTreatmentHistoryPage:', error);
    res.status(500).render('error', { 
      message: 'เกิดข้อผิดพลาดในการโหลดหน้าประวัติการรักษา',
      error 
    });
  }
},
  // API: เพิ่มประวัติการรักษา
addTreatmentHistory: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const { queueId, patientId, diagnosis, nextAppointment } = req.body;

    // Validation
    if (!queueId || !diagnosis || !diagnosis.trim()) {
      return res.status(400).json({ 
        success: false, 
        error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' 
      });
    }

    // ตรวจสอบสิทธิ์หมอ
    const [dentistResult] = await db.execute(`
      SELECT dentist_id FROM dentist WHERE user_id = ?
    `, [userId]);

    if (dentistResult.length === 0) {
      return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลทันตแพทย์' });
    }

    const dentistId = dentistResult[0].dentist_id;

    // ตรวจสอบการจองและสิทธิ์
    const [appointmentCheck] = await db.execute(`
      SELECT q.queue_id, q.queue_status, qd.queuedetail_id
      FROM queue q
      LEFT JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      WHERE q.queue_id = ? AND q.dentist_id = ?
    `, [queueId, dentistId]);

    if (appointmentCheck.length === 0) {
      return res.status(403).json({ 
        success: false, 
        error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลการจองนี้' 
      });
    }

    const queuedetailId = appointmentCheck[0].queuedetail_id;

    // เริ่ม transaction
    await db.query('START TRANSACTION');

    try {
      // อัพเดทสถานะเป็น 'completed' และข้อมูลการวินิจฉัย
      await db.execute(`
        UPDATE queue 
        SET queue_status = 'completed', 
            diagnosis = ?, 
            next_appointment = ?
        WHERE queue_id = ?
      `, [diagnosis.trim(), nextAppointment?.trim() || null, queueId]);

      // บันทึกประวัติใน treatmentHistory
      if (queuedetailId) {
        const [existingHistory] = await db.execute(`
          SELECT tmh_id FROM treatmentHistory WHERE queuedetail_id = ?
        `, [queuedetailId]);

        if (existingHistory.length > 0) {
          // อัพเดทประวัติที่มีอยู่
          await db.execute(`
            UPDATE treatmentHistory 
            SET diagnosis = ?, followUpdate = ?
            WHERE queuedetail_id = ?
          `, [diagnosis.trim(), nextAppointment?.trim() || '', queuedetailId]);
        } else {
          // เพิ่มประวัติใหม่
          await db.execute(`
            INSERT INTO treatmentHistory (queuedetail_id, diagnosis, followUpdate)
            VALUES (?, ?, ?)
          `, [queuedetailId, diagnosis.trim(), nextAppointment?.trim() || '']);
        }
      }

      // Commit transaction
      await db.query('COMMIT');

      res.json({ 
        success: true, 
        message: 'บันทึกประวัติการรักษาเรียบร้อยแล้ว',
        queueId: queueId
      });

    } catch (error) {
      // Rollback transaction
      await db.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error in addTreatmentHistory:', error);
    res.status(500).json({ 
      success: false, 
      error: 'เกิดข้อผิดพลาดในการบันทึกประวัติการรักษา' 
    });
  }
},
getAppointmentForHistory: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const { patientId } = req.params;

    // ตรวจสอบสิทธิ์หมอ
    const [dentistResult] = await db.execute(`
      SELECT dentist_id FROM dentist WHERE user_id = ?
    `, [userId]);

    if (dentistResult.length === 0) {
      return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลทันตแพทย์' });
    }

    const dentistId = dentistResult[0].dentist_id;

    // ดึงการจองล่าสุดที่ยังไม่ได้บันทึกประวัติ
    const [appointments] = await db.execute(`
      SELECT 
        q.queue_id,
        q.patient_id,
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
      WHERE q.patient_id = ? 
        AND q.dentist_id = ?
        AND q.queue_status IN ('pending', 'confirm')
      ORDER BY q.time DESC
      LIMIT 5
    `, [patientId, dentistId]);

    res.json({
      success: true,
      appointments: appointments.map(apt => ({
        ...apt,
        formattedDate: new Date(apt.time).toLocaleDateString('th-TH', {
          day: '2-digit',
          month: '2-digit', 
          year: 'numeric'
        }),
        formattedTime: new Date(apt.time).toLocaleTimeString('th-TH', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }),
        statusText: apt.queue_status === 'confirm' ? 'เสร็จสิ้น' : 
                   apt.queue_status === 'pending' ? 'รอการรักษา' : 'ยกเลิก'
      }))
    });

  } catch (error) {
    console.error('Error in getAppointmentForHistory:', error);
    res.status(500).json({ 
      success: false, 
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูลการจอง' 
    });
  }
},
  // ฟังก์ชัน API อื่นๆ ที่เหลือ (สำหรับให้ครบตาม routes)
  // API: บันทึกตารางเวลา
saveSchedule: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const { date, day, status, startTime, endTime, note } = req.body;

    // ตรวจสอบข้อมูลที่จำเป็น
    if (!date || !day || !status) {
      return res.status(400).json({ 
        success: false, 
        error: 'ข้อมูลไม่ครบถ้วน' 
      });
    }

    // ตรวจสอบสิทธิ์หมอ
    const [dentistResult] = await db.execute(`
      SELECT dentist_id FROM dentist WHERE user_id = ?
    `, [userId]);

    if (dentistResult.length === 0) {
      return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลทันตแพทย์' });
    }

    const dentistId = dentistResult[0].dentist_id;
    const scheduleDate = new Date(date);
    const dayOfWeek = scheduleDate.getDay();

    // ลบตารางเวลาเก่าของวันนี้ก่อน
    await db.execute(`
      DELETE FROM dentist_schedule 
      WHERE dentist_id = ? AND schedule_date = ?
    `, [dentistId, scheduleDate.toISOString().split('T')[0]]);

    if (status === 'dayoff') {
      // บันทึกวันหยุด
      await db.execute(`
        INSERT INTO dentist_schedule 
        (dentist_id, schedule_date, day_of_week, hour, status, start_time, end_time, note)
        VALUES (?, ?, ?, 0, 'dayoff', '00:00:00', '23:59:59', ?)
      `, [dentistId, scheduleDate.toISOString().split('T')[0], dayOfWeek, note || '']);
    } else {
      // บันทึกชั่วโมงทำงาน
      if (!startTime || !endTime) {
        return res.status(400).json({ 
          success: false, 
          error: 'กรุณากำหนดเวลาเริ่มต้นและสิ้นสุด' 
        });
      }

      const startHour = parseInt(startTime.split(':')[0]);
      const endHour = parseInt(endTime.split(':')[0]);

      // สร้าง records สำหรับแต่ละชั่วโมง
      for (let hour = startHour; hour < endHour; hour++) {
        const hourStartTime = `${hour.toString().padStart(2, '0')}:00:00`;
        const hourEndTime = `${(hour + 1).toString().padStart(2, '0')}:00:00`;

        await db.execute(`
          INSERT INTO dentist_schedule 
          (dentist_id, schedule_date, day_of_week, hour, status, start_time, end_time, note)
          VALUES (?, ?, ?, ?, 'working', ?, ?, ?)
        `, [
          dentistId, 
          scheduleDate.toISOString().split('T')[0], 
          dayOfWeek, 
          hour, 
          hourStartTime, 
          hourEndTime, 
          note || ''
        ]);
      }
    }

    res.json({ 
      success: true, 
      message: status === 'dayoff' ? 'บันทึกวันหยุดเรียบร้อยแล้ว' : 'บันทึกตารางเวลาเรียบร้อยแล้ว' 
    });

  } catch (error) {
    console.error('Error saving schedule:', error);
    res.status(500).json({ 
      success: false, 
      error: 'เกิดข้อผิดพลาดในการบันทึกตารางเวลา' 
    });
  }
},

 // API: โหลดตารางเวลา

// ฟังก์ชันโหลดตารางงาน
loadSchedule: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const { startDate, endDate } = req.query;

    // ตรวจสอบสิทธิ์หมอ
    const [dentistResult] = await db.execute(`
      SELECT dentist_id FROM dentist WHERE user_id = ?
    `, [userId]);

    if (dentistResult.length === 0) {
      return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลทันตแพทย์' });
    }

    const dentistId = dentistResult[0].dentist_id;

    // ดึงตารางเวลาจากฐานข้อมูล
    const [scheduleResult] = await db.execute(`
      SELECT 
        schedule_id,
        DATE_FORMAT(schedule_date, '%Y-%m-%d') as schedule_date,
        day_of_week,
        hour,
        status,
        TIME_FORMAT(start_time, '%H:%i') as start_time,
        TIME_FORMAT(end_time, '%H:%i') as end_time,
        note,
        created_at
      FROM dentist_schedule
      WHERE dentist_id = ? 
        AND schedule_date BETWEEN ? AND ?
      ORDER BY schedule_date, hour
    `, [dentistId, startDate, endDate]);

    res.json({ 
      success: true, 
      schedules: scheduleResult 
    });

  } catch (error) {
    console.error('Error loading schedule:', error);
    res.status(500).json({ 
      success: false, 
      error: 'เกิดข้อผิดพลาดในการโหลดตารางเวลา' 
    });
  }
},

 // API: ลบตารางเวลา
deleteSchedule: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const { date, hour } = req.body;

    // ตรวจสอบสิทธิ์หมอ
    const [dentistResult] = await db.execute(`
      SELECT dentist_id FROM dentist WHERE user_id = ?
    `, [userId]);

    if (dentistResult.length === 0) {
      return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลทันตแพทย์' });
    }

    const dentistId = dentistResult[0].dentist_id;

    // ตรวจสอบว่ามีนัดหมายในช่วงเวลานั้นหรือไม่
    const [appointmentCheck] = await db.execute(`
      SELECT COUNT(*) as count
      FROM queue
      WHERE dentist_id = ? 
        AND DATE(time) = ? 
        AND HOUR(time) = ?
        AND queue_status IN ('pending', 'confirm')
    `, [dentistId, date, hour]);

    if (appointmentCheck[0].count > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'ไม่สามารถลบได้ เนื่องจากมีนัดหมายในช่วงเวลานี้' 
      });
    }

    // ลบตารางเวลา
    await db.execute(`
      DELETE FROM dentist_schedule
      WHERE dentist_id = ? 
        AND schedule_date = ? 
        AND (hour = ? OR status = 'dayoff')
    `, [dentistId, date, hour]);

    res.json({ 
      success: true, 
      message: 'ลบตารางเวลาเรียบร้อยแล้ว' 
    });

  } catch (error) {
    console.error('Error deleting schedule:', error);
    res.status(500).json({ 
      success: false, 
      error: 'เกิดข้อผิดพลาดในการลบตารางเวลา' 
    });
  }
},

 getAvailableSlots: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ 
        success: false, 
        error: 'กรุณาระบุวันที่' 
      });
    }

    // ตรวจสอบสิทธิ์หมอ
    const [dentistResult] = await db.execute(`
      SELECT dentist_id FROM dentist WHERE user_id = ?
    `, [userId]);

    if (dentistResult.length === 0) {
      return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลทันตแพทย์' });
    }

    const dentistId = dentistResult[0].dentist_id;

    // ใช้ stored procedure ที่มีอยู่ในฐานข้อมูล
    const [availableSlots] = await db.execute(`
      CALL get_available_slots(?, ?, ?)
    `, [dentistId, date, date]);

    res.json({ 
      success: true, 
      availableSlots: availableSlots[0] || [] 
    });

  } catch (error) {
    console.error('Error getting available slots:', error);
    res.status(500).json({ 
      success: false, 
      error: 'เกิดข้อผิดพลาดในการดึงช่วงเวลาว่าง' 
    });
  }
},

// API: ดึงข้อมูล appointment พร้อมรายละเอียดผู้ป่วยสำหรับเพิ่มประวัติ
getAppointmentForAddHistory: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const queueId = req.params.queueId;

    // ตรวจสอบสิทธิ์หมอ
    const [dentistResult] = await db.execute(`
      SELECT dentist_id, fname, lname FROM dentist WHERE user_id = ?
    `, [userId]);

    if (dentistResult.length === 0) {
      return res.status(404).json({ success: false, error: 'ไม่พบข้อมูลทันตแพทย์' });
    }

    const dentistId = dentistResult[0].dentist_id;

    // ดึงข้อมูล appointment พร้อมข้อมูลผู้ป่วยแบบละเอียด
    const [appointmentData] = await db.execute(`
      SELECT 
        q.queue_id,
        q.time,
        q.diagnosis,
        q.next_appointment,
        q.queue_status,
        p.patient_id,
        p.fname as patient_fname,
        p.lname as patient_lname,
        p.gender,
        p.phone,
        p.dob,
        p.address,
        p.id_card,
        p.chronic_disease,
        p.allergy_history,
        t.treatment_id,
        t.treatment_name,
        t.duration,
        d.dentist_id,
        d.fname as dentist_fname,
        d.lname as dentist_lname,
        TIMESTAMPDIFF(YEAR, p.dob, CURDATE()) as age
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      WHERE q.queue_id = ? AND q.dentist_id = ?
    `, [queueId, dentistId]);

    if (appointmentData.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'ไม่พบข้อมูลการจองหรือไม่มีสิทธิ์เข้าถึง' 
      });
    }

    // ดึงรายการ treatments ทั้งหมด
    const [treatments] = await db.execute(`
      SELECT treatment_id, treatment_name, duration 
      FROM treatment 
      ORDER BY treatment_name
    `);

    // ดึงรายการทันตแพทย์ทั้งหมด
    const [dentists] = await db.execute(`
      SELECT dentist_id, fname, lname, specialty 
      FROM dentist 
      ORDER BY fname, lname
    `);

    res.json({
      success: true,
      appointment: appointmentData[0],
      treatments: treatments,
      dentists: dentists
    });

  } catch (error) {
    console.error('Error in getAppointmentForAddHistory:', error);
    res.status(500).json({ 
      success: false, 
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูล' 
    });
  }
},


showScheduleMonthly: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;

    // ดึงข้อมูลหมอ
    const [dentistResult] = await db.execute(`
      SELECT d.*, u.email 
      FROM dentist d
      JOIN user u ON d.user_id = u.user_id
      WHERE d.user_id = ?
    `, [userId]);

    if (dentistResult.length === 0) {
      return res.redirect('/login');
    }

    const dentist = dentistResult[0];

    res.render('dentist/schedule-monthly', {
      title: 'ตารางงาน',
      dentist
    });

  } catch (error) {
    console.error('Error in showScheduleMonthly:', error);
    res.status(500).send('เกิดข้อผิดพลาด');
  }
},

// บันทึกประวัติการรักษา
// บันทึกประวัติการรักษา
saveAddHistory: async (req, res) => {
  try {
    const userId = req.session.user?.user_id || req.session.userId;
    const { 
      queueId, 
      diagnosis, 
      followUpRecommendation,
      nextAppointmentDate
    } = req.body;

    // Validation
    if (!queueId || !diagnosis || !diagnosis.trim()) {
      return res.status(400).json({ 
        success: false, 
        error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน' 
      });
    }

    // ตรวจสอบสิทธิ์หมอ
    const [dentistResult] = await db.execute(`
      SELECT dentist_id FROM dentist WHERE user_id = ?
    `, [userId]);

    if (dentistResult.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'ไม่พบข้อมูลทันตแพทย์' 
      });
    }

    const dentistId = dentistResult[0].dentist_id;

    // ตรวจสอบการจองและสิทธิ์
    const [appointmentCheck] = await db.execute(`
      SELECT q.queue_id, q.queue_status, q.queuedetail_id
      FROM queue q
      WHERE q.queue_id = ? AND q.dentist_id = ?
    `, [queueId, dentistId]);

    if (appointmentCheck.length === 0) {
      return res.status(403).json({ 
        success: false, 
        error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลการจองนี้' 
      });
    }

    const queuedetailId = appointmentCheck[0].queuedetail_id;

    // เริ่ม transaction
    await db.query('START TRANSACTION');

    try {
      const nextAppointmentValue = nextAppointmentDate && nextAppointmentDate.trim() 
        ? nextAppointmentDate.trim() 
        : null;

      // อัพเดทสถานะเป็น 'completed' เมื่อหมอบันทึกประวัติ
      await db.execute(`
        UPDATE queue 
        SET queue_status = 'completed', 
            diagnosis = ?,
            next_appointment = ?
        WHERE queue_id = ?
      `, [diagnosis.trim(), nextAppointmentValue, queueId]);

      // บันทึกประวัติใน treatmentHistory
      if (queuedetailId) {
        const [existingHistory] = await db.execute(`
          SELECT tmh_id FROM treatmentHistory WHERE queuedetail_id = ?
        `, [queuedetailId]);

        // สร้างข้อความรวมของคำแนะนำ
        let followUpdateText = '';
        if (followUpRecommendation && followUpRecommendation.trim()) {
          followUpdateText = followUpRecommendation.trim();
        }
        if (nextAppointmentValue) {
          const formattedDate = new Date(nextAppointmentValue).toLocaleDateString('th-TH', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
          });
          if (followUpdateText) {
            followUpdateText += `\n\nนัดครั้งต่อไป: ${formattedDate}`;
          } else {
            followUpdateText = `นัดครั้งต่อไป: ${formattedDate}`;
          }
        }

        if (existingHistory.length > 0) {
          // อัพเดทประวัติที่มีอยู่
          await db.execute(`
            UPDATE treatmentHistory 
            SET diagnosis = ?, 
                followUpdate = ?
            WHERE queuedetail_id = ?
          `, [
            diagnosis.trim(), 
            followUpdateText || '', 
            queuedetailId
          ]);
        } else {
          // เพิ่มประวัติใหม่
          await db.execute(`
            INSERT INTO treatmentHistory (queuedetail_id, diagnosis, followUpdate)
            VALUES (?, ?, ?)
          `, [
            queuedetailId, 
            diagnosis.trim(), 
            followUpdateText || ''
          ]);
        }
      }

      // Commit transaction
      await db.query('COMMIT');

      res.json({ 
        success: true, 
        message: 'บันทึกประวัติการรักษาเรียบร้อยแล้ว',
        queueId: queueId
      });

    } catch (error) {
      // Rollback transaction
      await db.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error in saveAddHistory:', error);
    res.status(500).json({ 
      success: false, 
      error: 'เกิดข้อผิดพลาดในการบันทึกประวัติการรักษา' 
    });
  }
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
