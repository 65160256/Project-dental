// jobs/notificationJobs.js
const cron = require('node-cron');
const db = require('../config/db');
const NotificationHelper = require('../utils/notificationHelper');

// ฟังก์ชันส่งการแจ้งเตือนนัดหมายพรุ่งนี้
async function sendAppointmentReminders() {
  console.log('🔔 Starting appointment reminder job...');
  
  try {
    // หาวันพรุ่งนี้
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(23, 59, 59, 999);
    
    const tomorrowDate = tomorrow.toISOString().split('T')[0];
    
    console.log(`📅 Checking appointments for ${tomorrowDate}`);

    // ดึงนัดหมายที่จะเกิดขึ้นพรุ่งนี้
    const [appointments] = await db.execute(`
      SELECT queue_id, patient_id, dentist_id, time
      FROM queue
      WHERE DATE(time) = ?
      AND queue_status IN ('pending', 'confirm')
    `, [tomorrowDate]);

    console.log(`📋 Found ${appointments.length} appointments for tomorrow`);

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
        console.error(`❌ Error sending reminder for appointment ${appointment.queue_id}:`, error);
      }
    }

    console.log(`✅ Appointment reminder job completed: ${successCount}/${appointments.length} reminders sent`);

  } catch (error) {
    console.error('❌ Error in appointment reminder job:', error);
  }
}

// ฟังก์ชันตรวจสอบและแจ้งเตือนนัดหมายที่กำลังจะมาถึง (2 ชั่วโมง)
async function sendUpcomingAppointmentAlerts() {
  console.log('🔔 Checking for upcoming appointments (2 hours)...');
  
  try {
    const now = new Date();
    const twoHoursLater = new Date(now.getTime() + (2 * 60 * 60 * 1000));
    
    const [appointments] = await db.execute(`
      SELECT q.queue_id, q.patient_id, q.dentist_id, q.time,
             CONCAT(p.fname, ' ', p.lname) as patient_name,
             CONCAT(d.fname, ' ', d.lname) as dentist_name,
             t.treatment_name
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      WHERE q.time BETWEEN ? AND ?
      AND q.queue_status IN ('pending', 'confirm')
    `, [now, twoHoursLater]);

    console.log(`📋 Found ${appointments.length} appointments in next 2 hours`);

    for (const appointment of appointments) {
      const appointmentTime = new Date(appointment.time);
      const formattedTime = appointmentTime.toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }) + ' น.';

      // แจ้งเตือนทันตแพทย์
      await db.execute(`
        INSERT INTO notifications (type, title, message, appointment_id, dentist_id, patient_id, is_read, is_new)
        VALUES (?, ?, ?, ?, ?, ?, 0, 1)
      `, [
        'appointment_reminder',
        '⏰ นัดหมายกำลังจะมาถึง',
        `อีก 2 ชั่วโมง คุณมีนัดกับ ${appointment.patient_name} เวลา ${formattedTime} สำหรับ${appointment.treatment_name}`,
        appointment.queue_id,
        appointment.dentist_id,
        appointment.patient_id
      ]);
    }

    console.log(`✅ Sent ${appointments.length} upcoming appointment alerts`);

  } catch (error) {
    console.error('❌ Error in upcoming appointment alerts:', error);
  }
}

// ฟังก์ชันตรวจสอบและแจ้งเตือนนัดหมายที่พลาด (No-show)
async function checkMissedAppointments() {
  console.log('🔔 Checking for missed appointments...');
  
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - (60 * 60 * 1000));
    
    const [missedAppointments] = await db.execute(`
      SELECT q.queue_id, q.patient_id, q.dentist_id,
             CONCAT(p.fname, ' ', p.lname) as patient_name,
             CONCAT(d.fname, ' ', d.lname) as dentist_name,
             q.time, t.treatment_name
      FROM queue q
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN dentist d ON q.dentist_id = d.dentist_id
      JOIN treatment t ON q.treatment_id = t.treatment_id
      WHERE q.time BETWEEN ? AND ?
      AND q.queue_status = 'pending'
    `, [oneHourAgo, now]);

    console.log(`📋 Found ${missedAppointments.length} potentially missed appointments`);

    for (const appointment of missedAppointments) {
      const formattedTime = new Date(appointment.time).toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      // แจ้งเตือน Admin และ Dentist
      await db.execute(`
        INSERT INTO notifications (type, title, message, appointment_id, dentist_id, patient_id, is_read, is_new)
        VALUES (?, ?, ?, ?, ?, ?, 0, 1)
      `, [
        'appointment_missed',
        '⚠️ นัดหมายที่อาจพลาด',
        `${appointment.patient_name} อาจพลาดนัดหมายเวลา ${formattedTime} กับ ${appointment.dentist_name} สำหรับ${appointment.treatment_name}`,
        appointment.queue_id,
        appointment.dentist_id,
        appointment.patient_id
      ]);
    }

    console.log(`✅ Sent ${missedAppointments.length} missed appointment alerts`);

  } catch (error) {
    console.error('❌ Error in missed appointments check:', error);
  }
}

// ฟังก์ชันล้างการแจ้งเตือนเก่า (เก่ากว่า 30 วัน)
async function cleanOldNotifications() {
  console.log('🧹 Cleaning old notifications...');
  
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [result] = await db.execute(`
      DELETE FROM notifications
      WHERE created_at < ?
      AND is_read = 1
    `, [thirtyDaysAgo]);

    console.log(`✅ Cleaned ${result.affectedRows} old notifications`);

  } catch (error) {
    console.error('❌ Error cleaning old notifications:', error);
  }
}

// ตั้งค่า Cron Jobs
function initializeNotificationJobs() {
  console.log('🚀 Initializing notification cron jobs...');

  // ส่งการแจ้งเตือนนัดหมายพรุ่งนี้ทุกวันเวลา 09:00 น.
  cron.schedule('0 9 * * *', sendAppointmentReminders, {
    timezone: 'Asia/Bangkok'
  });
  console.log('✅ Daily reminder job scheduled at 09:00');

  // ตรวจสอบนัดหมายที่กำลังจะมาถึงทุก 30 นาที (ในเวลาทำการ 08:00-18:00)
  cron.schedule('*/30 8-18 * * *', sendUpcomingAppointmentAlerts, {
    timezone: 'Asia/Bangkok'
  });
  console.log('✅ Upcoming appointment alerts scheduled every 30 minutes (08:00-18:00)');

  // ตรวจสอบนัดหมายที่พลาดทุก 1 ชั่วโมง
  cron.schedule('0 * * * *', checkMissedAppointments, {
    timezone: 'Asia/Bangkok'
  });
  console.log('✅ Missed appointment check scheduled every hour');

  // ล้างการแจ้งเตือนเก่าทุกวันเวลา 02:00 น.
  cron.schedule('0 2 * * *', cleanOldNotifications, {
    timezone: 'Asia/Bangkok'
  });
  console.log('✅ Old notification cleanup scheduled at 02:00');

  console.log('✅ All notification cron jobs initialized successfully');
}

// Export functions
module.exports = {
  initializeNotificationJobs,
  sendAppointmentReminders,
  sendUpcomingAppointmentAlerts,
  checkMissedAppointments,
  cleanOldNotifications
};