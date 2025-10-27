// utils/notificationHelper.js
const db = require('../config/db');

// Helper function to validate database connection
async function validateConnection() {
  try {
    await db.execute('SELECT 1');
    return true;
  } catch (error) {
    console.error('❌ Database connection error in notificationHelper:', error.message);
    return false;
  }
}

// Helper function to safely execute database queries
async function safeExecute(query, params) {
  try {
    const isConnected = await validateConnection();
    if (!isConnected) {
      console.error('❌ Cannot create notification: Database not connected');
      return null;
    }
    const [result] = await db.execute(query, params);
    return result;
  } catch (error) {
    console.error('❌ Database query error:', error.message);
    console.error('❌ Query:', query);
    console.error('❌ Params:', params);
    return null;
  }
}

const NotificationHelper = {
  // สร้าง notification เมื่อมีการจองนัดหมายใหม่
  async createNewAppointmentNotification(appointmentId, patientId, dentistId) {
    try {
      console.log('📢 Creating notification for appointment:', { appointmentId, patientId, dentistId });
      
      const [patientData] = await db.execute(
        'SELECT fname, lname, phone FROM patient WHERE patient_id = ?',
        [patientId]
      );
      
      const [dentistData] = await db.execute(
        'SELECT fname, lname FROM dentist WHERE dentist_id = ?',
        [dentistId]
      );
      
      const [appointmentData] = await db.execute(
        `SELECT q.time, qd.treatment_id
         FROM queue q
         JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
         WHERE q.queue_id = ?`,
        [appointmentId]
      );

      if (patientData.length === 0 || dentistData.length === 0 || appointmentData.length === 0) {
        console.error('❌ ไม่สามารถสร้างการแจ้งเตือนได้: ข้อมูลไม่ครบถ้วน', {
          patientData: patientData.length,
          dentistData: dentistData.length,
          appointmentData: appointmentData.length
        });
        return;
      }

      const patient = patientData[0];
      const dentist = dentistData[0];
      const appointment = appointmentData[0];
      
      // ดึงข้อมูลการรักษา
      const [treatmentData] = await db.execute(
        'SELECT treatment_name FROM treatment WHERE treatment_id = ?',
        [appointment.treatment_id]
      );
      const treatmentName = treatmentData[0]?.treatment_name || 'การรักษา';
      
      const appointmentTime = new Date(appointment.time);
      const formattedDate = appointmentTime.toLocaleDateString('th-TH', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      });
      const formattedTime = appointmentTime.toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      // Notification for Admin
      const adminResult = await safeExecute(`
        INSERT INTO notifications (type, title, message, queue_id, is_read, is_new)
        VALUES (?, ?, ?, ?, 0, 1)
      `, [
        'new_appointment',
        '🆕 มีการจองนัดหมายใหม่',
        `${patient.fname} ${patient.lname} จองนัดหมายกับ ทพ.${dentist.fname} ${dentist.lname} สำหรับ${treatmentName} วันที่ ${formattedDate} เวลา ${formattedTime} น.`,
        appointmentId
      ]);

      // Notification for Dentist
      const dentistResult = await safeExecute(`
        INSERT INTO notifications (type, title, message, queue_id, is_read, is_new)
        VALUES (?, ?, ?, ?, 0, 1)
      `, [
        'new_appointment',
        '🆕 คุณมีนัดหมายใหม่',
        `ผู้ป่วย ${patient.fname} ${patient.lname} (${patient.phone}) จองนัดหมายสำหรับ${treatmentName} วันที่ ${formattedDate} เวลา ${formattedTime} น.`,
        appointmentId
      ]);

      if (adminResult && dentistResult) {
        console.log(`✅ สร้างการแจ้งเตือนนัดหมายสำเร็จ รหัส: ${appointmentId}`);
      } else {
        console.error('❌ ไม่สามารถสร้างการแจ้งเตือนได้ - Database connection issue');
      }

    } catch (error) {
      console.error('❌ เกิดข้อผิดพลาดในการสร้างการแจ้งเตือนนัดหมาย:', error);
      console.error('❌ Error details:', {
        message: error.message,
        code: error.code,
        sqlState: error.sqlState
      });
    }
  },

  // สร้าง notification เมื่อยืนยันการจอง
  async createConfirmationNotification(appointmentId, patientId, dentistId) {
    try {
      const [appointmentData] = await db.execute(`
        SELECT q.time, t.treatment_name, CONCAT(d.fname, ' ', d.lname) as dentist_name,
               CONCAT(p.fname, ' ', p.lname) as patient_name
        FROM queue q
        JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
        JOIN dentist d ON qd.dentist_id = d.dentist_id
        JOIN treatment t ON qd.treatment_id = t.treatment_id
        JOIN patient p ON q.patient_id = p.patient_id
        WHERE q.queue_id = ?
      `, [appointmentId]);

      if (appointmentData.length === 0) return;

      const appointment = appointmentData[0];
      const appointmentTime = new Date(appointment.time);
      const formattedDate = appointmentTime.toLocaleDateString('th-TH', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      });
      const formattedTime = appointmentTime.toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      // Notification for Patient
      await db.execute(`
        INSERT INTO notifications (type, title, message, queue_id, is_read, is_new)
        VALUES (?, ?, ?, ?, 0, 1)
      `, [
        'appointment_confirmed',
        '✅ การจองได้รับการยืนยันแล้ว',
        `การจองของคุณกับ ${appointment.dentist_name} สำหรับ${appointment.treatment_name} วันที่ ${formattedDate} เวลา ${formattedTime} น. ได้รับการยืนยันแล้ว`,
        appointmentId
      ]);

      // Notification for Admin
      await db.execute(`
        INSERT INTO notifications (type, title, message, queue_id, is_read, is_new)
        VALUES (?, ?, ?, ?, 0, 1)
      `, [
        'appointment_confirmed',
        '✅ มีการยืนยันนัดหมาย',
        `ทพ.${appointment.dentist_name} ยืนยันนัดหมายของ ${appointment.patient_name} วันที่ ${formattedDate} เวลา ${formattedTime} น.`,
        appointmentId
      ]);

      console.log(`✅ สร้างการแจ้งเตือนการยืนยันสำเร็จ รหัส: ${appointmentId}`);

    } catch (error) {
      console.error('เกิดข้อผิดพลาดในการสร้างการแจ้งเตือนการยืนยัน:', error);
    }
  },

  // สร้าง notification เมื่อยกเลิกการจอง
  async createCancellationNotification(appointmentId, patientId, dentistId, cancelledBy, reason = null) {
    try {
      const [appointmentData] = await db.execute(`
        SELECT q.time, t.treatment_name, 
               CONCAT(d.fname, ' ', d.lname) as dentist_name,
               CONCAT(p.fname, ' ', p.lname) as patient_name,
               p.phone
        FROM queue q
        JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
        JOIN dentist d ON qd.dentist_id = d.dentist_id
        JOIN patient p ON q.patient_id = p.patient_id
        JOIN treatment t ON qd.treatment_id = t.treatment_id
        WHERE q.queue_id = ?
      `, [appointmentId]);

      if (appointmentData.length === 0) return;

      const appointment = appointmentData[0];
      const appointmentTime = new Date(appointment.time);
      const formattedDate = appointmentTime.toLocaleDateString('th-TH', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      });
      const formattedTime = appointmentTime.toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      const reasonText = reason ? ` เหตุผล: ${reason}` : '';

      if (cancelledBy === 'patient') {
        // แจ้งเตือน Admin และ Dentist
        await db.execute(`
          INSERT INTO notifications (type, title, message, queue_id, is_read, is_new)
          VALUES (?, ?, ?, ?, 0, 1)
        `, [
          'appointment_cancelled',
          '❌ มีการยกเลิกนัดหมาย',
          `${appointment.patient_name} ยกเลิกนัดหมายกับ ${appointment.dentist_name} วันที่ ${formattedDate} เวลา ${formattedTime} น.${reasonText}`,
          appointmentId
        ]);

        // แจ้งเตือน Dentist
        await db.execute(`
          INSERT INTO notifications (type, title, message, queue_id, is_read, is_new)
          VALUES (?, ?, ?, ?, 0, 1)
        `, [
          'appointment_cancelled',
          '❌ ผู้ป่วยยกเลิกนัดหมาย',
          `${appointment.patient_name} (${appointment.phone}) ยกเลิกนัดหมายวันที่ ${formattedDate} เวลา ${formattedTime} น.${reasonText}`,
          appointmentId
        ]);
      } else if (cancelledBy === 'dentist') {
        // แจ้งเตือน Patient
        await db.execute(`
          INSERT INTO notifications (type, title, message, queue_id, is_read, is_new)
          VALUES (?, ?, ?, ?, 0, 1)
        `, [
          'appointment_cancelled',
          '❌ การจองถูกยกเลิก',
          `การจองของคุณกับ ${appointment.dentist_name} วันที่ ${formattedDate} เวลา ${formattedTime} น. ถูกยกเลิก${reasonText}`,
          appointmentId
        ]);

        // แจ้งเตือน Admin
        await db.execute(`
          INSERT INTO notifications (type, title, message, queue_id, is_read, is_new)
          VALUES (?, ?, ?, ?, 0, 1)
        `, [
          'appointment_cancelled',
          '❌ ทันตแพทย์ยกเลิกนัดหมาย',
          `ทพ.${appointment.dentist_name} ยกเลิกนัดหมายของ ${appointment.patient_name} วันที่ ${formattedDate} เวลา ${formattedTime} น.${reasonText}`,
          appointmentId
        ]);
      } else {
        // ยกเลิกโดย Admin
        // แจ้งเตือน Patient
        await db.execute(`
          INSERT INTO notifications (type, title, message, queue_id, is_read, is_new)
          VALUES (?, ?, ?, ?, 0, 1)
        `, [
          'appointment_cancelled',
          '❌ การจองถูกยกเลิก',
          `การจองของคุณกับ ${appointment.dentist_name} วันที่ ${formattedDate} เวลา ${formattedTime} น. ถูกยกเลิก${reasonText}`,
          appointmentId
        ]);

        // แจ้งเตือน Dentist
        await db.execute(`
          INSERT INTO notifications (type, title, message, queue_id, is_read, is_new)
          VALUES (?, ?, ?, ?, 0, 1)
        `, [
          'appointment_cancelled',
          '❌ นัดหมายถูกยกเลิก',
          `นัดหมายของ ${appointment.patient_name} วันที่ ${formattedDate} เวลา ${formattedTime} น. ถูกยกเลิกโดยแอดมิน${reasonText}`,
          appointmentId
        ]);
      }

      console.log(`✅ สร้างการแจ้งเตือนการยกเลิกสำเร็จ รหัส: ${appointmentId}`);

    } catch (error) {
      console.error('เกิดข้อผิดพลาดในการสร้างการแจ้งเตือนการยกเลิก:', error);
    }
  },

  // สร้าง notification แจ้งเตือนก่อนนัดหมาย (24 ชั่วโมง)
  async createReminderNotification(appointmentId, patientId, dentistId) {
    try {
      const [appointmentData] = await db.execute(`
        SELECT q.time, t.treatment_name, 
               CONCAT(d.fname, ' ', d.lname) as dentist_name,
               CONCAT(p.fname, ' ', p.lname) as patient_name,
               d.specialty
        FROM queue q
        JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
        JOIN dentist d ON qd.dentist_id = d.dentist_id
        JOIN treatment t ON qd.treatment_id = t.treatment_id
        JOIN patient p ON q.patient_id = p.patient_id
        WHERE q.queue_id = ?
      `, [appointmentId]);

      if (appointmentData.length === 0) return;

      const appointment = appointmentData[0];
      const appointmentTime = new Date(appointment.time);
      const formattedDate = appointmentTime.toLocaleDateString('th-TH', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      });
      const formattedTime = appointmentTime.toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      // Notification for Patient
      await db.execute(`
        INSERT INTO notifications (type, title, message, queue_id, is_read, is_new)
        VALUES (?, ?, ?, ?, 0, 1)
      `, [
        'appointment_reminder',
        '⏰ เตือนนัดหมายพรุ่งนี้',
        `คุณมีนัดหมายพรุ่งนี้ วันที่ ${formattedDate} เวลา ${formattedTime} น. กับ ${appointment.dentist_name} สำหรับ${appointment.treatment_name}`,
        appointmentId
      ]);

      // Notification for Dentist
      await db.execute(`
        INSERT INTO notifications (type, title, message, queue_id, is_read, is_new)
        VALUES (?, ?, ?, ?, 0, 1)
      `, [
        'appointment_reminder',
        '⏰ เตือนนัดหมายพรุ่งนี้',
        `พรุ่งนี้คุณมีนัดกับ ${appointment.patient_name} เวลา ${formattedTime} น. สำหรับ${appointment.treatment_name}`,
        appointmentId
      ]);

      console.log(`✅ สร้างการแจ้งเตือนเตือนสำเร็จ รหัส: ${appointmentId}`);

    } catch (error) {
      console.error('เกิดข้อผิดพลาดในการสร้างการแจ้งเตือนเตือน:', error);
    }
  },

  // สร้าง notification เมื่อบันทึกประวัติการรักษา
  async createTreatmentRecordNotification(appointmentId, patientId, dentistId) {
    try {
      const [appointmentData] = await db.execute(`
        SELECT t.treatment_name, 
               CONCAT(d.fname, ' ', d.lname) as dentist_name,
               CONCAT(p.fname, ' ', p.lname) as patient_name,
               q.time
        FROM queue q
        JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
        JOIN dentist d ON qd.dentist_id = d.dentist_id
        JOIN treatment t ON qd.treatment_id = t.treatment_id
        JOIN patient p ON q.patient_id = p.patient_id
        WHERE q.queue_id = ?
      `, [appointmentId]);

      if (appointmentData.length === 0) return;

      const appointment = appointmentData[0];
      const appointmentTime = new Date(appointment.time);
      const formattedDate = appointmentTime.toLocaleDateString('th-TH', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      });

      // Notification for Patient (เฉพาะผู้ป่วยเท่านั้น)
      await db.execute(`
        INSERT INTO notifications (type, title, message, queue_id, patient_id, is_read, is_new)
        VALUES (?, ?, ?, ?, ?, 0, 1)
      `, [
        'treatment_completed_patient',
        '📝 บันทึกประวัติการรักษาแล้ว',
        `${appointment.dentist_name} ได้บันทึกประวัติการรักษา${appointment.treatment_name}ของคุณแล้ว คุณสามารถดูรายละเอียดได้ในประวัติการรักษา`,
        appointmentId,
        patientId
      ]);

      // Notification for Admin
      await db.execute(`
        INSERT INTO notifications (type, title, message, queue_id, is_read, is_new)
        VALUES (?, ?, ?, ?, 0, 1)
      `, [
        'treatment_completed',
        '📝 มีการบันทึกประวัติการรักษา',
        `ทพ.${appointment.dentist_name} บันทึกประวัติการรักษา${appointment.treatment_name}ของ ${appointment.patient_name} เมื่อ ${formattedDate}`,
        appointmentId
      ]);

      console.log(`✅ สร้างการแจ้งเตือนบันทึกประวัติการรักษาสำเร็จ รหัส: ${appointmentId}`);

    } catch (error) {
      console.error('เกิดข้อผิดพลาดในการสร้างการแจ้งเตือนบันทึกประวัติการรักษา:', error);
    }
  },

  // สร้าง notification เมื่อมีการเปลี่ยนแปลงตารางงาน
  async createScheduleChangeNotification(dentistId, changeType, dateRange, details = '') {
    try {
      const [dentistData] = await db.execute(
        'SELECT fname, lname FROM dentist WHERE dentist_id = ?',
        [dentistId]
      );

      if (dentistData.length === 0) return;

      const dentist = dentistData[0];
      const dentistName = `ทพ.${dentist.fname} ${dentist.lname}`;

      let title = '';
      let message = '';

      if (changeType === 'added') {
        title = '📅 มีการเพิ่มตารางงาน';
        message = `${dentistName} เพิ่มตารางงาน${dateRange} ${details}`;
      } else if (changeType === 'removed') {
        title = '🗓️ มีการลบตารางงาน';
        message = `${dentistName} ลบตารางงาน${dateRange} ${details}`;
      } else if (changeType === 'dayoff') {
        title = '🏖️ ทันตแพทย์ขอหยุด';
        message = `${dentistName} ขอหยุดในวันที่${dateRange} ${details}`;
      }

      // Notification for Admin only
      await db.execute(`
        INSERT INTO notifications (type, title, message, is_read, is_new)
        VALUES (?, ?, ?, 0, 1)
      `, [
        'schedule_change',
        title,
        message
      ]);

      console.log(`✅ สร้างการแจ้งเตือนการเปลี่ยนแปลงตารางงานสำเร็จ รหัสทันตแพทย์: ${dentistId}`);

    } catch (error) {
      console.error('เกิดข้อผิดพลาดในการสร้างการแจ้งเตือนการเปลี่ยนแปลงตารางงาน:', error);
    }
  }
};

module.exports = NotificationHelper;