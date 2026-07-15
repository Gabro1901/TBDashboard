// ═══════════════════════════════════════════
// TOAST — Notification system (extracted to avoid circular deps)
// ═══════════════════════════════════════════

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} type
 */
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icons = { 
    success: '<i data-lucide="check-circle" style="color:var(--success-500); width:18px; height:18px;"></i>', 
    error: '<i data-lucide="x-circle" style="color:var(--danger-500); width:18px; height:18px;"></i>', 
    warning: '<i data-lucide="alert-triangle" style="color:var(--warning-500); width:18px; height:18px;"></i>', 
    info: '<i data-lucide="info" style="color:var(--info-500); width:18px; height:18px;"></i>' 
  };
  toast.innerHTML = `<span style="display:flex;align-items:center;">${icons[type] || icons.info}</span><span>${message}</span>`;

  container.appendChild(toast);
  if (window.lucide) window.lucide.createIcons({ root: toast });
  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 200);
  }, 3500);
}
