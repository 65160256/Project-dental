// Admin controller for managing available slots

const db = require('../config/db');

// Generate slots for a date range
exports.generateSlots = async (req, res) => {
  try {
    const { start_date, end_date } = req.body;
    
    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: 'กรุณาระบุวันที่เริ่มต้นและสิ้นสุด'
      });
    }

    // Call stored procedure
    await db.execute('CALL generate_available_slots(?, ?)', [start_date, end_date]);

    res.json({
      success: true,
      message: `สร้าง slots สำเร็จสำหรับวันที่ ${start_date} ถึง ${end_date}`
    });

  } catch (error) {
    console.error('Error generating slots:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการสร้าง slots'
    });
  }
};

// Regenerate slots for today onwards (next 3 months)
exports.regenerateSlots = async (req, res) => {
  try {
    const today = new Date();
    const threeMonthsLater = new Date();
    threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

    const startDate = today.toISOString().split('T')[0];
    const endDate = threeMonthsLater.toISOString().split('T')[0];

    await db.execute('CALL generate_available_slots(?, ?)', [startDate, endDate]);

    res.json({
      success: true,
      message: 'สร้าง slots ใหม่สำเร็จสำหรับ 3 เดือนข้างหน้า',
      start_date: startDate,
      end_date: endDate
    });

  } catch (error) {
    console.error('Error regenerating slots:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการสร้าง slots ใหม่'
    });
  }
};

// Get slots statistics
exports.getSlotsStatistics = async (req, res) => {
  try {
    const [stats] = await db.execute(`
      SELECT 
        COUNT(*) as total_slots,
        COUNT(CASE WHEN is_available = 1 THEN 1 END) as available_slots,
        COUNT(CASE WHEN is_available = 0 THEN 1 END) as booked_slots,
        COUNT(DISTINCT dentist_id) as total_dentists,
        COUNT(DISTINCT date) as total_days,
        MIN(date) as earliest_date,
        MAX(date) as latest_date
      FROM available_slots
      WHERE date >= CURDATE()
    `);

    const [slotsByDentist] = await db.execute(`
      SELECT 
        d.dentist_id,
        CONCAT(d.fname, ' ', d.lname) as dentist_name,
        d.specialty,
        COUNT(s.slot_id) as total_slots,
        COUNT(CASE WHEN s.is_available = 1 THEN 1 END) as available_slots,
        COUNT(CASE WHEN s.is_available = 0 THEN 1 END) as booked_slots
      FROM dentist d
      LEFT JOIN available_slots s ON d.dentist_id = s.dentist_id AND s.date >= CURDATE()
      WHERE d.user_id IS NOT NULL
      GROUP BY d.dentist_id, d.fname, d.lname, d.specialty
      ORDER BY d.fname, d.lname
    `);

    const [slotsByDate] = await db.execute(`
      SELECT 
        date,
        COUNT(*) as total_slots,
        COUNT(CASE WHEN is_available = 1 THEN 1 END) as available_slots,
        COUNT(CASE WHEN is_available = 0 THEN 1 END) as booked_slots,
        COUNT(DISTINCT dentist_id) as dentists_working
      FROM available_slots
      WHERE date >= CURDATE()
      AND date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
      GROUP BY date
      ORDER BY date
    `);

    res.json({
      success: true,
      overall: stats[0],
      by_dentist: slotsByDentist,
      next_7_days: slotsByDate
    });

  } catch (error) {
    console.error('Error getting slots statistics:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงสถิติ'
    });
  }
};

// Delete old slots (past dates)
exports.cleanupOldSlots = async (req, res) => {
  try {
    const [result] = await db.execute(`
      DELETE FROM available_slots
      WHERE date < CURDATE()
    `);

    res.json({
      success: true,
      message: 'ลบ slots เก่าเรียบร้อยแล้ว',
      deleted_count: result.affectedRows
    });

  } catch (error) {
    console.error('Error cleaning up old slots:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการลบ slots เก่า'
    });
  }
};

// Get slots for specific dentist and date
exports.getDentistSlots = async (req, res) => {
  try {
    const { dentist_id, date } = req.query;

    if (!dentist_id || !date) {
      return res.status(400).json({
        success: false,
        error: 'กรุณาระบุ dentist_id และ date'
      });
    }

    const [slots] = await db.execute(`
      SELECT 
        s.slot_id,
        s.date,
        s.start_time,
        s.end_time,
        s.is_available,
        s.treatment_id,
        t.treatment_name,
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM queue q
            WHERE q.dentist_id = s.dentist_id 
            AND DATE(q.time) = s.date 
            AND TIME(q.time) = s.start_time
            AND q.queue_status IN ('pending', 'confirm')
          ) THEN 'booked'
          WHEN s.is_available = 1 THEN 'available'
          ELSE 'unavailable'
        END as status,
        q.queue_id,
        CONCAT(p.fname, ' ', p.lname) as patient_name
      FROM available_slots s
      LEFT JOIN treatment t ON s.treatment_id = t.treatment_id
      LEFT JOIN queue q ON s.dentist_id = q.dentist_id 
        AND DATE(q.time) = s.date 
        AND TIME(q.time) = s.start_time
        AND q.queue_status IN ('pending', 'confirm')
      LEFT JOIN patient p ON q.patient_id = p.patient_id
      WHERE s.dentist_id = ?
      AND s.date = ?
      ORDER BY s.start_time
    `, [dentist_id, date]);

    res.json({
      success: true,
      slots: slots,
      total: slots.length
    });

  } catch (error) {
    console.error('Error getting dentist slots:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการดึงข้อมูล slots'
    });
  }
};

// Manually create a slot
exports.createSlot = async (req, res) => {
  try {
    const { dentist_id, date, start_time, end_time } = req.body;

    if (!dentist_id || !date || !start_time || !end_time) {
      return res.status(400).json({
        success: false,
        error: 'กรุณากรอกข้อมูลให้ครบถ้วน'
      });
    }

    // Check if slot already exists
    const [existing] = await db.execute(`
      SELECT slot_id FROM available_slots
      WHERE dentist_id = ? AND date = ? AND start_time = ?
    `, [dentist_id, date, start_time]);

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Slot นี้มีอยู่แล้ว'
      });
    }

    await db.execute(`
      INSERT INTO available_slots (dentist_id, date, start_time, end_time, is_available)
      VALUES (?, ?, ?, ?, 1)
    `, [dentist_id, date, start_time, end_time]);

    res.json({
      success: true,
      message: 'สร้าง slot สำเร็จ'
    });

  } catch (error) {
    console.error('Error creating slot:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการสร้าง slot'
    });
  }
};

// Delete a slot
exports.deleteSlot = async (req, res) => {
  try {
    const { slot_id } = req.params;

    // Check if slot is booked
    const [slot] = await db.execute(`
      SELECT s.*, q.queue_id
      FROM available_slots s
      LEFT JOIN queue q ON s.dentist_id = q.dentist_id 
        AND DATE(q.time) = s.date 
        AND TIME(q.time) = s.start_time
        AND q.queue_status IN ('pending', 'confirm')
      WHERE s.slot_id = ?
    `, [slot_id]);

    if (slot.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบ slot นี้'
      });
    }

    if (slot[0].queue_id) {
      return res.status(400).json({
        success: false,
        error: 'ไม่สามารถลบ slot ที่มีการจองแล้ว'
      });
    }

    await db.execute('DELETE FROM available_slots WHERE slot_id = ?', [slot_id]);

    res.json({
      success: true,
      message: 'ลบ slot สำเร็จ'
    });

  } catch (error) {
    console.error('Error deleting slot:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการลบ slot'
    });
  }
};

// Update slot availability
exports.updateSlotAvailability = async (req, res) => {
  try {
    const { slot_id } = req.params;
    const { is_available } = req.body;

    const [result] = await db.execute(`
      UPDATE available_slots
      SET is_available = ?, updated_at = NOW()
      WHERE slot_id = ?
    `, [is_available ? 1 : 0, slot_id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบ slot นี้'
      });
    }

    res.json({
      success: true,
      message: 'อัปเดต slot สำเร็จ'
    });

  } catch (error) {
    console.error('Error updating slot:', error);
    res.status(500).json({
      success: false,
      error: 'เกิดข้อผิดพลาดในการอัปเดต slot'
    });
  }
};

module.exports = {
  generateSlots,
  regenerateSlots,
  getSlotsStatistics,
  cleanupOldSlots,
  getDentistSlots,
  createSlot,
  deleteSlot,
  updateSlotAvailability
};