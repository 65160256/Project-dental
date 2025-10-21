-- Migration script to remove redundant dentist_id and patient_id from notifications table
-- These fields can be accessed through queue_id -> queuedetail relationship

-- Step 1: Backup current notifications table (optional)
-- CREATE TABLE notifications_backup AS SELECT * FROM notifications;

-- Step 2: Remove foreign key constraints
ALTER TABLE notifications DROP FOREIGN KEY IF EXISTS fk_notifications_patient;
ALTER TABLE notifications DROP FOREIGN KEY IF EXISTS fk_notifications_dentist;

-- Step 3: Drop indexes
DROP INDEX IF EXISTS idx_notif_patient ON notifications;
DROP INDEX IF EXISTS idx_notif_dentist ON notifications;

-- Step 4: Remove the redundant columns
ALTER TABLE notifications DROP COLUMN IF EXISTS patient_id;
ALTER TABLE notifications DROP COLUMN IF EXISTS dentist_id;

-- Note: After this migration, you need to update the following files:
-- - jobs/notificationJobs.js (2 locations)
-- - utils/notificationHelper.js (15 locations) 
-- - models/PatientAdmin.model.js (2 locations)
-- - models/NotificationAdmin.model.js (1 location)
-- 
-- Remove dentist_id and patient_id from INSERT statements
-- Update DELETE statements to use JOINs instead

-- Verification query to check the new structure
DESCRIBE notifications;
