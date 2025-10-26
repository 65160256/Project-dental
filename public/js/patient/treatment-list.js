
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

    // ===== ฟังก์ชันค้นหาและกรองข้อมูล =====
    function debounce(fn, wait = 300) {
      let t;
      return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), wait); };
    }

    function handleSearchInput(e) {
      const term = e.target.value.trim().toLowerCase();
      console.log('กำลังค้นหาการรักษา:', term);
      
      // กรองข้อมูลการรักษาในทุกปี
      filterTreatmentsBySearch(term);
    }

    function filterTreatmentsBySearch(searchTerm) {
      const yearSections = document.querySelectorAll('.year-section');
      let hasVisibleResults = false;
      
      yearSections.forEach(yearSection => {
        const treatmentsList = yearSection.querySelector('.treatments-list');
        const treatmentItems = treatmentsList.querySelectorAll('.treatment-item');
        let visibleCount = 0;
        
        treatmentItems.forEach(item => {
          const text = item.textContent.toLowerCase();
          const shouldShow = text.includes(searchTerm) || searchTerm === '';
          
          if (shouldShow) {
            item.style.display = '';
            visibleCount++;
          } else {
            item.style.display = 'none';
          }
        });
        
        // แสดง/ซ่อนปีถ้าไม่มีผลลัพธ์
        if (searchTerm === '') {
          yearSection.style.display = '';
        } else {
          yearSection.style.display = visibleCount > 0 ? '' : 'none';
          if (visibleCount > 0) hasVisibleResults = true;
        }
        
        // แสดงข้อความเมื่อไม่พบผลลัพธ์ในปีนั้น
        showNoResultsInYear(treatmentsList, visibleCount === 0 && searchTerm !== '');
      });
      
      // แสดงข้อความเมื่อไม่พบผลลัพธ์ในทุกปี
      showNoResultsMessage(hasVisibleResults === false && searchTerm !== '');
    }

    function showNoResultsInYear(container, show) {
      let messageId = 'no-results-search';
      let existingMessage = container.querySelector(`#${messageId}`);
      
      if (show && !existingMessage) {
        const message = document.createElement('div');
        message.id = messageId;
        message.className = 'no-treatments';
        message.innerHTML = `
          <i class="fas fa-search"></i>
          <h3>ไม่พบผลลัพธ์</h3>
          <p>ไม่พบการรักษาที่ตรงกับการค้นหา</p>
        `;
        container.appendChild(message);
      } else if (!show && existingMessage) {
        existingMessage.remove();
      }
    }

    function showNoResultsMessage(show) {
      let messageId = 'no-results-global';
      let existingMessage = document.getElementById(messageId);
      
      if (show && !existingMessage) {
        const message = document.createElement('div');
        message.id = messageId;
        message.className = 'no-treatments';
        message.innerHTML = `
          <i class="fas fa-search"></i>
          <h3>ไม่พบผลลัพธ์</h3>
          <p>ไม่พบการรักษาที่ตรงกับการค้นหาในทุกปี</p>
        `;
        
        const container = document.querySelector('.treatments-container');
        if (container) {
          container.appendChild(message);
        }
      } else if (!show && existingMessage) {
        existingMessage.remove();
      }
    }

    // Initialize page
    document.addEventListener('DOMContentLoaded', function() {
      console.log('โหลดหน้าประวัติการรักษาเรียบร้อย');
      
      // เพิ่ม event listener สำหรับช่องค้นหา
      const searchInput = document.querySelector('.search-box input');
      if (searchInput) {
        const debouncedSearch = debounce(handleSearchInput, 250);
        searchInput.addEventListener('input', debouncedSearch);
      }
    });
  