-- Update existing waiting_for_treatment records to confirm status
-- This script updates any records that still have the old waiting_for_treatment status

UPDATE queue 
SET queue_status = 'confirm' 
WHERE queue_status = 'waiting_for_treatment';

-- Show the updated records
SELECT 
    q.queue_id,
    q.queue_status,
    CONCAT(p.fname, ' ', p.lname) as patient_name,
    q.time
FROM queue q
JOIN patient p ON q.patient_id = p.patient_id
WHERE q.queue_status = 'confirm'
ORDER BY q.time DESC;
