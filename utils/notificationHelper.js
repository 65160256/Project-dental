// utils/notificationHelper.js
const db = require('../config/db');

const NotificationHelper = {
  // สร้าง notification เมื่อมีการจองนัดหมายใหม่
  async createNewAppointmentNotification(appointmentId, patientId, dentistId) {
    try {
      const [patientData] = await db.execute(
        'SELECT fname, lname, phone FROM patient WHERE patient_id = ?',
        [patientId]
      );
      
      const [dentistData] = await db.execute(
        'SELECT fname, lname FROM dentist WHERE dentist_id = ?',
        [dentistId]
      );
      
      const [appointmentData] = await db.execute(
        'SELECT time, treatment_id FROM queue WHERE queue_id = ?',
        [appointmentId]
      );

      if (patientData.length === 0 || dentistData.length === 0 || appointmentData.length === 0) {
        console.error('Cannot create notification: Missing data');
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
      await db.execute(`
        INSERT INTO notifications (type, title, message, queue_id, dentist_id, patient_id, is_read, is_new)
        VALUES (?, ?, ?, ?, ?, ?, 0, 1)
      `, [
        'new_appointment',
        '🆕 มีการจองนัดหมายใหม่',
        `${patient.fname} ${patient.lname} จองนัดหมายกับ ทพ.${dentist.fname} ${dentist.lname} สำหรับ${treatmentName} วันที่ ${formattedDate} เวลา ${formattedTime} น.`,
        appointmentId,
        dentistId,
        patientId
      ]);

      // Notification for Dentist
      await db.execute(`
        INSERT INTO notifications (type, title, message, queue_id, dentist_id, patient_id, is_read, is_new)
        VALUES (?, ?, ?, ?, ?, ?, 0, 1)
      `, [
        'new_appointment',
        '🆕 คุณมีนัดหมายใหม่',
        `ผู้ป่วย ${patient.fname} ${patient.lname} (${patient.phone}) จองนัดหมายสำหรับ${treatmentName} วันที่ ${formattedDate} เวลา ${formattedTime} น.`,
        appointmentId,
        dentistId,
        patientId
      ]);

      console.log(`✅ Created appointment notification for appointment ${appointmentId}`);

    } catch (error) {
      console.error('Error creating appointment notification:', error);
    }
  },

  // สร้าง notification เมื่อยืนยันการจอง
  async createConfirmationNotification(appointmentId, patientId, dentistId) {
    try {
      const [appointmentData] = await db.execute(`
        SELECT q.time, t.treatment_name, CONCAT(d.fname, ' ', d.lname) as dentist_name,
               CONCAT(p.fname, ' ', p.lname) as patient_name
        FROM queue q
        JOIN dentist d ON q.dentist_id = d.dentist_id
        JOIN treatment t ON q.treatment_id = t.treatment_id
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
        INSERT INTO notifications (type, title, message, queue_id, dentist_id, patient_id, is_read, is_new)
        VALUES (?, ?, ?, ?, ?, ?, 0, 1)
      `, [
        'appointment_confirmed',
        '✅ การจองได้รับการยืนยันแล้ว',
        `การจองของคุณกับ ${appointment.dentist_name} สำหรับ${appointment.treatment_name} วันที่ ${formattedDate} เวลา ${formattedTime} น. ได้รับการยืนยันแล้ว`,
        appointmentId,
        dentistId,
        patientId
      ]);

      // Notification for Admin
      await db.execute(`
        INSERT INTO notifications (type, title, message, queue_id, dentist_id, patient_id, is_read, is_new)
        VALUES (?, ?, ?, ?, ?, ?, 0, 1)
      `, [
        'appointment_confirmed',
        '✅ มีการยืนยันนัดหมาย',
        `ทพ.${appointment.dentist_name} ยืนยันนัดหมายของ ${appointment.patient_name} วันที่ ${formattedDate} เวลา ${formattedTime} น.`,
        appointmentId,
        dentistId,
        patientId
      ]);

      console.log(`✅ Created confirmation notification for appointment ${appointmentId}`);

    } catch (error) {
      console.error('Error creating confirmation notification:', error);
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
        JOIN dentist d ON q.dentist_id = d.dentist_id
        JOIN patient p ON q.patient_id = p.patient_id
        JOIN treatment t ON q.treatment_id = t.treatment_id
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
          INSERT INTO notifications (type, title, message, appointment_id, dentist_id, patient_id, is_read, is_new)
          VALUES (?, ?, ?, ?, ?, ?, 0, 1)
        `, [
          'appointment_cancelled',
          '❌ มีการยกเลิกนัดหมาย',
          `${appointment.patient_name} ยกเลิกนัดหมายกับ ${appointment.dentist_name} วันที่ ${formattedDate} เวลา ${formattedTime} น.${reasonText}`,
          appointmentId,
          dentistId,
          patientId
        ]);

        // แจ้งเตือน Dentist
        await db.execute(`
          INSERT INTO notifications (type, title, message, appointment_id, dentist_id, patient_id, is_read, is_new)
          VALUES (?, ?, ?, ?, ?, ?, 0, 1)
        `, [
          'appointment_cancelled',
          '❌ ผู้ป่วยยกเลิกนัดหมาย',
          `${appointment.patient_name} (${appointment.phone}) ยกเลิกนัดหมายวันที่ ${formattedDate} เวลา ${formattedTime} น.${reasonText}`,
          appointmentId,
          dentistId,
          patientId
        ]);
      } else if (cancelledBy === 'dentist') {
        // แจ้งเตือน Patient
        await db.execute(`
          INSERT INTO notifications (type, title, message, appointment_id, dentist_id, patient_id, is_read, is_new)
          VALUES (?, ?, ?, ?, ?, ?, 0, 1)
        `, [
          'appointment_cancelled',
          '❌ การจองถูกยกเลิก',
          `การจองของคุณกับ ${appointment.dentist_name} วันที่ ${formattedDate} เวลา ${formattedTime} น. ถูกยกเลิก${reasonText}`,
          appointmentId,
          dentistId,
          patientId
        ]);

        // แจ้งเตือน Admin
        await db.execute(`
          INSERT INTO notifications (type, title, message, appointment_id, dentist_id, patient_id, is_read, is_new)
          VALUES (?, ?, ?, ?, ?, ?, 0, 1)
        `, [
          'appointment_cancelled',
          '❌ ทันตแพทย์ยกเลิกนัดหมาย',
          `ทพ.${appointment.dentist_name} ยกเลิกนัดหมายของ ${appointment.patient_name} วันที่ ${formattedDate} เวลา ${formattedTime} น.${reasonText}`,
          appointmentId,
          dentistId,
          patientId
        ]);
      } else {
        // ยกเลิกโดย Admin
        // แจ้งเตือน Patient
        await db.execute(`
          INSERT INTO notifications (type, title, message, appointment_id, dentist_id, patient_id, is_read, is_new)
          VALUES (?, ?, ?, ?, ?, ?, 0, 1)
        `, [
          'appointment_cancelled',
          '❌ การจองถูกยกเลิก',
          `การจองของคุณกับ ${appointment.dentist_name} วันที่ ${formattedDate} เวลา ${formattedTime} น. ถูกยกเลิก${reasonText}`,
          appointmentId,
          dentistId,
          patientId
        ]);

        // แจ้งเตือน Dentist
        await db.execute(`
          INSERT INTO notifications (type, title, message, appointment_id, dentist_id, patient_id, is_read, is_new)
          VALUES (?, ?, ?, ?, ?, ?, 0, 1)
        `, [
          'appointment_cancelled',
          '❌ นัดหมายถูกยกเลิก',
          `นัดหมายของ ${appointment.patient_name} วันที่ ${formattedDate} เวลา ${formattedTime} น. ถูกยกเลิกโดยแอดมิน${reasonText}`,
          appointmentId,
          dentistId,
          patientId
        ]);
      }

      console.log(`✅ Created cancellation notification for appointment ${appointmentId}`);

    } catch (error) {
      console.error('Error creating cancellation notification:', error);
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
        JOIN dentist d ON q.dentist_id = d.dentist_id
        JOIN treatment t ON q.treatment_id = t.treatment_id
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
        INSERT INTO notifications (type, title, message, queue_id, dentist_id, patient_id, is_read, is_new)
        VALUES (?, ?, ?, ?, ?, ?, 0, 1)
      `, [
        'appointment_reminder',
        '⏰ เตือนนัดหมายพรุ่งนี้',
        `คุณมีนัดหมายพรุ่งนี้ วันที่ ${formattedDate} เวลา ${formattedTime} น. กับ ${appointment.dentist_name} สำหรับ${appointment.treatment_name}`,
        appointmentId,
        dentistId,
        patientId
      ]);

      // Notification for Dentist
      await db.execute(`
        INSERT INTO notifications (type, title, message, queue_id, dentist_id, patient_id, is_read, is_new)
        VALUES (?, ?, ?, ?, ?, ?, 0, 1)
      `, [
        'appointment_reminder',
        '⏰ เตือนนัดหมายพรุ่งนี้',
        `พรุ่งนี้คุณมีนัดกับ ${appointment.patient_name} เวลา ${formattedTime} น. สำหรับ${appointment.treatment_name}`,
        appointmentId,
        dentistId,
        patientId
      ]);

      console.log(`✅ Created reminder notification for appointment ${appointmentId}`);

    } catch (error) {
      console.error('Error creating reminder notification:', error);
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
        JOIN dentist d ON q.dentist_id = d.dentist_id
        JOIN treatment t ON q.treatment_id = t.treatment_id
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

      // Notification for Patient
      await db.execute(`
        INSERT INTO notifications (type, title, message, queue_id, dentist_id, patient_id, is_read, is_new)
        VALUES (?, ?, ?, ?, ?, ?, 0, 1)
      `, [
        'treatment_completed',
        '📝 บันทึกประวัติการรักษาแล้ว',
        `${appointment.dentist_name} ได้บันทึกประวัติการรักษา${appointment.treatment_name}ของคุณแล้ว คุณสามารถดูรายละเอียดได้ในประวัติการรักษา`,
        appointmentId,
        dentistId,
        patientId
      ]);

      // Notification for Admin
      await db.execute(`
        INSERT INTO notifications (type, title, message, queue_id, dentist_id, patient_id, is_read, is_new)
        VALUES (?, ?, ?, ?, ?, ?, 0, 1)
      `, [
        'treatment_completed',
        '📝 มีการบันทึกประวัติการรักษา',
        `ทพ.${appointment.dentist_name} บันทึกประวัติการรักษา${appointment.treatment_name}ของ ${appointment.patient_name} เมื่อ ${formattedDate}`,
        appointmentId,
        dentistId,
        patientId
      ]);

      console.log(`✅ Created treatment record notification for appointment ${appointmentId}`);

    } catch (error) {
      console.error('Error creating treatment record notification:', error);
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
        INSERT INTO notifications (type, title, message, dentist_id, is_read, is_new)
        VALUES (?, ?, ?, ?, 0, 1)
      `, [
        'schedule_change',
        title,
        message,
        dentistId
      ]);

      console.log(`✅ Created schedule change notification for dentist ${dentistId}`);

    } catch (error) {
      console.error('Error creating schedule change notification:', error);
    }
  }
};

module.exports = NotificationHelper;