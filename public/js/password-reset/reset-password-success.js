// Display current timestamp
function updateTimestamp() {
  const now = new Date();
  const options = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
  };
  
  document.getElementById('timestamp').textContent = now.toLocaleString('en-US', options);
}

// Auto redirect countdown
let timeLeft = 10;
function startCountdown() {
  const timerElement = document.getElementById('timer');
  const countdownElement = document.getElementById('countdown');
  
  const countdown = setInterval(function() {
    timeLeft--;
    timerElement.textContent = timeLeft;
    
    if (timeLeft <= 0) {
      clearInterval(countdown);
      countdownElement.innerHTML = 'Redirecting to login page...';
      window.location.href = '/login?message=' + encodeURIComponent('Password reset successful. Please login with your new password.');
    }
  }, 1000);
}

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
  updateTimestamp();
  startCountdown();
  
  // Focus on login button for accessibility
  document.getElementById('loginBtn').focus();
});

// Stop countdown if user clicks any button
document.querySelectorAll('.btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    const countdownElement = document.getElementById('countdown');
    if (countdownElement) {
      countdownElement.style.display = 'none';
    }
  });
});

// Track successful password reset (analytics)
if (typeof gtag !== 'undefined') {
  gtag('event', 'password_reset_success', {
    'event_category': 'user_auth',
    'event_label': 'password_reset_completed'
  });
}

// Log success event
console.log('Password reset completed successfully');

// Prevent back button to reset page (security)
window.history.replaceState(null, null, window.location.href);
window.onpopstate = function() {
  window.history.replaceState(null, null, window.location.href);
};

// Clear any cached form data
if (typeof window.history.replaceState === 'function') {
  window.history.replaceState({}, document.title, window.location.pathname);
}
