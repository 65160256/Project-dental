class NotificationBell {
  constructor(options = {}) {
    this.apiEndpoint = options.apiEndpoint || '/api/notifications';
    this.userType = options.userType || 'admin';
    this.pollInterval = options.pollInterval || 30000; // 30 seconds
    this.maxNotifications = options.maxNotifications || 5;
    
    this.unreadCount = 0;
    this.notifications = [];
    this.isOpen = false;
    
    this.init();
  }

  init() {
    this.createBellElement();
    this.attachEventListeners();
    this.loadNotifications();
    this.startPolling();
  }

  createBellElement() {
    const bellHTML = `
      <div class="notification-bell-container">
        <button class="notification-bell-btn" id="notificationBellBtn">
          <i class="fas fa-bell"></i>
          <span class="notification-badge" id="notificationBadge" style="display: none;">0</span>
        </button>
        
        <div class="notification-dropdown" id="notificationDropdown" style="display: none;">
          <div class="notification-header">
            <h3>การแจ้งเตือน</h3>
            <button class="mark-all-read-btn" id="markAllReadBtn">
              <i class="fas fa-check-double"></i> อ่านทั้งหมด
            </button>
          </div>
          
          <div class="notification-list" id="notificationList">
            <div class="notification-loading">
              <i class="fas fa-spinner fa-spin"></i> กำลังโหลด...
            </div>
          </div>
          
          <div class="notification-footer">
            <a href="/${this.userType}/notifications" class="view-all-link">
              ดูทั้งหมด <i class="fas fa-arrow-right"></i>
            </a>
          </div>
        </div>
      </div>
    `;

    // Insert before the first element in header-right or similar
    const headerRight = document.querySelector('.header-right, .navbar-nav, .top-bar-right');
    if (headerRight) {
      headerRight.insertAdjacentHTML('afterbegin', bellHTML);
    }

    this.addStyles();
  }

  addStyles() {
    if (document.getElementById('notificationBellStyles')) return;

    const styles = `
      <style id="notificationBellStyles">
        .notification-bell-container {
          position: relative;
          display: inline-block;
          margin: 0 15px;
        }

        .notification-bell-btn {
          position: relative;
          background: none;
          border: none;
          font-size: 20px;
          color: #666;
          cursor: pointer;
          padding: 8px 12px;
          border-radius: 50%;
          transition: all 0.3s ease;
        }

        .notification-bell-btn:hover {
          background: #f0f0f0;
          color: #667eea;
        }

        .notification-badge {
          position: absolute;
          top: 5px;
          right: 5px;
          background: #ff4757;
          color: white;
          border-radius: 10px;
          padding: 2px 6px;
          font-size: 11px;
          font-weight: bold;
          min-width: 18px;
          text-align: center;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }

        .notification-dropdown {
          position: absolute;
          top: calc(100% + 10px);
          right: 0;
          width: 380px;
          max-height: 500px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.15);
          z-index: 1000;
          animation: slideDown 0.3s ease;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .notification-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 15px 20px;
          border-bottom: 1px solid #eee;
        }

        .notification-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
        }

        .mark-all-read-btn {
          background: none;
          border: none;
          color: #667eea;
          font-size: 13px;
          cursor: pointer;
          padding: 5px 10px;
          border-radius: 5px;
          transition: background 0.3s;
        }

        .mark-all-read-btn:hover {
          background: #f0f0f0;
        }

        .notification-list {
          max-height: 350px;
          overflow-y: auto;
        }

        .notification-item {
          padding: 15px 20px;
          border-bottom: 1px solid #f0f0f0;
          cursor: pointer;
          transition: background 0.2s;
          position: relative;
        }

        .notification-item:hover {
          background: #f8f9fa;
        }

        .notification-item.unread {
          background: #f0f4ff;
        }

        .notification-item.unread::before {
          content: '';
          position: absolute;
          left: 10px;
          top: 50%;
          transform: translateY(-50%);
          width: 8px;
          height: 8px;
          background: #667eea;
          border-radius: 50%;
        }

        .notification-icon {
          font-size: 24px;
          margin-right: 12px;
          vertical-align: middle;
        }

        .notification-content {
          display: inline-block;
          width: calc(100% - 40px);
          vertical-align: middle;
        }

        .notification-title {
          font-weight: 600;
          font-size: 14px;
          margin-bottom: 4px;
          color: #333;
        }

        .notification-message {
          font-size: 13px;
          color: #666;
          line-height: 1.4;
          margin-bottom: 4px;
        }

        .notification-time {
          font-size: 12px;
          color: #999;
        }

        .notification-footer {
          padding: 12px 20px;
          text-align: center;
          border-top: 1px solid #eee;
        }

        .view-all-link {
          color: #667eea;
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
        }

        .view-all-link:hover {
          text-decoration: underline;
        }

        .notification-loading,
        .notification-empty {
          padding: 40px 20px;
          text-align: center;
          color: #999;
        }

        .notification-empty i {
          font-size: 48px;
          margin-bottom: 10px;
          opacity: 0.3;
        }
      </style>
    `;

    document.head.insertAdjacentHTML('beforeend', styles);
  }

  attachEventListeners() {
    // Toggle dropdown
    document.getElementById('notificationBellBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    // Mark all as read
    document.getElementById('markAllReadBtn')?.addEventListener('click', () => {
      this.markAllAsRead();
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      const container = document.querySelector('.notification-bell-container');
      if (container && !container.contains(e.target)) {
        this.closeDropdown();
      }
    });
  }

  async loadNotifications() {
    try {
      const response = await fetch(`${this.apiEndpoint}?limit=${this.maxNotifications}&userType=${this.userType}`);
      const data = await response.json();

      if (data.success) {
        this.notifications = data.notifications;
        this.unreadCount = data.unread;
        this.updateBadge();
        this.renderNotifications();
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  }

  async loadUnreadCount() {
    try {
      const response = await fetch(`${this.apiEndpoint}/unread-count?userType=${this.userType}`);
      const data = await response.json();

      if (data.success) {
        this.unreadCount = data.unread_count;
        this.updateBadge();
      }
    } catch (error) {
      console.error('Error loading unread count:', error);
    }
  }

  updateBadge() {
    const badge = document.getElementById('notificationBadge');
    if (badge) {
      if (this.unreadCount > 0) {
        badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
        badge.style.display = 'block';
      } else {
        badge.style.display = 'none';
      }
    }
  }

  renderNotifications() {
    const list = document.getElementById('notificationList');
    if (!list) return;

    if (this.notifications.length === 0) {
      list.innerHTML = `
        <div class="notification-empty">
          <i class="fas fa-bell-slash"></i>
          <p>ไม่มีการแจ้งเตือน</p>
        </div>
      `;
      return;
    }

    list.innerHTML = this.notifications.map(notif => this.createNotificationHTML(notif)).join('');

    // Add click events
    list.querySelectorAll('.notification-item').forEach((item, index) => {
      item.addEventListener('click', () => {
        this.handleNotificationClick(this.notifications[index]);
      });
    });
  }

  createNotificationHTML(notif) {
    const icon = this.getNotificationIcon(notif.type);
    const unreadClass = notif.is_read ? '' : 'unread';

    return `
      <div class="notification-item ${unreadClass}" data-id="${notif.id}">
        <span class="notification-icon">${icon}</span>
        <div class="notification-content">
          <div class="notification-title">${notif.title}</div>
          <div class="notification-message">${notif.message}</div>
          <div class="notification-time">${notif.time_ago}</div>
        </div>
      </div>
    `;
  }

  getNotificationIcon(type) {
    const icons = {
      'new_appointment': '🆕',
      'appointment_confirmed': '✅',
      'appointment_cancelled': '❌',
      'appointment_reminder': '⏰',
      'treatment_completed': '📝',
      'default': '🔔'
    };

    return icons[type] || icons.default;
  }

  async handleNotificationClick(notif) {
    // Mark as read
    if (!notif.is_read) {
      await this.markAsRead(notif.id);
    }

    // Navigate to related page
    if (notif.appointment_id) {
      window.location.href = `/${this.userType}/appointments/${notif.appointment_id}`;
    }
  }

  async markAsRead(notifId) {
    try {
      const response = await fetch(`${this.apiEndpoint}/${notifId}/read`, {
        method: 'PUT'
      });

      const data = await response.json();
      if (data.success) {
        this.loadNotifications();
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  async markAllAsRead() {
    try {
      const response = await fetch(`${this.apiEndpoint}/mark-all-read?userType=${this.userType}`, {
        method: 'PUT'
      });

      const data = await response.json();
      if (data.success) {
        this.loadNotifications();
      }
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  }

  toggleDropdown() {
    this.isOpen = !this.isOpen;
    const dropdown = document.getElementById('notificationDropdown');
    
    if (dropdown) {
      dropdown.style.display = this.isOpen ? 'block' : 'none';
      
      if (this.isOpen) {
        this.loadNotifications();
      }
    }
  }

  closeDropdown() {
    this.isOpen = false;
    const dropdown = document.getElementById('notificationDropdown');
    if (dropdown) {
      dropdown.style.display = 'none';
    }
  }

  startPolling() {
    // Poll for new notifications every 30 seconds
    setInterval(() => {
      this.loadUnreadCount();
    }, this.pollInterval);
  }
}

// Initialize notification bell when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Detect user type from URL or data attribute
  const path = window.location.pathname;
  let userType = 'admin';
  
  if (path.includes('/dentist')) {
    userType = 'dentist';
  } else if (path.includes('/patient')) {
    userType = 'patient';
  }

  // Initialize notification bell
  window.notificationBell = new NotificationBell({
    apiEndpoint: `/${userType}/api/notifications`,
    userType: userType,
    pollInterval: 30000,
    maxNotifications: 5
  });
});