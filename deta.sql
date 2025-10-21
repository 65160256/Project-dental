-- MySQL schema for Dentist system matching the provided ER diagram
-- Safe to run on MySQL 8.0; uses InnoDB and utf8mb4

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS=0;

CREATE DATABASE IF NOT EXISTS `dentist_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE `dentist_db`;

-- ROLES
CREATE TABLE IF NOT EXISTS `role` (
  `role_id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(50) NOT NULL,
  PRIMARY KEY (`role_id`),
  UNIQUE KEY `uq_role_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- USERS
CREATE TABLE IF NOT EXISTS `user` (
  `user_id` INT NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(100) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `username` VARCHAR(100) DEFAULT NULL,
  `last_login` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `role_id` INT NOT NULL,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_user_email` (`email`),
  UNIQUE KEY `uq_user_username` (`username`),
  KEY `idx_user_role` (`role_id`),
  CONSTRAINT `fk_user_role` FOREIGN KEY (`role_id`) REFERENCES `role`(`role_id`) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- PASSWORD RESETS
CREATE TABLE IF NOT EXISTS `password_resets` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(255) NOT NULL,
  `token` VARCHAR(255) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `used_at` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `user_id` INT DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_pr_email` (`email`),
  KEY `idx_pr_token` (`token`),
  CONSTRAINT `fk_password_resets_user` FOREIGN KEY (`user_id`) REFERENCES `user`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- PATIENTS
CREATE TABLE IF NOT EXISTS `patient` (
  `patient_id` INT NOT NULL AUTO_INCREMENT,
  `fname` VARCHAR(50) NOT NULL,
  `lname` VARCHAR(50) NOT NULL,
  `gender` ENUM('M','F','O') DEFAULT NULL,
  `phone` VARCHAR(20) DEFAULT NULL,
  `dob` DATE DEFAULT NULL,
  `address` TEXT,
  `chronic_disease` TEXT,
  `surgery_history` TEXT,
  `id_card` VARCHAR(20) DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `user_id` INT NOT NULL,
  PRIMARY KEY (`patient_id`),
  UNIQUE KEY `uq_patient_user` (`user_id`),
  KEY `idx_patient_id_card` (`id_card`),
  CONSTRAINT `fk_patient_user` FOREIGN KEY (`user_id`) REFERENCES `user`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- DENTISTS
CREATE TABLE IF NOT EXISTS `dentist` (
  `dentist_id` INT NOT NULL AUTO_INCREMENT,
  `fname` VARCHAR(50) NOT NULL,
  `lname` VARCHAR(50) NOT NULL,
  `specialty` VARCHAR(100) DEFAULT NULL,
  `phone` VARCHAR(20) DEFAULT NULL,
  `address` TEXT,
  `dob` DATE DEFAULT NULL,
  `id_card` VARCHAR(20) DEFAULT NULL,
  `education` TEXT,
  `work_start_time` TIME DEFAULT NULL,
  `work_end_time` TIME DEFAULT NULL,
  `photo` VARCHAR(255) DEFAULT NULL,
  `license_no` VARCHAR(20) DEFAULT NULL,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `user_id` INT NOT NULL,
  PRIMARY KEY (`dentist_id`),
  UNIQUE KEY `uq_dentist_user` (`user_id`),
  KEY `idx_dentist_license` (`license_no`),
  CONSTRAINT `fk_dentist_user` FOREIGN KEY (`user_id`) REFERENCES `user`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- TREATMENTS
CREATE TABLE IF NOT EXISTS `treatment` (
  `treatment_id` INT NOT NULL AUTO_INCREMENT,
  `treatment_name` VARCHAR(100) NOT NULL,
  `duration` INT DEFAULT NULL,
  PRIMARY KEY (`treatment_id`),
  UNIQUE KEY `uq_treatment_name` (`treatment_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- DENTIST_TREATMENT (mapping)
CREATE TABLE IF NOT EXISTS `dentist_treatment` (
  `dentist_treatment_id` INT NOT NULL AUTO_INCREMENT,
  `treatment_id` INT NOT NULL,
  `dentist_id` INT NOT NULL,
  PRIMARY KEY (`dentist_treatment_id`),
  UNIQUE KEY `uq_dentist_treatment` (`treatment_id`,`dentist_id`),
  KEY `idx_dt_dentist` (`dentist_id`),
  CONSTRAINT `fk_dt_treatment` FOREIGN KEY (`treatment_id`) REFERENCES `treatment`(`treatment_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_dt_dentist` FOREIGN KEY (`dentist_id`) REFERENCES `dentist`(`dentist_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- AVAILABLE SLOTS (normalized by dentist_treatment)
CREATE TABLE IF NOT EXISTS `available_slots` (
  `slot_id` INT NOT NULL AUTO_INCREMENT,
  `date` DATE NOT NULL,
  `start_time` TIME NOT NULL,
  `end_time` TIME NOT NULL,
  `is_available` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `dentist_treatment_id` INT NOT NULL,
  PRIMARY KEY (`slot_id`),
  KEY `idx_slots_dt` (`dentist_treatment_id`),
  KEY `idx_slots_date` (`date`),
  CONSTRAINT `fk_slots_dt` FOREIGN KEY (`dentist_treatment_id`) REFERENCES `dentist_treatment`(`dentist_treatment_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- DENTIST SCHEDULE (by day/hour)
CREATE TABLE IF NOT EXISTS `dentist_schedule` (
  `schedule_id` INT NOT NULL AUTO_INCREMENT,
  `schedule_date` DATE DEFAULT NULL,
  `day_of_week` INT DEFAULT NULL,
  `hour` INT DEFAULT NULL,
  `status` ENUM('available','busy','off') DEFAULT 'available',
  `start_time` TIME DEFAULT NULL,
  `end_time` TIME DEFAULT NULL,
  `note` TEXT,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `dentist_id` INT NOT NULL,
  PRIMARY KEY (`schedule_id`),
  KEY `idx_schedule_dentist` (`dentist_id`),
  KEY `idx_schedule_date` (`schedule_date`),
  CONSTRAINT `fk_schedule_dentist` FOREIGN KEY (`dentist_id`) REFERENCES `dentist`(`dentist_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- QUEUE (appointment)
CREATE TABLE IF NOT EXISTS `queue` (
  `queue_id` INT NOT NULL AUTO_INCREMENT,
  `time` DATETIME NOT NULL,
  `queue_status` ENUM('pending','confirmed','canceled','completed') NOT NULL DEFAULT 'pending',
  `patient_id` INT NOT NULL,
  `queuedetail_id` INT DEFAULT NULL,
  PRIMARY KEY (`queue_id`),
  KEY `idx_queue_patient` (`patient_id`),
  KEY `idx_queue_qd` (`queuedetail_id`),
  CONSTRAINT `fk_queue_patient` FOREIGN KEY (`patient_id`) REFERENCES `patient`(`patient_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- QUEUE DETAIL
CREATE TABLE IF NOT EXISTS `queuedetail` (
  `queuedetail_id` INT NOT NULL AUTO_INCREMENT,
  `patient_id` INT NOT NULL,
  `treatment_id` INT NOT NULL,
  `dentist_id` INT NOT NULL,
  `date` DATE NOT NULL,
  `created_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  `note` TEXT,
  PRIMARY KEY (`queuedetail_id`),
  KEY `idx_qd_patient` (`patient_id`),
  KEY `idx_qd_treatment` (`treatment_id`),
  KEY `idx_qd_dentist` (`dentist_id`),
  CONSTRAINT `fk_qd_patient` FOREIGN KEY (`patient_id`) REFERENCES `patient`(`patient_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_qd_treatment` FOREIGN KEY (`treatment_id`) REFERENCES `treatment`(`treatment_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_qd_dentist` FOREIGN KEY (`dentist_id`) REFERENCES `dentist`(`dentist_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- TREATMENT HISTORY
CREATE TABLE IF NOT EXISTS `treatmenthistory` (
  `tmh_id` INT NOT NULL AUTO_INCREMENT,
  `diagnosis` TEXT,
  `followUpdate` TEXT,
  `chemical_allergy` TEXT,
  `queuedetail_id` INT NOT NULL,
  PRIMARY KEY (`tmh_id`),
  KEY `idx_tmh_qd` (`queuedetail_id`),
  CONSTRAINT `fk_tmh_qd` FOREIGN KEY (`queuedetail_id`) REFERENCES `queuedetail`(`queuedetail_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- NOTIFICATIONS
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `type` VARCHAR(50) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `message` TEXT,
  `patient_id` INT DEFAULT NULL,
  `is_new` TINYINT(1) DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `queue_id` INT DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_notif_patient` (`patient_id`),
  KEY `idx_notif_queue` (`queue_id`),
  CONSTRAINT `fk_notifications_patient` FOREIGN KEY (`patient_id`) REFERENCES `patient`(`patient_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_notifications_queue` FOREIGN KEY (`queue_id`) REFERENCES `queue`(`queue_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Link queue.queuedetail_id after both tables exist
ALTER TABLE `queue`
  ADD CONSTRAINT `fk_queue_queuedetail` FOREIGN KEY (`queuedetail_id`) REFERENCES `queuedetail`(`queuedetail_id`) ON DELETE SET NULL ON UPDATE CASCADE;

SET FOREIGN_KEY_CHECKS=1;
