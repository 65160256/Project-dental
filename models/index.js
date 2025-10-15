/**
 * Model Layer - Central Export
 *
 * Models จัดการทั้งหมดเกี่ยวกับ:
 * - การติดต่อกับฐานข้อมูล (CRUD operations)
 * - Business logic ที่เกี่ยวกับข้อมูล
 * - Validation และ data integrity
 * - Domain-specific rules
 *
 * Models ไม่รู้จัก:
 * - HTTP requests/responses
 * - Status codes
 * - Session management
 * - View rendering
 */

const PatientModel = require('./Patient.model');
const DentistModel = require('./Dentist.model');
const UserModel = require('./User.model');
const QueueModel = require('./Queue.model');
const TreatmentModel = require('./Treatment.model');
const TreatmentHistoryModel = require('./TreatmentHistory.model');
const QueueDetailModel = require('./QueueDetail.model');
const NotificationModel = require('./Notification.model');
const DentistScheduleModel = require('./DentistSchedule.model');
const AvailableSlotsModel = require('./AvailableSlots.model');
const DentistTreatmentModel = require('./DentistTreatment.model');
const ReportModel = require('./Report.model');

// Admin Models
const AdminModel = require('./Admin.model');
const DentistAdminModel = require('./DentistAdmin.model');
const PatientAdminModel = require('./PatientAdmin.model');
const TreatmentAdminModel = require('./TreatmentAdmin.model');
const AppointmentAdminModel = require('./AppointmentAdmin.model');
const NotificationAdminModel = require('./NotificationAdmin.model');
const ReportAdminModel = require('./ReportAdmin.model');

module.exports = {
  // Original Models
  PatientModel,
  DentistModel,
  UserModel,
  QueueModel,
  TreatmentModel,
  TreatmentHistoryModel,
  QueueDetailModel,
  NotificationModel,
  DentistScheduleModel,
  AvailableSlotsModel,
  DentistTreatmentModel,
  ReportModel,
  
  // Admin Models
  AdminModel,
  DentistAdminModel,
  PatientAdminModel,
  TreatmentAdminModel,
  AppointmentAdminModel,
  NotificationAdminModel,
  ReportAdminModel
};
