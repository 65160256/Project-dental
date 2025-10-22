-- ตรวจสอบสถานะทั้งหมดในตาราง queue
SELECT 
    q.queue_id,
    q.queue_status,
    CONCAT(p.fname, ' ', p.lname) as patient_name,
    q.time,
    q.created_at
FROM queue q
JOIN patient p ON q.patient_id = p.patient_id
ORDER BY q.queue_id DESC;

-- ตรวจสอบว่ามี waiting_for_treatment อยู่หรือไม่
SELECT COUNT(*) as waiting_count
FROM queue 
WHERE queue_status = 'waiting_for_treatment';

-- ตรวจสอบสถานะทั้งหมดที่มีอยู่
SELECT queue_status, COUNT(*) as count
FROM queue 
GROUP BY queue_status;

