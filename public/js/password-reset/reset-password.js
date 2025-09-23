function togglePassword(fieldId) {
  const field = document.getElementById(fieldId);
  const icon = field.parentNode.querySelector('.toggle-password');
  
  const type = field.getAttribute('type') === 'password' ? 'text' : 'password';
  field.setAttribute('type', type);
  
  icon.classList.toggle('fa-eye');
  icon.classList.toggle('fa-eye-slash');
}

function checkPasswordStrength(password) {
  let strength = 0;
  let feedback = '';

  if (password.length >= 6) strength += 1;
  if (password.match(/[a-z]/)) strength += 1;
  if (password.match(/[A-Z]/)) strength += 1;
  if (password.match(/[0-9]/)) strength += 1;
  if (password.match(/[^a-zA-Z0-9]/)) strength += 1;

  switch (strength) {
    case 0:
    case 1:
      feedback = 'Very Weak';
      return { strength: 'weak', feedback };
    case 2:
      feedback = 'Weak';
      return { strength: 'weak', feedback };
    case 3:
      feedback = 'Medium';
      return { strength: 'medium', feedback };
    case 4:
    case 5:
      feedback = 'Strong';
      return { strength: 'strong', feedback };
    default:
      return { strength: 'weak', feedback: 'Weak' };
  }
}

function validateForm() {
  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  const submitBtn = document.getElementById('submitBtn');
  const lengthReq = document.getElementById('req-length');
  const matchReq = document.getElementById('req-match');

  // Check length requirement
  if (password.length >= 6) {
    lengthReq.classList.add('requirement-met');
  } else {
    lengthReq.classList.remove('requirement-met');
  }

  // Check password match
  if (password && confirmPassword && password === confirmPassword) {
    matchReq.classList.add('requirement-met');
    document.getElementById('passwordMatch').innerHTML = '<span class="strength-strong">✓ Passwords match</span>';
  } else if (confirmPassword) {
    matchReq.classList.remove('requirement-met');
    document.getElementById('passwordMatch').innerHTML = '<span class="strength-weak">✗ Passwords do not match</span>';
  } else {
    matchReq.classList.remove('requirement-met');
    document.getElementById('passwordMatch').innerHTML = '';
  }

  // Enable/disable submit button
  const isValid = password.length >= 6 && password === confirmPassword && password && confirmPassword;
  submitBtn.disabled = !isValid;

  return isValid;
}

document.getElementById('password').addEventListener('input', function(e) {
  const password = e.target.value;
  const result = checkPasswordStrength(password);
  
  let strengthHtml = '';
  if (password) {
    strengthHtml = `<span class="strength-${result.strength}">Strength: ${result.feedback}</span>`;
  }
  
  document.getElementById('passwordStrength').innerHTML = strengthHtml;
  validateForm();
});

document.getElementById('confirmPassword').addEventListener('input', validateForm);

document.getElementById('resetPasswordForm').addEventListener('submit', function(e) {
  if (!validateForm()) {
    e.preventDefault();
    return;
  }

  const submitBtn = document.getElementById('submitBtn');
  const loading = document.getElementById('loading');
  
  submitBtn.disabled = true;
  submitBtn.style.display = 'none';
  loading.style.display = 'block';
});

// Auto focus on password field
document.addEventListener('DOMContentLoaded', function() {
  const passwordField = document.getElementById('password');
  if (passwordField) {
    passwordField.focus();
  }
});

// Prevent copy/paste of passwords
document.getElementById('confirmPassword').addEventListener('paste', function(e) {
  e.preventDefault();
  alert('For security reasons, please type your password confirmation manually.');
});
