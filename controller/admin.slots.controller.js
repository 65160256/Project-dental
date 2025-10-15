// Admin controller for managing available slots

const AvailableSlotsModel = require('../models/AvailableSlots.model');

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

    // ใช้ Model แทน SQL โดยตรง
    await AvailableSlotsModel.generateSlots(start_date, end_date);

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

    // ใช้ Model แทน SQL โดยตรง
    await AvailableSlotsModel.generateSlots(startDate, endDate);

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
    // ใช้ Model แทน SQL โดยตรง
    const statistics = await AvailableSlotsModel.getSlotsStatistics();

    res.json({
      success: true,
      ...statistics
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
    // ใช้ Model แทน SQL โดยตรง
    const result = await AvailableSlotsModel.cleanupOldSlots();

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

    // ใช้ Model แทน SQL โดยตรง
    const slots = await AvailableSlotsModel.getDentistSlotsWithDetails(dentist_id, date);

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

    // Check if slot already exists โดยใช้ Model
    const exists = await AvailableSlotsModel.slotExists(dentist_id, date, start_time);

    if (exists) {
      return res.status(400).json({
        success: false,
        error: 'Slot นี้มีอยู่แล้ว'
      });
    }

    // ใช้ Model แทน SQL โดยตรง
    await AvailableSlotsModel.createSlot({ dentist_id, date, start_time, end_time });

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

    // Check if slot is booked โดยใช้ Model
    const slot = await AvailableSlotsModel.getSlotWithBookingStatus(slot_id);

    if (!slot) {
      return res.status(404).json({
        success: false,
        error: 'ไม่พบ slot นี้'
      });
    }

    if (slot.queue_id) {
      return res.status(400).json({
        success: false,
        error: 'ไม่สามารถลบ slot ที่มีการจองแล้ว'
      });
    }

    // ใช้ Model แทน SQL โดยตรง
    await AvailableSlotsModel.deleteSlot(slot_id);

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

    // ใช้ Model แทน SQL โดยตรง
    const result = await AvailableSlotsModel.updateSlotAvailability(slot_id, is_available);

    if (!result.success) {
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
