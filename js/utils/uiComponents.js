// ═══════════════════════════════════════════
// UI COMPONENTS — Reusable UI elements (DRY)
// ═══════════════════════════════════════════

/**
 * Creates and appends a modal to the DOM.
 * @param {Object} options
 * @param {string} options.title - Modal title
 * @param {string} [options.icon] - Lucide icon name (optional)
 * @param {string} options.contentHTML - HTML string for the modal body
 * @param {string} [options.footerHTML] - HTML string for the modal footer (optional)
 * @param {string} [options.modalClass] - Additional classes for .modal-content (e.g., 'modal-xl')
 * @param {string} [options.contentStyle] - Inline styles for .modal-content
 * @param {string} [options.bodyStyle] - Inline styles for .modal-body
 * @param {Function} [options.onClose] - Callback fired when modal starts closing
 * @returns {{ overlay: HTMLElement, close: Function }}
 */
export function createModal({
  title,
  icon = '',
  contentHTML,
  footerHTML = '',
  modalClass = '',
  contentStyle = '',
  bodyStyle = '',
  onClose = null
}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const iconHtml = icon 
    ? `<i data-lucide="${icon}" style="display:inline-block;vertical-align:middle;margin-right:8px;width:20px;height:20px;"></i>` 
    : '';

  overlay.innerHTML = `
    <div class="modal-content ${modalClass}" style="${contentStyle}">
      <div class="modal-header">
        <h3 class="modal-title">${iconHtml}${title}</h3>
        <button class="btn btn-ghost btn-icon btn-sm modal-close-btn"><i data-lucide="x"></i></button>
      </div>
      <div class="modal-body" style="${bodyStyle}">
        ${contentHTML}
      </div>
      ${footerHTML ? `<div class="modal-footer">${footerHTML}</div>` : ''}
    </div>
  `;

  // Attach to body
  document.body.appendChild(overlay);

  // Initialize Lucide icons inside the modal
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons({ root: overlay });
  } else if (window.refreshIcons) {
    window.refreshIcons();
  }

  const close = () => {
    overlay.classList.add('closing');
    setTimeout(() => {
      overlay.remove();
      if (onClose) onClose();
    }, 200);
  };

  overlay.querySelector('.modal-close-btn').addEventListener('click', close);

  return {
    overlay,
    close
  };
}
