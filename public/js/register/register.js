// ===== COMPLETE FIXED VALIDATION SYSTEM =====

// Helper functions
function safeGetElement(id) {
  try {
    return document.getElementById(id);
  } catch (e) {
    console.warn('Element not found:', id);
    return null;
  }
}

function safeQuerySelector(parent, selector) {
  try {
    if (!parent || typeof parent.querySelector !== 'function') return null;
    return parent.querySelector(selector);
  } catch (e) {
    console.warn('Query selector failed:', selector);
    return null;
  }
}

function safeAddClass(element, className) {
  if (element && element.classList && typeof element.classList.add === 'function') {
    element.classList.add(className);
  }
}

function safeRemoveClass(element, className) {
  if (element && element.classList && typeof element.classList.remove === 'function') {
    element.classList.remove(className);
  }
}

function safeSetText(element, text) {
  if (element && typeof element.textContent !== 'undefined') {
    element.textContent = text;
  }
}

function safeGetValue(element) {
  if (element && typeof element.value !== 'undefined') {
    return element.value.toString().trim();
  }
  return '';
}

// Helper function to find the correct input wrapper
function findInputWrapper(input) {
  let element = input;
  while (element && element.parentElement) {
    element = element.parentElement;
    if (element.classList && element.classList.contains('input-wrapper')) {
      return element;
    }
  }
  return input.parentElement; // fallback
}

// Helper function to get field display names
function getFieldDisplayName(fieldId) {
  const fieldNames = {
    fname: 'First Name',
    lname: 'Last Name', 
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Confirm Password',
    dob: 'Date of Birth',
    id_card: 'ID Card Number',
    phone: 'Phone Number',
    address: 'Address'
  };
  return fieldNames[fieldId] || fieldId;
}

// Validation functions
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function isValidName(name) {
  return /^[a-zA-Z]+(\s[a-zA-Z]+)*$/.test(name) && name.length >= 2;
}

function isValidPhone(phone) {
  return /^\d{10}$/.test(phone);
}

function isValidid_card(id_card) {
  return /^\d{13}$/.test(id_card);
}

function isValidPassword(password) {
  return password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);
}

function isValidAge(dob) {
  const today = new Date();
  const birthDate = new Date(dob);
  const age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  let calculatedAge = age;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    calculatedAge--;
  }
  
  return calculatedAge >= 18 && calculatedAge <= 120;
}

// Set validation state
function setValidationState(input, isValid, message = '') {
  const wrapper = findInputWrapper(input);
  const messageEl = safeQuerySelector(wrapper, '.validation-message');
  
  // Clear previous states
  safeRemoveClass(wrapper, 'error');
  safeRemoveClass(wrapper, 'success');
  
  if (messageEl) {
    messageEl.className = 'validation-message';
    safeSetText(messageEl, '');
  }
  
  if (!isValid) {
    safeAddClass(wrapper, 'error');
    if (messageEl && message) {
      messageEl.className = 'validation-message error';
      safeSetText(messageEl, message);
    }
  } else if (safeGetValue(input)) {
    safeAddClass(wrapper, 'success');
  }
}

// Main validation function
function validateField(input) {
  if (!input) return true;

  const inputId = input.id || '';
  const value = safeGetValue(input);

  let isValid = true;
  let errorMessage = '';

  // Required field check
  const isRequired = input.hasAttribute && input.hasAttribute('required');
  if (isRequired && !value) {
    isValid = false;
    errorMessage = 'This field is required';
  }

  // Specific validations
  if (value && isValid) {
    switch (inputId) {
      case 'fname':
      case 'lname':
        if (!isValidName(value)) {
          isValid = false;
          errorMessage = 'Only letters and single spaces allowed, minimum 2 characters';
        }
        break;
      case 'email':
        if (!isValidEmail(value)) {
          isValid = false;
          errorMessage = 'Please enter a valid email address';
        }
        break;
      case 'phone':
        if (!isValidPhone(value)) {
          isValid = false;
          errorMessage = 'Phone number must be exactly 10 digits';
        }
        break;
      case 'id_card':
        if (!isValidid_card(value)) {
          isValid = false;
          errorMessage = 'ID card must be exactly 13 digits';
        }
        break;
      case 'password':
        if (!isValidPassword(value)) {
          isValid = false;
          errorMessage = 'Password must be 8+ characters with uppercase, lowercase, and number';
        }
        break;
      case 'confirmPassword':
        const passwordValue = safeGetValue(safeGetElement('password'));
        if (value !== passwordValue) {
          isValid = false;
          errorMessage = 'Passwords do not match';
        }
        break;
      case 'dob':
        if (!isValidAge(value)) {
          isValid = false;
          errorMessage = 'You must be at least 18 years old';
        }
        break;
      case 'address':
        if (value.length < 10) {
          isValid = false;
          errorMessage = 'Address must be at least 10 characters';
        }
        break;
    }
  }

  // Update UI
  setValidationState(input, isValid, errorMessage);
  return isValid;
}

// Password strength meter
function updatePasswordStrength(password) {
  const strengthFill = safeGetElement('strengthFill');
  if (!strengthFill) return;

  let strength = 0;
  if (password.length >= 8) strength++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
  if (/\d/.test(password)) strength++;
  if (/[^A-Za-z0-9]/.test(password)) strength++;

  strengthFill.className = 'strength-fill';
  
  if (strength === 0) {
    strengthFill.style.width = '0%';
  } else if (strength === 1) {
    strengthFill.style.width = '33%';
    safeAddClass(strengthFill, 'strength-weak');
  } else if (strength === 2) {
    strengthFill.style.width = '66%';
    safeAddClass(strengthFill, 'strength-medium');
  } else {
    strengthFill.style.width = '100%';
    safeAddClass(strengthFill, 'strength-strong');
  }
}

// Progress bar
function updateProgress() {
  const progressFill = safeGetElement('progressFill');
  if (!progressFill) return;

  const requiredInputs = ['fname', 'lname', 'email', 'password', 'confirmPassword', 'dob', 'id_card', 'address', 'phone'];
  const filledCount = requiredInputs.filter(id => {
    const input = safeGetElement(id);
    return input && safeGetValue(input);
  }).length;

  const progress = (filledCount / requiredInputs.length) * 100;
  progressFill.style.width = `${progress}%`;
}

// API calls
async function checkEmailAvailability(email) {
  try {
    const response = await fetch(`/api/check-email?email=${encodeURIComponent(email)}`);
    const data = await response.json();
    return data.success ? data.available : true;
  } catch (e) {
    console.warn('Email check failed:', e);
    return true;
  }
}

async function checkid_cardAvailability(id_card) {
  try {
    const response = await fetch(`/api/check-id-card?id_card=${encodeURIComponent(id_card)}`);
    const data = await response.json();
    return data.success ? data.available : true;
  } catch (e) {
    console.warn('ID card check failed:', e);
    return true;
  }
}

// Setup form submission
function setupFormSubmission() {
  const form = safeGetElement('registerForm');
  if (!form) return;

  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    // Validate all required fields and collect errors
    const inputIds = ['fname', 'lname', 'email', 'password', 'confirmPassword', 'dob', 'id_card', 'address', 'phone'];
    let isFormValid = true;
    let errorMessages = [];
    
    // First pass: basic validation
    inputIds.forEach(id => {
      const input = safeGetElement(id);
      if (input) {
        const fieldValid = validateField(input);
        if (!fieldValid) {
          isFormValid = false;
          
          // Get error message from validation
          const wrapper = findInputWrapper(input);
          const messageEl = safeQuerySelector(wrapper, '.validation-message');
          
          const fieldName = getFieldDisplayName(id);
          const errorText = (messageEl && messageEl.textContent) ? messageEl.textContent : 'Please check this field';
          errorMessages.push(`<strong>${fieldName}:</strong> ${errorText}`);
        }
      }
    });

    // Second pass: async checks
    const email = safeGetValue(safeGetElement('email'));
    const id_card = safeGetValue(safeGetElement('id_card'));
    
    if (email && isValidEmail(email)) {
      const emailAvailable = await checkEmailAvailability(email);
      if (!emailAvailable) {
        isFormValid = false;
        const emailInput = safeGetElement('email');
        setValidationState(emailInput, false, 'This email is already registered');
        errorMessages.push('<strong>Email:</strong> This email is already registered');
      }
    }

    if (id_card && isValidid_card(id_card)) {
      const idAvailable = await checkid_cardAvailability(id_card);
      if (!idAvailable) {
        isFormValid = false;
        const idInput = safeGetElement('id_card');
        setValidationState(idInput, false, 'This ID card number is already registered');
        errorMessages.push('<strong>ID Card:</strong> This ID card number is already registered');
      }
    }

    if (!isFormValid) {
      const errorListHtml = errorMessages.length > 0 
        ? `<div style="text-align: left; margin-top: 15px;"><ul style="margin: 0; padding-left: 20px;">${errorMessages.map(msg => `<li style="margin-bottom: 5px;">${msg}</li>`).join('')}</ul></div>`
        : '<div style="text-align: center; margin-top: 15px;">Please check all fields and try again.</div>';
        
      Swal.fire({
        icon: 'error',
        title: 'Please Fix These Errors',
        html: `Found <strong>${errorMessages.length}</strong> validation error(s). Please correct the following:${errorListHtml}`,
        confirmButtonColor: '#0051ff',
        width: '500px'
      });
      return;
    }

    // Confirmation dialog
    const result = await Swal.fire({
      title: 'Confirm Registration',
      text: 'Are you sure you want to register with this information?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#0051ff',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, register me!'
    });

    if (!result.isConfirmed) return;

    // Show loading
    const registerBtn = safeGetElement('registerBtn');
    const btnText = safeQuerySelector(registerBtn, '.btn-text');
    const loading = safeQuerySelector(registerBtn, '.loading');
    
    if (btnText) btnText.style.display = 'none';
    if (loading) loading.classList.add('show');
    if (registerBtn) registerBtn.disabled = true;

    // Submit form
    try {
      this.submit();
    } catch (error) {
      // Reset button state
      if (btnText) btnText.style.display = 'block';
      if (loading) loading.classList.remove('show');
      if (registerBtn) registerBtn.disabled = false;
      
      Swal.fire({
        icon: 'error',
        title: 'Submission Error', 
        text: 'There was an error submitting the form. Please try again.',
        confirmButtonColor: '#0051ff'
      });
    }
  });
}

// Setup event listeners
function setupEventListeners() {
  // Input validation
  const inputIds = ['fname', 'lname', 'email', 'password', 'confirmPassword', 'dob', 'id_card', 'address', 'phone'];
  
  inputIds.forEach(id => {
    const input = safeGetElement(id);
    if (!input) return;

    // Validation on blur
    input.addEventListener('blur', function() {
      validateField(this);
      updateProgress();
    });

    // Real-time input handling
    input.addEventListener('input', function() {
      if (id === 'password') {
        updatePasswordStrength(this.value);
        // Re-validate confirm password when password changes
        const confirmInput = safeGetElement('confirmPassword');
        if (confirmInput && safeGetValue(confirmInput)) {
          validateField(confirmInput);
        }
      }
      updateProgress();
    });
  });

  // Name filtering
  ['fname', 'lname'].forEach(id => {
    const input = safeGetElement(id);
    if (input) {
      input.addEventListener('input', function() {
        this.value = this.value.replace(/[^a-zA-Z\s]/g, '').replace(/\s+/g, ' ');
      });
    }
  });

  // Number formatting  
  ['phone', 'id_card'].forEach(id => {
    const input = safeGetElement(id);
    if (input) {
      input.addEventListener('input', function() {
        const maxLength = id === 'phone' ? 10 : 13;
        this.value = this.value.replace(/\D/g, '').slice(0, maxLength);
      });
    }
  });

  // Email availability check
  const emailInput = safeGetElement('email');
  if (emailInput) {
    let emailTimeout;
    emailInput.addEventListener('input', function() {
      clearTimeout(emailTimeout);
      emailTimeout = setTimeout(async () => {
        const email = safeGetValue(this);
        if (isValidEmail(email)) {
          const isAvailable = await checkEmailAvailability(email);
          if (!isAvailable) {
            setValidationState(this, false, 'This email is already registered');
          }
        }
      }, 1000);
    });
  }

  // ID card availability check
  const id_cardInput = safeGetElement('id_card');
  if (id_cardInput) {
    let id_cardTimeout;
    id_cardInput.addEventListener('input', function() {
      clearTimeout(id_cardTimeout);
      if (this.value.length === 13) {
        id_cardTimeout = setTimeout(async () => {
          const isAvailable = await checkid_cardAvailability(this.value);
          if (!isAvailable) {
            setValidationState(this, false, 'This ID card number is already registered');
          }
        }, 1000);
      }
    });
  }

  // Set date limits
  const dobInput = safeGetElement('dob');
  if (dobInput) {
    const maxDate = new Date();
    maxDate.setFullYear(maxDate.getFullYear() - 18);
    dobInput.max = maxDate.toISOString().split('T')[0];
    
    const minDate = new Date();
    minDate.setFullYear(minDate.getFullYear() - 120);
    dobInput.min = minDate.toISOString().split('T')[0];
  }

  // Setup form submission
  setupFormSubmission();
}

// Password toggle function
function togglePassword(fieldId, iconEl) {
  const input = safeGetElement(fieldId);
  if (!input || !iconEl) return;
  
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  
  safeRemoveClass(iconEl, 'fa-eye');
  safeRemoveClass(iconEl, 'fa-eye-slash');
  safeAddClass(iconEl, isPassword ? 'fa-eye-slash' : 'fa-eye');
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  setupEventListeners();
  updateProgress();
  
  // Handle URL parameters for error messages
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('error')) {
    const errorMessages = {
      'duplicate_email': 'This email address is already registered.',
      'duplicate_id': 'This ID card number is already registered.',
      'invalid_data': 'Please check your information and try again.',
      'server_error': 'A server error occurred. Please try again later.'
    };
    
    const errorType = urlParams.get('error');
    const message = errorMessages[errorType] || 'An error occurred during registration.';
    
    Swal.fire({
      icon: 'error',
      title: 'Registration Error',
      text: message,
      confirmButtonColor: '#0051ff'
    });
  }
});
