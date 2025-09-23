// Log this event for security monitoring
console.log('Invalid password reset attempt detected');

// Track attempts (analytics if available)
if (typeof gtag !== 'undefined') {
  gtag('event', 'password_reset_invalid', {
    'event_category': 'security',
    'event_label': 'invalid_token'
  });
}

// Auto-focus on primary action button
document.addEventListener('DOMContentLoaded', function() {
  const primaryBtn = document.querySelector('.btn-primary');
  if (primaryBtn) {
    primaryBtn.focus();
  }
});

// Prevent back button to insecure state
window.history.replaceState(null, null, window.location.href);
window.onpopstate = function() {
  window.history.replaceState(null, null, window.location.href);
};
