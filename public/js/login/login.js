function togglePassword() {
  const passwordInput = document.getElementById('password');
  const icon = document.querySelector('.toggle-password');
  
  const isPasswordHidden = passwordInput.type === 'password';
  passwordInput.type = isPasswordHidden ? 'text' : 'password';
  
  // Update icon
  icon.classList.toggle('fa-eye');
  icon.classList.toggle('fa-eye-slash');
  
  // Update aria-label
  icon.setAttribute('aria-label', 
    isPasswordHidden ? 'Hide password' : 'Show password'
  );
}

// Form validation and submission
document.getElementById('loginForm').addEventListener('submit', function(e) {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const loginBtn = document.getElementById('loginBtn');
  const loading = document.getElementById('loading');
  
  // Basic validation
  if (!email || !password) {
    e.preventDefault();
    showAlert('Please fill in all required fields.', 'error');
    return;
  }
  
  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    e.preventDefault();
    showAlert('Please enter a valid email address.', 'error');
    return;
  }
  
  // Password length validation
  if (password.length < 6) {
    e.preventDefault();
    showAlert('Password must be at least 6 characters long.', 'error');
    return;
  }
  
  // Show loading state
  loginBtn.disabled = true;
  loginBtn.style.display = 'none';
  loading.style.display = 'block';
  
  // Re-enable if there's an error (form will reload anyway if successful)
  setTimeout(() => {
    loginBtn.disabled = false;
    loginBtn.style.display = 'block';
    loading.style.display = 'none';
  }, 10000); // 10 second timeout
});

// Real-time validation
function validateForm() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const loginBtn = document.getElementById('loginBtn');
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isValid = email && password && emailRegex.test(email) && password.length >= 6;
  
  loginBtn.disabled = !isValid;
  
  return isValid;
}

// Add event listeners for real-time validation
document.getElementById('email').addEventListener('input', validateForm);
document.getElementById('password').addEventListener('input', validateForm);

// Auto focus on email field
document.addEventListener('DOMContentLoaded', function() {
  const emailField = document.getElementById('email');
  if (emailField && !emailField.value) {
    emailField.focus();
  }
  
  // Initial validation check
  validateForm();
});

// Show alert function
function showAlert(message, type) {
  // Remove existing alerts
  const existingAlerts = document.querySelectorAll('.alert');
  existingAlerts.forEach(alert => alert.remove());
  
  // Create new alert
  const alert = document.createElement('div');
  alert.className = `alert ${type}`;
  alert.textContent = message;
  
  // Insert before form
  const form = document.getElementById('loginForm');
  form.parentNode.insertBefore(alert, form);
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    if (alert.parentNode) {
      alert.remove();
    }
  }, 5000);
}

// Prevent multiple form submissions
let formSubmitted = false;
document.getElementById('loginForm').addEventListener('submit', function(e) {
  if (formSubmitted) {
    e.preventDefault();
    return false;
  }
  formSubmitted = true;
});

// Security: Clear password on page unload
window.addEventListener('beforeunload', function() {
  document.getElementById('password').value = '';
});

// Handle browser back button
window.addEventListener('pageshow', function(event) {
  if (event.persisted) {
    // Page was loaded from cache, reset form state
    formSubmitted = false;
    document.getElementById('loginBtn').disabled = false;
    document.getElementById('loginBtn').style.display = 'block';
    document.getElementById('loading').style.display = 'none';
    validateForm();
  }
});

// Analytics tracking (if available)
if (typeof gtag !== 'undefined') {
  gtag('event', 'login_page_view', {
    'event_category': 'user_auth',
    'event_label': 'login_form_displayed'
  });
}
