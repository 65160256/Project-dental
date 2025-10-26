/**
 * Timezone Helper for Thai Timezone (UTC+7)
 * Handles proper timezone conversion for display and database operations
 */

/**
 * Convert UTC time to Thai timezone (UTC+7)
 * @param {Date|string} date - Date object or ISO string
 * @returns {Date} Date object in Thai timezone
 */
function toThaiTime(date) {
  if (!date) return null;
  
  const utcDate = new Date(date);
  
  // Check if date is valid
  if (isNaN(utcDate.getTime())) {
    return null;
  }
  
  // Thai timezone is UTC+7
  const thaiTime = new Date(utcDate.getTime() + (7 * 60 * 60 * 1000));
  return thaiTime;
}

/**
 * Format date for Thai display with proper timezone
 * @param {Date|string} date - Date object or ISO string
 * @param {Object} options - Formatting options
 * @returns {string} Formatted Thai date string
 */
function formatThaiDate(date, options = {}) {
  if (!date) return 'ยังไม่ระบุ';
  
  const thaiDate = toThaiTime(date);
  const defaultOptions = {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  };
  
  return thaiDate.toLocaleDateString('th-TH', { ...defaultOptions, ...options });
}

/**
 * Format time for Thai display with proper timezone
 * @param {Date|string} date - Date object or ISO string
 * @param {Object} options - Formatting options
 * @returns {string} Formatted Thai time string
 */
function formatThaiTime(date, options = {}) {
  if (!date) return 'ยังไม่ระบุ';
  
  const thaiDate = toThaiTime(date);
  const defaultOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  };
  
  return thaiDate.toLocaleTimeString('th-TH', { ...defaultOptions, ...options });
}

/**
 * Format date and time for Thai display with proper timezone
 * @param {Date|string} date - Date object or ISO string
 * @param {Object} options - Formatting options
 * @returns {string} Formatted Thai date and time string
 */
function formatThaiDateTime(date, options = {}) {
  if (!date) return 'ยังไม่เคยเข้าสู่ระบบ';
  
  const thaiDate = toThaiTime(date);
  if (!thaiDate) return 'ยังไม่เคยเข้าสู่ระบบ';
  
  const dateStr = formatThaiDate(date, options.dateOptions);
  const timeStr = formatThaiTime(date, options.timeOptions);
  
  return `${dateStr} เวลา ${timeStr} น.`;
}

/**
 * Get current Thai time
 * @returns {Date} Current time in Thai timezone
 */
function getCurrentThaiTime() {
  return toThaiTime(new Date());
}

/**
 * Format date for HTML input (YYYY-MM-DD)
 * @param {Date|string} date - Date object or ISO string
 * @returns {string} Formatted date string for HTML input
 */
function formatDateForInput(date) {
  if (!date) return '';
  
  const thaiDate = toThaiTime(date);
  return thaiDate.toISOString().split('T')[0];
}

module.exports = {
  toThaiTime,
  formatThaiDate,
  formatThaiTime,
  formatThaiDateTime,
  getCurrentThaiTime,
  formatDateForInput
};
