-- อัปเดตคอลัมน์ queue_status ในตาราง queue
-- เพิ่มสถานะใหม่: waiting_for_treatment, auto_cancelled

ALTER TABLE queue 
MODIFY COLUMN queue_status 
ENUM('pending', 'confirm', 'completed', 'cancel', 'waiting_for_treatment', 'auto_cancelled') 
DEFAULT 'pending';

-- ตรวจสอบโครงสร้างตาราง
DESCRIBE queue;
