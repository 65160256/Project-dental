const db = require('../config/db');

// Helper function to format appointment data for patient view
const formatAppointmentForPatient = (appointment) => ({
  id: appointment.queue_id,
  date: appointment.time,
  formatted_date: new Date(appointment.time).toLocaleDateString('th-TH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  }),
  formatted_time: new Date(appointment.time).toLocaleTimeString('th-TH', {
    hour: '2-digit', minute: '2-digit'
  }),
  doctor_name: appointment.dentist_name,
  doctor_specialty: appointment.dentist_specialty,
  treatment: appointment.treatment_name,
  duration: appointment.duration,
  status: appointment.queue_status,
  status_text: getStatusText(appointment.queue_status),
  status_color: getStatusColor(appointment.queue_status),
  notes: appointment.notes || appointment.diagnosis,
  can_cancel: appointment.can_cancel || false,
  can_modify: appointment.can_modify || false
});

const getStatusText = (status) => ({
  pending: 'รอยืนยัน',
  confirm: 'ยืนยันแล้ว',
  cancel: 'ยกเลิกแล้ว',
  auto_cancelled: 'ยกเลิกแล้ว',
  completed: 'เสร็จสิ้น'
}[status] || status);

const getStatusColor = (status) => ({
  pending: '#f59e0b',
  confirm: '#10b981',
  cancel:  '#ef4444',
  auto_cancelled: '#ef4444',
  completed:'#6b7280'
}[status] || '#6b7280');

const validateBookingData = (data) => {
  const errors = [];
  if (!data.dentist_id) errors.push('กรุณาเลือกทันตแพทย์');
  if (!data.treatment_id) errors.push('กรุณาเลือกการรักษา');
  if (!data.date) errors.push('กรุณาเลือกวันที่');
  if (!data.hour && data.hour !== 0) errors.push('กรุณาเลือกเวลา');

  if (data.date && !isValidDate(data.date)) errors.push('รูปแบบวันที่ไม่ถูกต้อง');
  if (data.hour && (data.hour < 0 || data.hour > 23)) errors.push('เวลาไม่ถูกต้อง');

  return { isValid: errors.length === 0, errors };
};

const isValidDate = (dateString) => {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return false;
  return dateString === d.toISOString().split('T')[0];
};

const getHoursDifference = (futureDate, currentDate = new Date()) =>
  (futureDate.getTime() - currentDate.getTime()) / (1000 * 3600);

const canCancelAppointment = (appointmentTime, status) =>
  (status === 'pending' || status === 'confirm') &&
  getHoursDifference(new Date(appointmentTime)) >= 24;

const generateAppointmentReference = (queueId, patientId) => {
  const ts = Date.now().toString().slice(-6);
  return `APT${patientId.toString().padStart(4,'0')}${queueId.toString().padStart(4,'0')}${ts}`;
};

const checkAppointmentConflicts = async (patientId, appointmentDate, excludeQueueId = null) => {
  try {
    let query = `
      SELECT COUNT(*) as count
      FROM queue
      WHERE patient_id = ? AND DATE(time) = ? AND queue_status IN ('pending','confirm')
    `;
    const params = [patientId, appointmentDate];
    if (excludeQueueId) { query += ' AND queue_id != ?'; params.push(excludeQueueId); }
    const [result] = await db.execute(query, params);
    return result[0].count > 0;
  } catch (e) {
    console.error('Error checking appointment conflicts:', e);
    return true;
  }
};

const getPatientRecentHistory = async (patientId, limit = 5) => {
  try {
    const [appointments] = await db.execute(`
      SELECT q.queue_id, q.time, q.queue_status, th.diagnosis,
             CONCAT(d.fname,' ',d.lname) AS dentist_name, t.treatment_name
      FROM queue q
      JOIN queuedetail qd ON q.queuedetail_id = qd.queuedetail_id
      LEFT JOIN treatmentHistory th ON qd.queuedetail_id = th.queuedetail_id
      JOIN dentist d ON qd.dentist_id = d.dentist_id
      JOIN treatment t ON qd.treatment_id = t.treatment_id
      WHERE q.patient_id = ?
      ORDER BY q.time DESC
      LIMIT ?
    `, [patientId, limit]);
    return appointments.map(formatAppointmentForPatient);
  } catch (e) {
    console.error('Error getting patient history:', e);
    return [];
  }
};

const sendAppointmentConfirmation = async (patientId, appointmentData) => {
  try {
    const [info] = await db.execute(`
      SELECT p.fname, p.lname, p.phone, u.email
      FROM patient p
      JOIN user u ON p.user_id = u.user_id
      WHERE p.patient_id = ?
    `, [patientId]);
    if (info.length === 0) return false;
    const p = info[0];
    console.log(`📧 Appointment confirmation for ${p.fname} ${p.lname}`);
    console.log(`Email: ${p.email}`);
    console.log(`Phone: ${p.phone}`);
    console.log(`Appointment: ${appointmentData.dentist_name} on ${appointmentData.appointment_time}`);
    // TODO: integrate email/SMS service
    return true;
  } catch (e) {
    console.error('Error sending appointment confirmation:', e);
    return false;
  }
};

// Helper function to get first letter of email for avatar display
const getEmailInitial = (email) => {
  if (!email || typeof email !== 'string') return 'U';
  return email.charAt(0).toUpperCase();
};

// Helper function to get initials from name (fallback)
const getNameInitials = (fname, lname) => {
  if (fname && lname) {
    return (fname.charAt(0) + lname.charAt(0)).toUpperCase();
  } else if (fname) {
    return fname.charAt(0).toUpperCase();
  }
  return 'U';
};

module.exports = {
  formatAppointmentForPatient,
  getStatusText,
  getStatusColor,
  validateBookingData,
  isValidDate,
  getHoursDifference,
  canCancelAppointment,
  generateAppointmentReference,
  checkAppointmentConflicts,
  getPatientRecentHistory,
  sendAppointmentConfirmation,
  getEmailInitial,
  getNameInitials
};
