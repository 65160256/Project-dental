function showAlert(message, type = 'success') {
  const alert = document.getElementById('alert');
  alert.className = `alert alert-${type}`;
  alert.textContent = message;
  alert.style.display = 'block';
  
  setTimeout(() => {
    alert.style.display = 'none';
  }, 5000);
}

async function refreshData() {
  try {
    showAlert('Refreshing data...', 'success');
    location.reload();
  } catch (error) {
    showAlert('Error refreshing data: ' + error.message, 'danger');
  }
}

async function runCleanup() {
  if (!confirm('Run cleanup for expired password reset tokens?')) {
    return;
  }

  try {
    const response = await fetch('/admin/api/password-resets/cleanup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    const result = await response.json();

    if (result.success) {
      showAlert(`Cleanup completed: ${result.data.deletedCount} tokens removed`, 'success');
      setTimeout(() => location.reload(), 2000);
    } else {
      showAlert('Cleanup failed: ' + result.error, 'danger');
    }
  } catch (error) {
    showAlert('Error running cleanup: ' + error.message, 'danger');
  }
}

async function revokeToken(tokenId) {
  const reason = prompt('Reason for revoking this token (optional):');
  
  if (reason === null) return; // User cancelled

  try {
    const response = await fetch(`/admin/api/password-resets/${tokenId}/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason })
    });

    const result = await response.json();

    if (result.success) {
      showAlert('Token revoked successfully', 'success');
      setTimeout(() => location.reload(), 1500);
    } else {
      showAlert('Failed to revoke token: ' + result.error, 'danger');
    }
  } catch (error) {
    showAlert('Error revoking token: ' + error.message, 'danger');
  }
}

function exportData() {
  // Simple CSV export
  const data = [];
  const table = document.getElementById('activityTable');
  const rows = table.querySelectorAll('tr');
  
  // Add header
  data.push(['Email', 'User', 'Role', 'Requested', 'Status', 'Completed'].join(','));
  
  // Add data rows
  rows.forEach(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length >= 6) {
      const rowData = [
        `"${cells[0].textContent}"`,
        `"${cells[1].textContent}"`,
        `"${cells[2].textContent}"`,
        `"${cells[3].textContent}"`,
        `"${cells[4].textContent.trim()}"`,
        `"${cells[5].textContent}"`
      ];
      data.push(rowData.join(','));
    }
  });
  
  // Download CSV
  const csvContent = data.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `password_resets_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  window.URL.revokeObjectURL(url);
  
  showAlert('Data exported successfully', 'success');
}

// Auto-refresh every 5 minutes
setInterval(refreshData, 5 * 60 * 1000);
