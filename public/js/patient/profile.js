// profile.js

// ทำให้ฟังก์ชันมองเห็นได้จาก inline onclick ในหน้า EJS
window.toggleDropdown = function toggleDropdown() {
  const menu = document.getElementById('profileDropdown');
  const trigger = document.querySelector('.profile-dropdown .user-info');
  const isOpen = menu && menu.style.display === 'block';
  if (menu) menu.style.display = isOpen ? 'none' : 'block';
  if (trigger) trigger.setAttribute('aria-expanded', String(!isOpen));
};

window.toggleNotifications = function toggleNotifications() {
  // TODO: เชื่อมต่อ API การแจ้งเตือนในอนาคต
  console.log('การแจ้งเตือนถูกคลิก');
};

// ปิดเมนูเมื่อคลิกนอก
document.addEventListener('click', function (e) {
  const prof = document.querySelector('.profile-dropdown');
  if (prof && !prof.contains(e.target)) {
    const menu = document.getElementById('profileDropdown');
    if (menu) menu.style.display = 'none';
    const trigger = prof.querySelector('.user-info');
    if (trigger) trigger.setAttribute('aria-expanded','false');
  }
});
