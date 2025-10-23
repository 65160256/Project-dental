// Avatar utility functions for consistent avatar display across the system

/**
 * Get the first letter of email for avatar display
 * @param {string} email - User's email address
 * @returns {string} First letter of email in uppercase
 */
const getEmailInitial = (email) => {
  if (!email || typeof email !== 'string') return 'U';
  return email.charAt(0).toUpperCase();
};

/**
 * Get initials from first and last name (fallback method)
 * @param {string} fname - First name
 * @param {string} lname - Last name
 * @returns {string} Initials in uppercase
 */
const getNameInitials = (fname, lname) => {
  if (fname && lname) {
    return (fname.charAt(0) + lname.charAt(0)).toUpperCase();
  } else if (fname) {
    return fname.charAt(0).toUpperCase();
  }
  return 'U';
};

/**
 * Get avatar display text - prioritizes email initial over name initials
 * @param {string} email - User's email address
 * @param {string} fname - First name (optional)
 * @param {string} lname - Last name (optional)
 * @returns {string} Avatar display text
 */
const getAvatarText = (email, fname = null, lname = null) => {
  // Always use email initial as primary method
  return getEmailInitial(email);
};

/**
 * Check if user has a valid profile photo
 * @param {string} photo - Photo filename
 * @returns {boolean} True if user has valid photo
 */
const hasValidPhoto = (photo) => {
  return photo && 
         photo !== 'default-avatar.png' && 
         photo !== 'default-doctor.png' && 
         photo !== 'null' && 
         photo !== '';
};

/**
 * Generate avatar HTML for EJS templates
 * @param {Object} user - User object with email, photo, fname, lname
 * @param {string} containerId - Container element ID
 * @param {string} cssClass - Additional CSS class
 * @returns {string} HTML string for avatar
 */
const generateAvatarHTML = (user, containerId = '', cssClass = '') => {
  const { email, photo, fname, lname } = user;
  const avatarText = getAvatarText(email, fname, lname);
  const hasPhoto = hasValidPhoto(photo);
  
  if (hasPhoto) {
    return `<img src="/uploads/${photo}" alt="รูปโปรไฟล์" onerror="handleImageError(this, '${containerId}')" class="${cssClass}">`;
  } else {
    return `<span class="${cssClass}">${avatarText}</span>`;
  }
};

/**
 * Generate avatar fallback HTML for JavaScript
 * @param {string} email - User's email
 * @param {string} fname - First name (optional)
 * @param {string} lname - Last name (optional)
 * @returns {string} Avatar text
 */
const getAvatarFallback = (email, fname = null, lname = null) => {
  return getAvatarText(email, fname, lname);
};

module.exports = {
  getEmailInitial,
  getNameInitials,
  getAvatarText,
  hasValidPhoto,
  generateAvatarHTML,
  getAvatarFallback
};
