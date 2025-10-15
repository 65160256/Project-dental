
    function toggleDropdown() {
      const menu = document.getElementById('profileDropdown');
      menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    }
    
    function toggleNotifications() {
      console.log('การแจ้งเตือนถูกคลิก');
    }
    
    document.addEventListener('click', function (e) {
      const prof = document.querySelector('.profile-dropdown');
      if (!prof.contains(e.target)) {
        document.getElementById('profileDropdown').style.display = 'none';
      }
    });

    function filterByYear() {
      const selectedYear = document.getElementById('yearSelect').value;
      window.location.href = `/patient/my-treatments?year=${selectedYear}`;
    }

    function toggleYear(year) {
      const treatmentsList = document.getElementById(`treatments-${year}`);
      const header = treatmentsList.previousElementSibling;
      const icon = header.querySelector('i');
      
      if (treatmentsList.classList.contains('collapsed')) {
        treatmentsList.classList.remove('collapsed');
        header.classList.remove('collapsed');
      } else {
        treatmentsList.classList.add('collapsed');
        header.classList.add('collapsed');
      }
    }

    function viewTreatmentDetails(treatmentId) {
      window.location.href = `/patient/my-treatments/${treatmentId}`;
    }

    // Initialize page
    document.addEventListener('DOMContentLoaded', function() {
      console.log('โหลดหน้าประวัติการรักษาเรียบร้อย');
    });
  