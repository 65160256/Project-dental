/**
 * Available Slots Model
 * 
 * จัดการข้อมูลและ business logic ที่เกี่ยวข้องกับเวลาว่างสำหรับการจอง
 * - การดึงข้อมูลเวลาว่าง
 * - การตรวจสอบความพร้อมใช้งาน
 * - การกรองเวลาที่เหมาะสม
 */

const db = require('../config/db');

class AvailableSlotsModel {
  /**
   * ดึงข้อมูลเวลาว่างสำหรับ admin
   * @param {Object} params - พารามิเตอร์การค้นหา
   * @returns {Object} ผลลัพธ์การค้นหา
   */
  static async getAvailableSlotsForAdmin(params) {
    try {
      const { date, dentistId, treatmentId } = params;

      // ดึง duration ของการรักษา
    const [treatmentData] = await db.execute(
      'SELECT duration FROM treatment WHERE treatment_id = ?',
      [treatmentId]
    );

    if (treatmentData.length === 0) {
        return {
          success: false,
          error: 'ไม่พบข้อมูลการรักษา'
        };
    }

    const duration = treatmentData[0].duration;
      const requiredSlots = Math.ceil(duration / 30);

      // ดึง available slots ที่ว่างหรือไม่มีการจอง
      // เนื่องจากไม่มี dentist_id แล้ว ต้องใช้วิธีอื่นในการกรอง
      // สำหรับตอนนี้ให้ดึง slots ที่ว่างทั้งหมดก่อน แล้วกรองในโค้ด
    const [slots] = await db.execute(`
      SELECT
        s.slot_id,
        s.start_time,
        s.end_time,
        TIME_FORMAT(s.start_time, '%H:%i') as formatted_start_time,
        TIME_FORMAT(s.end_time, '%H:%i') as formatted_end_time
      FROM available_slots s
      WHERE s.date = ?
      AND s.is_available = 1
      AND s.dentist_treatment_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM queue q
        JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
        WHERE qd.dentist_id = ?
        AND DATE(q.time) = s.date
        AND TIME(q.time) = s.start_time
        AND q.queue_status IN ('pending', 'confirm')
      )
        ORDER BY s.start_time
      `, [date, dentistId]);

      console.log('Found', slots.length, 'available slots');

      // กรอง slots ที่เพียงพอและต่อเนื่อง
      const validSlots = [];
      
      for (let i = 0; i < slots.length; i++) {
        let hasEnoughTime = true;
        let consecutiveSlots = 1;
        
        for (let j = 1; j < requiredSlots && (i + j) < slots.length; j++) {
          const currentSlot = slots[i + j - 1];
          const nextSlot = slots[i + j];
          
          if (currentSlot.end_time === nextSlot.start_time) {
            consecutiveSlots++;
          } else {
            hasEnoughTime = false;
            break;
          }
        }
        
        if (hasEnoughTime && consecutiveSlots >= requiredSlots) {
          const startDateTime = new Date(`${date} ${slots[i].formatted_start_time}:00`);
          const endDateTime = new Date(startDateTime.getTime() + duration * 60000);
          const endHours = String(endDateTime.getHours()).padStart(2, '0');
          const endMinutes = String(endDateTime.getMinutes()).padStart(2, '0');
          
          validSlots.push({
            start_time: slots[i].formatted_start_time,
            end_time: `${endHours}:${endMinutes}`,
            display: `${slots[i].formatted_start_time} - ${endHours}:${endMinutes}`,
            duration: duration,
            slots_needed: requiredSlots
          });
        }
      }

    return {
      success: true,
        validSlots,
        duration,
        requiredSlots
      };
    } catch (error) {
      console.error('Error getting available slots for admin:', error);
      throw error;
    }
  }

  /**
   * ดึงรายชื่อทันตแพทย์ที่มีช่วงเวลาว่างสำหรับวันที่ระบุ (สำหรับผู้ป่วย)
   * - ถ้ามี treatment_id จะกรองเฉพาะทันตแพทย์ที่ทำการรักษานั้นได้
   * - คำนวณจำนวนช่วงเวลาว่างจาก dentist_schedule ที่เป็นสถานะทำงานและยังไม่มีคิว
   */
  static async getAvailableDentistsForBooking(date, treatmentId = null) {
    try {
      // ใช้ dentist_schedule แทน available_slots เพื่อให้สอดคล้องกับ calendar data
      let params = [date, date];
      let treatmentJoin = '';

      if (treatmentId) {
        treatmentJoin = 'JOIN dentist_treatment dt ON d.dentist_id = dt.dentist_id AND dt.treatment_id = ?';
        params.unshift(treatmentId);
      }

      const [rows] = await db.execute(
        `SELECT
           d.dentist_id,
           d.fname,
           d.lname,
           d.specialty,
           COUNT(DISTINCT CASE 
             WHEN s.is_available = 1 
             AND s.dentist_treatment_id IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM queue q 
               JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
               WHERE qd.dentist_id = d.dentist_id 
               AND DATE(q.time) = s.date 
               AND TIME(q.time) = s.start_time 
               AND q.queue_status IN ('pending','confirm')
             ) THEN s.slot_id 
           END) AS available_slots
         FROM dentist d
         ${treatmentJoin}
         JOIN dentist_schedule ds ON ds.dentist_id = d.dentist_id AND ds.schedule_date = ? AND ds.status = 'working'
         LEFT JOIN available_slots s ON s.date = ?
         WHERE d.user_id IS NOT NULL
         GROUP BY d.dentist_id, d.fname, d.lname, d.specialty
         HAVING available_slots > 0
         ORDER BY d.fname, d.lname`
      , params);

      // แนบรายการการรักษาของทันตแพทย์ (ย่อๆ เพื่อแสดงในการ์ด)
      const dentistIds = rows.map(r => r.dentist_id);
      let treatmentsByDentist = {};
      if (dentistIds.length > 0) {
        const [treatments] = await db.execute(
          `SELECT dt.dentist_id, t.treatment_id, t.treatment_name, t.duration
           FROM dentist_treatment dt
           JOIN treatment t ON dt.treatment_id = t.treatment_id
           WHERE dt.dentist_id IN (${dentistIds.map(()=>'?').join(',')})
           ORDER BY t.treatment_name`, dentistIds);
        treatmentsByDentist = treatments.reduce((acc, t) => {
          if (!acc[t.dentist_id]) acc[t.dentist_id] = [];
          acc[t.dentist_id].push({ treatment_id: t.treatment_id, treatment_name: t.treatment_name, duration: t.duration });
          return acc;
        }, {});
      }

      const result = rows.map(r => ({
        dentist_id: r.dentist_id,
        fname: r.fname,
        lname: r.lname,
        name: `${r.fname} ${r.lname}`, // เพิ่ม field name
        specialty: r.specialty,
        available_slots: r.available_slots,
        treatments: treatmentsByDentist[r.dentist_id] || []
      }));
      
      console.log(`🔍 getAvailableDentistsForBooking: Found ${result.length} dentists for date ${date}`, 
        result.map(d => ({ id: d.dentist_id, name: d.name, slots: d.available_slots })));
      
      return result;
    } catch (error) {
      console.error('Error getting available dentists for booking:', error);
      throw error;
    }
  }

  /**
   * ดึงช่วงเวลาว่างสำหรับผู้ป่วยตามวันที่/หมอ/การรักษา
   * - ใช้ dentist_schedule ชั่วโมงทำงาน แล้วแตกเป็นช่วง 30 นาที
   * - ตรวจสอบว่ามีคิวอยู่แล้วหรือไม่ (pending/confirm)
   * - คืนค่าช่วงเวลาเริ่มที่สามารถรองรับ duration ได้ครบถ้วนแบบต่อเนื่อง
   */
  static async getAvailableTimeSlotsForBooking(date, dentistId, treatmentId) {
    try {
      // ระยะเวลาการรักษา
      const [tRows] = await db.execute('SELECT duration FROM treatment WHERE treatment_id = ?', [treatmentId]);
      if (tRows.length === 0) return { slots: [] };
      const duration = parseInt(tRows[0].duration, 10) || 0;
      const requiredSlots = Math.max(1, Math.ceil(duration / 30));

      // ชั่วโมงทำงานของหมอในวันนั้น
      const [workRows] = await db.execute(
        `SELECT TIME_FORMAT(start_time, '%H:%i') as start_time, TIME_FORMAT(end_time, '%H:%i') as end_time
         FROM dentist_schedule
         WHERE dentist_id = ? AND schedule_date = ? AND status = 'working'
         ORDER BY start_time ASC`,
        [dentistId, date]
      );

      if (workRows.length === 0) return { slots: [] };

      // เวลาที่ถูกจองแล้ว
      const [bookedRows] = await db.execute(
        `SELECT TIME_FORMAT(q.time, '%H:%i') as start_time
         FROM queue q
         JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
         WHERE qd.dentist_id = ? AND DATE(q.time) = ? AND q.queue_status IN ('pending','confirm')`,
        [dentistId, date]
      );
      const bookedSet = new Set(bookedRows.map(r => r.start_time));

      // สร้างรายการช่วงเริ่ม 30 นาทีจากช่วงทำงานทั้งหมด
      const candidateStarts = [];
      for (const w of workRows) {
        const [sh, sm] = w.start_time.split(':').map(Number);
        const [eh, em] = w.end_time.split(':').map(Number);
        let startMinutes = sh * 60 + sm;
        const endMinutes = eh * 60 + em;
        while (startMinutes + 30 <= endMinutes) { // เริ่มทุก 30 นาทีภายในบล็อกชั่วโมง
          const hh = String(Math.floor(startMinutes / 60)).padStart(2, '0');
          const mm = String(startMinutes % 60).padStart(2, '0');
          candidateStarts.push(`${hh}:${mm}`);
          startMinutes += 30;
        }
      }

      // ตรวจสอบความต่อเนื่องของช่วง 30 นาทีตาม requiredSlots และไม่มีการจองทับ
      const validSlots = [];
      const candidateSet = new Set(candidateStarts);
      for (const start of candidateStarts) {
        // ตรวจสอบว่าแต่ละก้อน 30 นาทีถัดไปยังอยู่ใน candidate และไม่ถูกจอง
        let ok = true;
        let sMin = parseInt(start.split(':')[0], 10) * 60 + parseInt(start.split(':')[1], 10);
        for (let i = 0; i < requiredSlots; i++) {
          const hh = String(Math.floor(sMin / 60)).padStart(2, '0');
          const mm = String(sMin % 60).padStart(2, '0');
          const seg = `${hh}:${mm}`;
          if (!candidateSet.has(seg) || bookedSet.has(seg)) { ok = false; break; }
          sMin += 30;
        }
        if (ok) {
          const endMin = (parseInt(start.split(':')[0], 10) * 60 + parseInt(start.split(':')[1], 10)) + duration;
          const endH = String(Math.floor(endMin / 60)).padStart(2, '0');
          const endM = String(endMin % 60).padStart(2, '0');
          validSlots.push({
            start_time: start,
            formatted_start_time: start,
            end_time: `${endH}:${endM}`,
            duration,
            slots_needed: requiredSlots
          });
        }
      }

      // เอาเฉพาะเวลาในอนาคต 24 ชั่วโมงขึ้นไป
      const now = new Date();
      const filtered = validSlots.filter(s => {
        const dt = new Date(`${date} ${s.start_time}:00`);
        return (dt.getTime() - now.getTime()) / (1000*3600) >= 24;
      });

      return { slots: filtered };
    } catch (error) {
      console.error('Error getting available time slots for booking:', error);
      throw error;
    }
  }

  /**
   * ตรวจสอบช่วงเวลา 30 นาทีต่อเนื่องตามจำนวนที่ต้องการ ว่าว่างจริงหรือไม่
   * ใช้ประกอบการยืนยันการจอง
   */
  static async getConsecutiveSlots(dentistId, date, startTime, requiredSlots) {
    try {
      // เวลาที่ถูกจองแล้วในวันนั้น
      const [bookedRows] = await db.execute(
        `SELECT TIME_FORMAT(q.time, '%H:%i') as start_time
         FROM queue q
         JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
         WHERE qd.dentist_id = ? AND DATE(q.time) = ? AND q.queue_status IN ('pending','confirm')`,
        [dentistId, date]
      );
      const bookedSet = new Set(bookedRows.map(r => r.start_time));

      // สร้างชุดเวลา 30 นาทีตาม requiredSlots
      const slots = [];
      let sMin = parseInt(startTime.split(':')[0], 10) * 60 + parseInt(startTime.split(':')[1], 10);
      for (let i = 0; i < requiredSlots; i++) {
        const hh = String(Math.floor(sMin / 60)).padStart(2, '0');
        const mm = String(sMin % 60).padStart(2, '0');
        const seg = `${hh}:${mm}`;
        // ต้องอยู่ในช่วงทำงานของหมอ
        const [inWork] = await db.execute(
          `SELECT 1 FROM dentist_schedule 
           WHERE dentist_id = ? AND schedule_date = ? AND status = 'working'
             AND TIME_FORMAT(start_time, '%H:%i') <= ? AND TIME_FORMAT(end_time, '%H:%i') > ?
           LIMIT 1`,
          [dentistId, date, seg, seg]
        );
        if (inWork.length === 0 || bookedSet.has(seg)) return [];
        slots.push({ start_time: seg });
        sMin += 30;
      }
      return slots;
    } catch (error) {
      console.error('Error checking consecutive slots:', error);
      throw error;
    }
  }
}

module.exports = AvailableSlotsModel;
