// jobs/notificationJobs.js
const cron = require('node-cron');
const db = require('../config/db');
const NotificationHelper = require('../utils/notificationHelper');

// ฟังก์ชันส่งการแจ้งเตือนนัดหมายพรุ่งนี้
async function sendAppointmentReminders() {
  console.log('🔔 เริ่มงานแจ้งเตือนนัดหมาย...');
  
  try {
    // หาวันพรุ่งนี้
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(23, 59, 59, 999);
    
    const tomorrowDate = tomorrow.toISOString().split('T')[0];
    
    console.log(`📅 ตรวจสอบนัดหมายสำหรับวันที่ ${tomorrowDate}`);

    // ดึงนัดหมายที่จะเกิดขึ้นพรุ่งนี้
    const [appointments] = await db.execute(`
      SELECT q.queue_id, q.patient_id, q.time, qd.dentist_id
      FROM queue q
      JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      WHERE DATE(q.time) = ?
      AND q.queue_status IN ('pending', 'confirm')
    `, [tomorrowDate]);

    console.log(`📋 พบนัดหมาย ${appointments.length} รายการสำหรับพรุ่งนี้`);

    // ส่งการแจ้งเตือนสำหรับแต่ละนัดหมาย
    let successCount = 0;
    for (const appointment of appointments) {
      try {
        await NotificationHelper.createReminderNotification(
          appointment.queue_id,
          appointment.patient_id,
          appointment.dentist_id
        );
        successCount++;
      } catch (error) {
        console.error(`❌ เกิดข้อผิดพลาดในการส่งการแจ้งเตือนสำหรับนัดหมาย ${appointment.queue_id}:`, error);
      }
    }

    console.log(`✅ งานแจ้งเตือนนัดหมายเสร็จสิ้น: ส่งได้ ${successCount}/${appointments.length} รายการ`);

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในงานแจ้งเตือนนัดหมาย:', error);
  }
}

// ฟังก์ชันตรวจสอบและแจ้งเตือนนัดหมายที่กำลังจะมาถึง (2 ชั่วโมง)
async function sendUpcomingAppointmentAlerts() {
  console.log('🔔 ตรวจสอบนัดหมายที่กำลังจะมาถึง (2 ชั่วโมง)...');
  
  try {
    const now = new Date();
    const twoHoursLater = new Date(now.getTime() + (2 * 60 * 60 * 1000));
    
    const [appointments] = await db.execute(`
      SELECT q.queue_id, q.patient_id, q.time, qd.dentist_id,
             CONCAT(p.fname, ' ', p.lname) as patient_name,
             CONCAT(d.fname, ' ', d.lname) as dentist_name,
             t.treatment_name
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      JOIN dentist d ON qd.dentist_id = d.dentist_id
      JOIN treatment t ON qd.treatment_id = t.treatment_id
      WHERE q.time BETWEEN ? AND ?
      AND q.queue_status IN ('pending', 'confirm')
    `, [now, twoHoursLater]);

    console.log(`📋 พบนัดหมาย ${appointments.length} รายการใน 2 ชั่วโมงถัดไป`);

    for (const appointment of appointments) {
      const appointmentTime = new Date(appointment.time);
      const formattedTime = appointmentTime.toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }) + ' น.';

      // แจ้งเตือนทันตแพทย์
      await db.execute(`
        INSERT INTO notifications (type, title, message, queue_id, is_read, is_new)
        VALUES (?, ?, ?, ?, 0, 1)
      `, [
        'appointment_reminder',
        '⏰ นัดหมายกำลังจะมาถึง',
        `อีก 2 ชั่วโมง คุณมีนัดกับ ${appointment.patient_name} เวลา ${formattedTime} สำหรับ${appointment.treatment_name}`,
        appointment.queue_id
      ]);
    }

    console.log(`✅ ส่งการแจ้งเตือนนัดหมายที่กำลังมาถึง ${appointments.length} รายการ`);

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในการแจ้งเตือนนัดหมายที่กำลังมาถึง:', error);
  }
}

// ฟังก์ชันตรวจสอบและแจ้งเตือนนัดหมายที่พลาด (No-show)
async function checkMissedAppointments() {
  console.log('🔔 ตรวจสอบนัดหมายที่พลาด...');
  
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - (60 * 60 * 1000));
    
    const [missedAppointments] = await db.execute(`
      SELECT q.queue_id, q.patient_id, qd.dentist_id,
             CONCAT(p.fname, ' ', p.lname) as patient_name,
             CONCAT(d.fname, ' ', d.lname) as dentist_name,
             q.time, t.treatment_name
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      JOIN dentist d ON qd.dentist_id = d.dentist_id
      JOIN treatment t ON qd.treatment_id = t.treatment_id
      WHERE q.time BETWEEN ? AND ?
      AND q.queue_status = 'pending'
    `, [oneHourAgo, now]);

    console.log(`📋 พบนัดหมายที่อาจพลาด ${missedAppointments.length} รายการ`);

    for (const appointment of missedAppointments) {
      const formattedTime = new Date(appointment.time).toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      // แจ้งเตือน Admin และ Dentist
      await db.execute(`
        INSERT INTO notifications (type, title, message, queue_id, is_read, is_new)
        VALUES (?, ?, ?, ?, 0, 1)
      `, [
        'appointment_missed',
        '⚠️ นัดหมายที่อาจพลาด',
        `${appointment.patient_name} อาจพลาดนัดหมายเวลา ${formattedTime} กับ ${appointment.dentist_name} สำหรับ${appointment.treatment_name}`,
        appointment.queue_id
      ]);
    }

    console.log(`✅ ส่งการแจ้งเตือนนัดหมายที่พลาด ${missedAppointments.length} รายการ`);

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในการตรวจสอบนัดหมายที่พลาด:', error);
  }
}

// ฟังก์ชันตรวจสอบและยกเลิกอัตโนมัติสำหรับนัดหมายที่หมอไม่ได้กรอกการรักษา
async function autoCancelMissedAppointments() {
  console.log('🔔 ตรวจสอบนัดหมายที่หมอไม่ได้กรอกการรักษา...');
  
  try {
    const now = new Date();
    // ตรวจสอบนัดหมายที่ผ่านไปแล้ว 1 ชั่วโมงขึ้นไป และยังไม่ได้กรอกการรักษา
    const oneHourAgo = new Date(now.getTime() - (1 * 60 * 60 * 1000));
    
    const [missedAppointments] = await db.execute(`
      SELECT q.queue_id, q.patient_id, qd.dentist_id,
             CONCAT(p.fname, ' ', p.lname) as patient_name,
             CONCAT(d.fname, ' ', d.lname) as dentist_name,
             q.time, t.treatment_name
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      JOIN dentist d ON qd.dentist_id = d.dentist_id
      JOIN treatment t ON qd.treatment_id = t.treatment_id
      WHERE q.time < ?
      AND q.queue_status IN ('confirm', 'pending')
      AND NOT EXISTS (
        SELECT 1 FROM treatmentHistory th 
        WHERE th.queuedetail_id = qd.queuedetail_id
      )
    `, [oneHourAgo]);

    console.log(`📋 พบนัดหมายที่หมอไม่ได้กรอกการรักษา ${missedAppointments.length} รายการ`);

    let autoCancelledCount = 0;
    for (const appointment of missedAppointments) {
      try {
        // เปลี่ยนสถานะเป็น auto_cancelled
        await db.execute(`
          UPDATE queue 
          SET queue_status = 'auto_cancelled'
          WHERE queue_id = ?
        `, [appointment.queue_id]);

        // สร้างการแจ้งเตือน
        await db.execute(`
          INSERT INTO notifications (type, title, message, queue_id, is_read, is_new)
          VALUES (?, ?, ?, ?, 0, 1)
        `, [
          'appointment_auto_cancelled',
          '⚠️ นัดหมายถูกยกเลิกอัตโนมัติ',
          `นัดหมายของ ${appointment.patient_name} กับ ${appointment.dentist_name} ถูกยกเลิกอัตโนมัติเนื่องจากหมอไม่ได้กรอกการรักษาหลังจากเวลานัด`,
          appointment.queue_id
        ]);

        autoCancelledCount++;
        console.log(`✅ ยกเลิกอัตโนมัติ: ${appointment.patient_name} - ${appointment.dentist_name}`);
      } catch (error) {
        console.error(`❌ เกิดข้อผิดพลาดในการยกเลิกอัตโนมัติสำหรับนัดหมาย ${appointment.queue_id}:`, error);
      }
    }

    console.log(`✅ ยกเลิกอัตโนมัติ ${autoCancelledCount}/${missedAppointments.length} รายการ`);

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในการตรวจสอบนัดหมายที่หมอไม่ได้กรอกการรักษา:', error);
  }
}

// ฟังก์ชันล้างการแจ้งเตือนเก่า (เก่ากว่า 30 วัน)
async function cleanOldNotifications() {
  console.log('🧹 ล้างการแจ้งเตือนเก่า...');
  
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [result] = await db.execute(`
      DELETE FROM notifications
      WHERE created_at < ?
      AND is_read = 1
    `, [thirtyDaysAgo]);

    console.log(`✅ ล้างการแจ้งเตือนเก่า ${result.affectedRows} รายการ`);

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในการล้างการแจ้งเตือนเก่า:', error);
  }
}

// ตั้งค่า Cron Jobs
function initializeNotificationJobs() {
  console.log('🚀 กำลังเริ่มต้นงานแจ้งเตือนอัตโนมัติ...');

  // ส่งการแจ้งเตือนนัดหมายพรุ่งนี้ทุกวันเวลา 09:00 น.
  cron.schedule('0 9 * * *', sendAppointmentReminders, {
    timezone: 'Asia/Bangkok'
  });
  console.log('✅ กำหนดงานแจ้งเตือนรายวันเวลา 09:00 น.');

  // ตรวจสอบนัดหมายที่กำลังจะมาถึงทุก 30 นาที (ในเวลาทำการ 08:00-18:00)
  cron.schedule('*/30 8-18 * * *', sendUpcomingAppointmentAlerts, {
    timezone: 'Asia/Bangkok'
  });
  console.log('✅ กำหนดการแจ้งเตือนนัดหมายที่กำลังมาถึงทุก 30 นาที (08:00-18:00)');

  // ตรวจสอบนัดหมายที่พลาดทุก 1 ชั่วโมง
  cron.schedule('0 * * * *', checkMissedAppointments, {
    timezone: 'Asia/Bangkok'
  });
  console.log('✅ กำหนดการตรวจสอบนัดหมายที่พลาดทุกชั่วโมง');

  // ตรวจสอบและยกเลิกอัตโนมัติสำหรับนัดหมายที่หมอไม่ได้กรอกการรักษาทุกชั่วโมง
  cron.schedule('0 * * * *', autoCancelMissedAppointments, {
    timezone: 'Asia/Bangkok'
  });
  console.log('✅ กำหนดการตรวจสอบและยกเลิกอัตโนมัติทุกชั่วโมง');

  // ล้างการแจ้งเตือนเก่าทุกวันเวลา 02:00 น.
  cron.schedule('0 2 * * *', cleanOldNotifications, {
    timezone: 'Asia/Bangkok'
  });
  console.log('✅ กำหนดการล้างการแจ้งเตือนเก่าเวลา 02:00 น.');

  console.log('✅ เริ่มต้นงานแจ้งเตือนอัตโนมัติทั้งหมดเสร็จสิ้น');
}

// Export functions
module.exports = {
  initializeNotificationJobs,
  sendAppointmentReminders,
  sendUpcomingAppointmentAlerts,
  checkMissedAppointments,
  autoCancelMissedAppointments,
  cleanOldNotifications
};