
    function toggleDropdown() {
      const menu = document.getElementById('profileDropdown');
      menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    }
    
    function toggleNotifications() {
      console.log('การแจ้งเตือนถูกคลิก - ฟังก์ชันถูกปิดตามที่ร้องขอ');
    }
    
    // Close dropdown when clicking outside
    document.addEventListener('click', function (e) {
      const prof = document.querySelector('.profile-dropdown');
      if (!prof.contains(e.target)) {
        document.getElementById('profileDropdown').style.display = 'none';
      }
    });

    // Filter functionality
    function filterAppointments() {
      const statusFilter = document.getElementById('statusFilter').value;
      const dateFilter = document.getElementById('dateFilter').value;
      const searchTerm = document.getElementById('searchInput').value.toLowerCase();
      const appointmentItems = document.querySelectorAll('.appointment-item');
      let visibleCount = 0;
      
      const now = new Date();
      const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
      const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      
      appointmentItems.forEach(function(item) {
        const itemStatus = item.getAttribute('data-status');
        const itemDate = new Date(item.getAttribute('data-date'));
        const itemTreatment = item.getAttribute('data-treatment').toLowerCase();
        const itemDentist = item.getAttribute('data-dentist').toLowerCase();
        const appointmentId = item.querySelector('.appointment-id').textContent.toLowerCase();
        
        let showItem = true;
        
        // Status filter
        if (statusFilter && itemStatus !== statusFilter) {
          showItem = false;
        }
        
        // Date filter
        if (dateFilter) {
          switch (dateFilter) {
            case 'this-week':
              if (itemDate < oneWeekAgo) showItem = false;
              break;
            case 'this-month':
              if (itemDate.getMonth() !== now.getMonth() || itemDate.getFullYear() !== now.getFullYear()) showItem = false;
              break;
            case 'last-month':
              if (itemDate < oneMonthAgo) showItem = false;
              break;
            case 'last-3-months':
              if (itemDate < threeMonthsAgo) showItem = false;
              break;
          }
        }
        
        // Search filter
        if (searchTerm && !appointmentId.includes(searchTerm) && 
            !itemTreatment.includes(searchTerm) && !itemDentist.includes(searchTerm)) {
          showItem = false;
        }
        
        if (showItem) {
          item.style.display = 'block';
          visibleCount++;
        } else {
          item.style.display = 'none';
        }
      });
      
      // Update count
      document.getElementById('appointmentCount').textContent = visibleCount;
    }

    // Sort functionality
    function sortAppointments() {
      const sortBy = document.getElementById('sortFilter').value;
      const appointmentList = document.querySelector('.appointment-list');
      const items = Array.from(document.querySelectorAll('.appointment-item'));
      const listHeader = appointmentList.querySelector('.list-header');
      
      items.sort((a, b) => {
        switch (sortBy) {
          case 'date-desc':
            return new Date(b.getAttribute('data-date')) - new Date(a.getAttribute('data-date'));
          case 'date-asc':
            return new Date(a.getAttribute('data-date')) - new Date(b.getAttribute('data-date'));
          case 'status':
            return a.getAttribute('data-status').localeCompare(b.getAttribute('data-status'));
          case 'treatment':
            return a.getAttribute('data-treatment').localeCompare(b.getAttribute('data-treatment'));
          default:
            return 0;
        }
      });
      
      // Clear and re-append sorted items
      items.forEach(item => item.remove());
      items.forEach(item => appointmentList.appendChild(item));
      
      // Move header back to top
      appointmentList.insertBefore(listHeader, appointmentList.firstChild);
    }

    // Event listeners
    document.getElementById('statusFilter').addEventListener('change', filterAppointments);
    document.getElementById('dateFilter').addEventListener('change', filterAppointments);
    document.getElementById('searchInput').addEventListener('input', filterAppointments);
    document.getElementById('sortFilter').addEventListener('change', sortAppointments);

    // Initialize page
    document.addEventListener('DOMContentLoaded', function() {
      console.log('โหลดหน้าประวัติการนัดหมายเรียบร้อย');
      
      // เรียงลำดับตามค่าเริ่มต้น (เก่าสุดก่อน)
      sortAppointments();
      
      // Add click handlers for appointment items
      document.querySelectorAll('.appointment-item').forEach(function(item) {
        item.addEventListener('click', function(e) {
          // Don't navigate if clicking on action buttons
          if (!e.target.closest('.action-buttons')) {
            const appointmentId = this.querySelector('.appointment-id').textContent.match(/#Y-(\d+)/)[1];
            window.location.href = `/patient/history/details/${appointmentId}`;
          }
        });
      });
    });
  