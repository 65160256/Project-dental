document.getElementById('forgotPasswordForm')?.addEventListener('submit', function(e) {
  const email = document.getElementById('email').value.trim();
  const submitBtn = document.getElementById('submitBtn');
  const loading = document.getElementById('loading');
  
  // Basic validation
  if (!email) {
    e.preventDefault();
    showAlert('Please enter your email address.', 'error');
    return;
  }
  
  // Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    e.preventDefault();
    showAlert('Please enter a valid email address.', 'error');
    return;
  }
  
  // Show loading state
  if (submitBtn && loading) {
    submitBtn.disabled = true;
    submitBtn.style.display = 'none';
    loading.style.display = 'block';
  }
});

// Auto focus on email field
document.addEventListener('DOMContentLoaded', function() {
  const emailField = document.getElementById('email');
  if (emailField) {
    emailField.focus();
  }
});

// Real-time email validation
document.getElementById('email')?.addEventListener('input', function(e) {
  const email = e.target.value.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const submitBtn = document.getElementById('submitBtn');
  
  if (submitBtn) {
    if (email && emailRegex.test(email)) {
      submitBtn.disabled = false;
      e.target.style.borderColor = '#28a745';
    } else {
      submitBtn.disabled = true;
      e.target.style.borderColor = email ? '#dc3545' : '#e1e5e9';
    }
  }
});

// Show alert function
function showAlert(message, type) {
  const existingAlerts = document.querySelectorAll('.alert');
  existingAlerts.forEach(alert => alert.remove());
  
  const alert = document.createElement('div');
  alert.className = `alert ${type}`;
  alert.textContent = message;
  
  const form = document.getElementById('forgotPasswordForm');
  if (form) {
    form.parentNode.insertBefore(alert, form);
    
    setTimeout(() => {
      if (alert.parentNode) {
        alert.remove();
      }
    }, 5000);
  }
}
