
    function toggleDropdown() {
      const menu = document.getElementById('profileDropdown');
      menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    }
    
    function toggleNotifications() {
      console.log('การแจ้งเตือนถูกคลิก - ฟังก์ชันถูกปิดใช้งาน');
    }
    
    document.addEventListener('click', function (e) {
      const prof = document.querySelector('.profile-dropdown');
      if (!prof.contains(e.target)) {
        document.getElementById('profileDropdown').style.display = 'none';
      }
    });

    document.addEventListener('DOMContentLoaded', function() {
      console.log('โหลดหน้ารายละเอียดนัดหมายเรียบร้อย');
    });
  