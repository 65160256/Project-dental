// Dentist Dashboard JavaScript
let currentDate;
let monthlyAppointments = [];

// Initialize dashboard data
function initializeDashboardData() {
    // This will be set by the server-side template
    if (typeof window.dashboardData !== 'undefined') {
        currentDate = window.dashboardData.currentDate;
        monthlyAppointments = window.dashboardData.monthlyAppointments;
    }
}

// Handle image error
function handleImageError(img) {
    img.style.display = 'none';
    const initial = window.dentist?.email ? window.dentist.email.charAt(0).toUpperCase() : 'D';
    img.parentElement.innerHTML = initial;
}

// Toast notification
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = { 
        success: 'fas fa-check-circle', 
        error: 'fas fa-exclamation-circle', 
        info: 'fas fa-info-circle' 
    }[type] || 'fas fa-info-circle';
    
    toast.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <i class="${icon}"></i>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(toast);
    setTimeout(() => { 
        toast.style.animation = 'slideInRight 0.3s ease reverse'; 
        setTimeout(() => toast.remove(), 300); 
    }, 3000);
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeDashboardData();
    
    // Initialize notification system
    if (typeof NotificationSystem !== 'undefined') {
        window.notificationSystem = new NotificationSystem();
    }
    
    // Initialize other components
    if (typeof initializeSearch === 'function') {
        initializeSearch();
    }
    if (typeof loadDashboardData === 'function') {
        loadDashboardData();
    }
});
