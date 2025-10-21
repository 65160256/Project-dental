const db = require('../config/db');

/**
 * งาน auto-cancel สำหรับนัดหมายที่ผู้ป่วยไม่มาและแพทย์ไม่กรอกประวัติ
 * ทำงานทุก 30 นาที
 */
async function autoCancelAppointments() {
  console.log('🔄 เริ่มตรวจสอบนัดหมายที่ควรยกเลิกอัตโนมัติ...');
  
  try {
    // ค้นหานัดหมายที่:
    // 1. สถานะเป็น 'waiting_for_treatment' (รอการรักษา)
    // 2. เวลานัดหมายผ่านไปแล้วมากกว่า 2 ชั่วโมง
    // 3. ยังไม่มีประวัติการรักษา
    const [appointments] = await db.execute(`
      SELECT 
        q.queue_id,
        q.patient_id,
        q.time,
        qd.dentist_id,
        CONCAT(p.fname, ' ', p.lname) as patient_name,
        CONCAT(d.fname, ' ', d.lname) as dentist_name,
        t.treatment_name
      FROM queue q
      JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      JOIN patient p ON q.patient_id = p.patient_id
      JOIN dentist d ON qd.dentist_id = d.dentist_id
      JOIN treatment t ON qd.treatment_id = t.treatment_id
      LEFT JOIN treatmentHistory th ON qd.queuedetail_id = th.queuedetail_id
      WHERE q.queue_status = 'waiting_for_treatment'
        AND q.time < DATE_SUB(NOW(), INTERVAL 2 HOUR)
        AND th.tmh_id IS NULL
    `);

    console.log(`📋 พบนัดหมายที่ควรยกเลิก: ${appointments.length} รายการ`);

    for (const appointment of appointments) {
      try {
        // อัปเดตสถานะเป็น 'auto_cancelled'
        await db.execute(
          `UPDATE queue SET queue_status = 'auto_cancelled' WHERE queue_id = ?`,
          [appointment.queue_id]
        );

        console.log(`✅ ยกเลิกนัดหมายอัตโนมัติ: ${appointment.patient_name} - ${appointment.treatment_name} (${appointment.time})`);

        // สร้างการแจ้งเตือนให้ผู้ป่วย
        await createAutoCancelNotification(appointment);

      } catch (error) {
        console.error(`❌ เกิดข้อผิดพลาดในการยกเลิกนัดหมาย ${appointment.queue_id}:`, error);
      }
    }

    if (appointments.length > 0) {
      console.log(`🎯 ยกเลิกนัดหมายอัตโนมัติเสร็จสิ้น: ${appointments.length} รายการ`);
    } else {
      console.log('✅ ไม่พบนัดหมายที่ต้องยกเลิกอัตโนมัติ');
    }

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในการตรวจสอบนัดหมาย:', error);
  }
}

/**
 * สร้างการแจ้งเตือนสำหรับการยกเลิกอัตโนมัติ
 */
async function createAutoCancelNotification(appointment) {
  try {
    const notificationTitle = 'นัดหมายถูกยกเลิกอัตโนมัติ';
    const notificationMessage = `นัดหมายของคุณกับ Dr. ${appointment.dentist_name} สำหรับ ${appointment.treatment_name} ในวันที่ ${new Date(appointment.time).toLocaleDateString('th-TH')} ถูกยกเลิกอัตโนมัติเนื่องจากไม่มาตามเวลานัด`;

    await db.execute(`
      INSERT INTO notification (patient_id, title, message, type, created_at)
      VALUES (?, ?, ?, 'appointment_cancelled', NOW())
    `, [appointment.patient_id, notificationTitle, notificationMessage]);

    console.log(`📢 สร้างการแจ้งเตือนสำหรับผู้ป่วย: ${appointment.patient_name}`);
  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในการสร้างการแจ้งเตือน:', error);
  }
}

module.exports = {
  autoCancelAppointments
};
