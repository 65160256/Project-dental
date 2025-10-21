// ===== Notification System (dropdown + polling) =====
class PatientNotificationBell {
  constructor(options = {}) {
    this.apiEndpoint = options.apiEndpoint || '/patient/api/notifications';
    this.unreadCount = 0;
    this.notifications = [];
    this.isOpen = false;
    this.pollInterval = options.pollInterval || 30000; // 30s
    this.dom = {
      bellBtn: document.getElementById('notificationBellBtn'),
      badge: document.getElementById('notificationBadge'),
      dropdown: document.getElementById('notificationDropdown'),
      list: document.getElementById('notificationList'),
      markAllBtn: document.getElementById('markAllReadBtn')
    };
    this.init();
  }

  init() {
    this.attachEventListeners();
    this.loadNotifications();
    this.startPolling();
  }

  attachEventListeners() {
    this.dom.bellBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    this.dom.markAllBtn?.addEventListener('click', () => {
      this.markAllAsRead();
    });

    // click นอก dropdown เพื่อปิด
    document.addEventListener('click', (e) => {
      const container = document.querySelector('.notification-bell-container');
      if (container && !container.contains(e.target)) this.closeDropdown();
    });

    // ปิดด้วย ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeDropdown();
    });
  }

  async loadNotifications() {
    try {
      const response = await fetch(`${this.apiEndpoint}?limit=5`, { credentials: 'same-origin' });
      const data = await response.json();
      if (data.success) {
        this.notifications = data.notifications || [];
        this.unreadCount = Number(data.unread || 0);
        this.updateBadge();
        this.renderNotifications();
      } else {
        this.showEmpty('ไม่สามารถโหลดการแจ้งเตือนได้');
      }
    } catch (err) {
      console.error('Error loading notifications:', err);
      this.showEmpty('เกิดข้อผิดพลาดในการโหลด');
    }
  }

  async loadUnreadCount() {
    try {
      const response = await fetch(`${this.apiEndpoint}/unread-count`, { credentials: 'same-origin' });
      const data = await response.json();
      if (data.success) {
        this.unreadCount = Number(data.unread_count || 0);
        this.updateBadge();
      }
    } catch (err) {
      console.error('Error loading unread count:', err);
    }
  }

  updateBadge() {
    const badge = this.dom.badge;
    if (!badge) return;
    if (this.unreadCount > 0) {
      badge.textContent = this.unreadCount > 99 ? '99+' : String(this.unreadCount);
      badge.style.display = 'block';
    } else {
      badge.style.display = 'none';
    }
  }

  renderNotifications() {
    const list = this.dom.list;
    if (!list) return;
    if (!this.notifications.length) {
      this.showEmpty('ไม่มีการแจ้งเตือน');
      return;
    }
    list.innerHTML = this.notifications.map((n) => this.createNotificationHTML(n)).join('');
    // delegate click per item
    list.querySelectorAll('.notification-item').forEach((item, idx) => {
      item.addEventListener('click', () => this.handleNotificationClick(this.notifications[idx]));
    });
  }

  showEmpty(message) {
    if (!this.dom.list) return;
    this.dom.list.innerHTML = `
      <div class="notification-empty">
        <i class="fas fa-bell-slash"></i>
        <p>${message}</p>
      </div>`;
  }

  createNotificationHTML(notif) {
    const icon = this.getNotificationIcon(notif.type);
    const unread = notif.is_read ? '' : 'unread';
    return `
      <div class="notification-item ${unread}" data-id="${notif.id}">
        <div class="notification-content">
          <div class="notification-title">${icon} ${notif.title || 'การแจ้งเตือน'}</div>
          <div class="notification-message">${notif.message || ''}</div>
          <div class="notification-time">${notif.time_ago || this.formatTime(notif.created_at)}</div>
        </div>
      </div>`;
  }

  getNotificationIcon(type) {
    const icons = {
      'new_appointment':'🆕',
      'appointment_confirmed':'✅',
      'appointment_cancelled':'❌',
      'appointment_reminder':'⏰',
      'treatment_completed':'📝',
      'default':'🔔'
    };
    return icons[type] || icons.default;
  }

  formatTime(ts) {
    if (!ts) return '';
    const now = new Date();
    const past = new Date(ts);
    const diffMs = now - past;
    const mins = Math.floor(diffMs/60000), hrs = Math.floor(diffMs/3600000), days = Math.floor(diffMs/86400000);
    if (mins < 1) return 'เมื่อสักครู่';
    if (mins < 60) return `${mins} นาทีที่แล้ว`;
    if (hrs < 24) return `${hrs} ชั่วโมงที่แล้ว`;
    if (days < 7) return `${days} วันที่แล้ว`;
    return past.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  async handleNotificationClick(notif) {
    if (!notif.is_read) await this.markAsRead(notif.id);
    
    // Navigate to related page based on notification type
    if (notif.queue_id) {
      switch (notif.type) {
        case 'new_appointment':
        case 'appointment_confirmed':
        case 'appointment_cancelled':
        case 'appointment_reminder':
          window.location.href = `/patient/appointments/${notif.queue_id}`;
          break;
        case 'treatment_completed':
          window.location.href = `/patient/history/details/${notif.queue_id}`;
          break;
        default:
          // For other types, go to appointments page
          window.location.href = `/patient/appointments`;
      }
    }
  }

  async markAsRead(id) {
    try {
      const res = await fetch(`${this.apiEndpoint}/${id}/read`, { method: 'PUT', credentials: 'same-origin' });
      const data = await res.json();
      if (data.success) this.loadNotifications();
    } catch (err) { console.error('Error mark read:', err); }
  }

  async markAllAsRead() {
    try {
      const res = await fetch(`${this.apiEndpoint}/mark-all-read`, { method: 'PUT', credentials: 'same-origin' });
      const data = await res.json();
      if (data.success) this.loadNotifications();
    } catch (err) { console.error('Error mark all read:', err); }
  }

  toggleDropdown() {
    this.isOpen = !this.isOpen;
    const dd = this.dom.dropdown;
    if (!dd) return;
    dd.style.display = this.isOpen ? 'block' : 'none';
    this.dom.bellBtn?.setAttribute('aria-expanded', this.isOpen ? 'true' : 'false');
    if (this.isOpen) this.loadNotifications();
  }

  closeDropdown() {
    this.isOpen = false;
    const dd = this.dom.dropdown;
    if (dd) dd.style.display = 'none';
    this.dom.bellBtn?.setAttribute('aria-expanded', 'false');
  }

  startPolling() {
    // ป้องกันซ้อน setInterval ในหน้า single-page
    if (this._pollTimer) clearInterval(this._pollTimer);
    this._pollTimer = setInterval(() => this.loadUnreadCount(), this.pollInterval);
  }
}

// ===== Profile dropdown =====
function toggleProfileDropdown() {
  const menu = document.getElementById('profileDropdown');
  if (!menu) return;
  menu.style.display = (menu.style.display === 'block') ? 'none' : 'block';
}

function closeProfileDropdownIfClickOutside(e) {
  const prof = document.querySelector('.profile-dropdown');
  if (prof && !prof.contains(e.target)) {
    const menu = document.getElementById('profileDropdown');
    if (menu) menu.style.display = 'none';
  }
}

// ===== Search: demo hook + debounce (เผื่ออนาคตผูกกับ API/filter ตาราง) =====
function debounce(fn, wait = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), wait); };
}

function handleSearchInput(e) {
  const term = e.target.value.trim().toLowerCase();
  // ปัจจุบัน: แค่ log (สามารถต่อยอดกรองตาราง/เรียก API ได้)
  console.log('กำลังค้นหา:', term);
}

document.addEventListener('DOMContentLoaded', () => {
  // Init Notification bell
  window.patientNotificationBell = new PatientNotificationBell();

  // Profile dropdown
  document.getElementById('profileToggle')?.addEventListener('click', toggleProfileDropdown);
  document.addEventListener('click', closeProfileDropdownIfClickOutside);

  // Search with debounce
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    const debounced = debounce(handleSearchInput, 250);
    searchInput.addEventListener('input', debounced);
  }

  console.log('โหลดแดชบอร์ดเรียบร้อย');
});
