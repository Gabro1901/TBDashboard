// ═══════════════════════════════════════════
// TRIAL BALANCE — Input & management module
// ═══════════════════════════════════════════

import { store, CATEGORIES, getCategoryList } from '../data/store.js';
import { classifyAll, classifyByKeywords } from '../data/chartOfAccounts.js';
import { classifyAllByPrefix } from '../data/chartOfAccounts.js';
import { aiClassifyAccounts, aiDeduceRules, isAiConfigured } from '../utils/aiService.js';
import { formatCurrency, parseItalianNumber } from '../utils/formatters.js';
import { parseCSV, readFileAsText, parseAndFormatDate } from '../utils/csvParser.js';
import { aggregateByGLAccount } from '../utils/accountHelpers.js';
import { showToast } from '../utils/toast.js';
import { updateDOM } from '../utils/domHelpers.js';
import { createModal } from '../utils/uiComponents.js';
import { showCSVMappingModal } from '../utils/importWizard.js';

let container;
const expandedGroups = new Set();
const expandedAccounts = new Set(); // Track which GL accounts are expanded to show individual rows
const groupPages = {};
const PAGE_SIZE = 100;
let searchQuery = '';
let eventsBound = false;

export function init(el) {
  container = el;
  
  // Expand UNMAPPED by default to show new imports
  expandedGroups.add('UNMAPPED');
  
  render();
  store.on('trialBalance', render);
  store.on('accountMapping', render);
}

function render() {
  const tb = store.state.trialBalance;
  const mapping = store.state.accountMapping;
  const reasonings = store.state.aiReasonings || {};
  const categories = getCategoryList();

  // Aggregate by GL Account
  const aggregated = aggregateByGLAccount(tb);

  // Compute prefix discrepancy for active mappings
  const rules = store.state.classificationRules || [];
  const sortedRules = [...rules]
    .map(r => ({ ...r, prefix: String(r.prefix) }))
    .sort((a, b) => b.prefix.length - a.prefix.length);

  for (const entry of aggregated) {
    const key = entry.glAccount || entry.name;
    const catId = mapping[key] || 'UNMAPPED';
    if (entry.glAccount && catId !== 'UNMAPPED') {
      const accStr = String(entry.glAccount);
      const matchingRule = sortedRules.find(r => accStr.startsWith(r.prefix));
      if (matchingRule && catId !== matchingRule.categoryId) {
        entry.discrepancy = {
          aiCategory: catId,
          ruleCategory: matchingRule.categoryId,
          rulePrefix: matchingRule.prefix
        };
      } else {
        entry.discrepancy = null;
      }
    } else {
      entry.discrepancy = null;
    }
  }

  // Filter based on search query
  let filtered = aggregated;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = aggregated.filter(entry => 
      (entry.glAccount || '').toLowerCase().includes(q) || 
      (entry.name || '').toLowerCase().includes(q)
    );
  }

  // Summary values (always based on full trial balance)
  let totalDebit = 0, totalCredit = 0;
  for (const entry of aggregated) {
    if (entry.amount >= 0) totalDebit += entry.amount;
    else totalCredit += Math.abs(entry.amount);
  }
  const unmapped = aggregated.filter(e => {
    const key = e.glAccount || e.name;
    return !mapping[key] || mapping[key] === 'UNMAPPED';
  }).length;

  // Grouping logic (by category, using filtered accounts)
  const groupedTb = {};
  Object.values(CATEGORIES).forEach(c => {
    groupedTb[c.id] = { category: c, items: [], totalDebit: 0, totalCredit: 0 };
  });

  filtered.forEach((entry) => {
    const key = entry.glAccount || entry.name;
    let catId = mapping[key] || 'UNMAPPED';
    if (!groupedTb[catId]) catId = 'UNMAPPED';
    
    groupedTb[catId].items.push(entry);
    if (entry.amount >= 0) groupedTb[catId].totalDebit += entry.amount;
    else groupedTb[catId].totalCredit += Math.abs(entry.amount);
  });

  const activeGroups = Object.values(groupedTb).filter(g => g.items.length > 0);

  const htmlString = `
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center;">
      <div>
        <h1 class="page-title">Bilancio di Verifica</h1>
        <p class="page-subtitle">Inserisci o importa il trial balance. Il sistema classificherà automaticamente i conti.</p>
      </div>
      <button class="btn btn-outline btn-sm" id="btn-start-tb-tour">
        <i data-lucide="help-circle" style="width:14px;height:14px;margin-right:6px;"></i> Tutorial
      </button>
    </div>

    <div class="tb-layout-split">
      <div class="tb-main-pane">
        <!-- Input Form -->
        <div class="card" style="margin-bottom: var(--space-6);">
      <div class="card-header">
        <h3 class="card-title">Aggiungi Conto</h3>
      </div>
      <div class="tb-input-grid" style="grid-template-columns: 120px 1fr 140px 140px auto;">
        <div class="form-group">
          <label class="form-label">Codice Conto</label>
          <input type="text" class="form-input" id="tb-gl-account" placeholder="es. 1010">
        </div>
        <div class="form-group">
          <label class="form-label">Nome Conto</label>
          <input type="text" class="form-input" id="tb-name" placeholder="es. Cassa">
        </div>
        <div class="form-group">
          <label class="form-label">Data</label>
          <input type="text" class="form-input" id="tb-date" placeholder="es. DD-MM-YYYY">
        </div>
        <div class="form-group">
          <label class="form-label">Importo (€)</label>
          <input type="text" class="form-input" id="tb-amount" placeholder="es. 15000.00">
        </div>
        <div class="form-group">
          <label class="form-label">&nbsp;</label>
          <button class="btn btn-primary" id="btn-add-row">
            <span>＋</span> Aggiungi
          </button>
        </div>
      </div>
    </div>

    <!-- Import & Actions -->
    <div class="tb-actions" style="margin-bottom: var(--space-6);">
      <div class="drop-zone" id="csv-drop-zone" style="flex: 1; padding: var(--space-5);">
        <input type="file" id="csv-file-input" accept=".csv,.txt" style="display:none">
        <div class="drop-zone-text"><i data-lucide="upload-cloud" style="display:inline-block; vertical-align:middle; width:18px; height:18px; margin-right:6px;"></i> <strong>Trascina un file CSV</strong> oppure clicca per importare</div>
      </div>
      <div class="flex flex-col gap-2">
        <div style="display: flex; gap: var(--space-2);">
          <button class="btn btn-primary btn-sm" id="btn-prefix-classify" ${tb.length === 0 ? 'disabled' : ''} data-tooltip="Classifica in base alle regole di prefisso">
            <i data-lucide="zap" style="width:14px;height:14px;margin-right:6px;"></i> Classifica per Prefisso
          </button>
          <button class="btn btn-primary btn-sm" id="btn-ai-classify" ${tb.length === 0 ? 'disabled' : ''} data-tooltip="Dedurre classificazioni con l'IA">
            <i data-lucide="bot" style="width:14px;height:14px;margin-right:6px;"></i> Classifica con AI
          </button>
        </div>
        <button class="btn btn-danger btn-sm" id="btn-clear-all" ${tb.length === 0 ? 'disabled' : ''}>
          <i data-lucide="trash-2" style="width:14px;height:14px;margin-right:6px;"></i> Cancella Tutto
        </button>
      </div>
    </div>

    <!-- Trial Balance Table -->
    ${tb.length > 0 ? `
    <div class="card">
      <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; gap: var(--space-4); flex-wrap: wrap;">
        <h3 class="card-title">
          Bilancio di Verifica 
          ${searchQuery ? `(${filtered.length} di ${aggregated.length} conti)` : `(${aggregated.length} conti, ${tb.length} righe)`}
        </h3>
        <div style="position: relative; width: 280px;">
          <input type="text" class="form-input" id="tb-search" placeholder="Cerca codice o descrizione..." style="padding-left: var(--space-3); height: 36px; font-size: var(--text-sm); border-radius: var(--radius-md);">
        </div>
      </div>
      <div class="data-table-wrapper">
        <table class="data-table" id="tb-table">
          <thead>
            <tr>
              <th style="width:50px;"></th>
              <th style="width:120px;">Codice</th>
              <th>Nome Conto</th>
              <th style="width:80px; text-align:center;">Righe</th>
              <th style="width:160px; text-align:right;">Saldo</th>
              <th style="width:180px;">Categoria</th>
              <th style="width:70px; text-align:center;"></th>
              <th style="width:60px;"></th>
            </tr>
          </thead>
          ${activeGroups.map(g => {
            const isExpanded = expandedGroups.has(g.category.id);
            const page = groupPages[g.category.id] || 1;
            const visibleItems = isExpanded ? g.items.slice(0, page * PAGE_SIZE) : [];
            const hasMore = visibleItems.length < g.items.length;
            
            return `
            <tbody class="tb-group" data-group="${g.category.id}">
              <tr class="tb-group-header" style="cursor: pointer; background: var(--surface-color); border-top: 2px solid var(--border-color);">
                <td colspan="8" style="padding: var(--space-3) var(--space-4);">
                  <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div>
                      <strong style="color: var(--text-primary);">${isExpanded ? '▼' : '▶'} ${g.category.label}</strong>
                      <span class="badge badge-info" style="margin-left: 8px;">${g.items.length} conti</span>
                    </div>
                    <div style="color: ${g.totalDebit - g.totalCredit >= 0 ? 'var(--success-400)' : 'var(--danger-400)'}; font-family: var(--font-mono); font-weight: 500;">
                      Saldo: ${formatCurrency(g.totalDebit - g.totalCredit)}
                    </div>
                  </div>
                </td>
              </tr>
              ${visibleItems.map(entry => {
                const key = entry.glAccount || entry.name;
                const catId = mapping[key] || 'UNMAPPED';
                const reasoning = reasonings[key];
                const isAccountExpanded = expandedAccounts.has(key);
                const hasMultipleRows = entry.rowCount > 1;
                return `
                <tr data-gl-key="${escapeAttr(key)}" class="tb-aggregated-row">
                  <td class="text-muted" style="text-align: center;">
                    ${hasMultipleRows ? `<button class="btn btn-ghost btn-icon btn-sm btn-expand-account" data-key="${escapeAttr(key)}" data-tooltip="${isAccountExpanded ? 'Nascondi righe' : 'Mostra righe'}">${isAccountExpanded ? '▼' : '▶'}</button>` : ''}
                  </td>
                  <td><code style="color: var(--text-secondary);">${entry.glAccount || '—'}</code></td>
                  <td>
                    ${entry.name}
                    ${!hasMultipleRows && entry.date ? `<span style="font-size: var(--text-xs); color: var(--text-secondary); opacity: 0.8; margin-left: 8px;">(${entry.date})</span>` : ''}
                  </td>
                  <td style="text-align: center;">
                    ${hasMultipleRows ? `<span class="badge badge-primary">${entry.rowCount}</span>` : ''}
                  </td>
                  <td class="${entry.amount >= 0 ? 'amount positive' : 'amount negative'}">
                    ${formatCurrency(entry.amount)}
                  </td>
                  <td>
                    <select class="category-select" data-key="${escapeAttr(key)}">
                      ${Object.values(CATEGORIES).map(c => `
                        <option value="${c.id}" ${c.id === catId ? 'selected' : ''}>${c.label}</option>
                      `).join('')}
                    </select>
                  </td>
                  <td style="text-align: center;">
                    <div style="display: inline-flex; gap: var(--space-1); align-items: center; justify-content: center; min-height: 24px;">
                      ${reasoning ? `<span class="ai-reasoning-badge ai-reasoning-icon" data-key="${escapeAttr(key)}" style="cursor: pointer;" data-tooltip="Classificato dall'AI"><i data-lucide="bot" style="width:14px;height:14px;"></i></span>` : ''}
                      ${entry.discrepancy ? `<span class="badge badge-danger" style="cursor: help; padding: 2px 4px;" title="L'IA lo ha classificato diversamente rispetto alla regola dedotta per il prefisso ${entry.discrepancy.rulePrefix} (che prevede ${CATEGORIES[entry.discrepancy.ruleCategory]?.label || entry.discrepancy.ruleCategory}). Verifica!"><i data-lucide="alert-triangle" style="width:14px;height:14px;"></i></span>` : ''}
                    </div>
                  </td>
                  <td>
                    <button class="btn btn-ghost btn-icon btn-sm btn-delete-account" data-key="${escapeAttr(key)}" data-tooltip="Elimina conto"><i data-lucide="x" style="width:14px;height:14px;"></i></button>
                  </td>
                </tr>
                ${isAccountExpanded && hasMultipleRows ? entry.rows.map((row, ri) => `
                  <tr class="tb-detail-row">
                    <td></td>
                    <td colspan="3" style="padding-left: var(--space-8); color: var(--text-secondary); font-size: var(--text-xs);">
                      Riga ${ri + 1}: ${row.name} ${row.date ? `<span style="color: var(--text-muted); margin-left: 8px;">[Data: ${row.date}]</span>` : ''}
                    </td>
                    <td class="${row.amount >= 0 ? 'amount positive' : 'amount negative'}" style="font-size: var(--text-xs);">
                      ${formatCurrency(row.amount)}
                    </td>
                    <td colspan="3"></td>
                  </tr>
                `).join('') : ''}`;
              }).join('')}
              ${isExpanded && hasMore ? `
                <tr>
                  <td colspan="8" style="text-align: center; padding: var(--space-3);">
                    <button class="btn btn-secondary btn-sm btn-load-more" data-group="${g.category.id}">
                      Carica altri (mostrati ${visibleItems.length} su ${g.items.length})
                    </button>
                  </td>
                </tr>
              ` : ''}
            </tbody>`;
          }).join('')}
        </table>
      </div>
    </div>
    ` : `
    <div class="card">
      <div class="empty-state">
        <i data-lucide="bar-chart-2" class="empty-state-icon" style="width: 48px; height: 48px;"></i>
        <h3 class="empty-state-title">Nessun dato inserito</h3>
        <p class="empty-state-desc">Inserisci manualmente i conti dal form sopra, oppure importa un file CSV con il bilancio di verifica.</p>
      </div>
    </div>
    `}
      </div> <!-- /tb-main-pane -->

      <div class="tb-insights-pane">
        <!-- Summary Bar -->
        ${tb.length > 0 ? `
        <div class="tb-summary-bar">
          <div class="tb-summary-item">
            <span class="tb-summary-label">Totale Dare</span>
            <span class="tb-summary-value" style="color: var(--success-400);">${formatCurrency(totalDebit)}</span>
          </div>
          <div class="tb-summary-item">
            <span class="tb-summary-label">Totale Avere</span>
            <span class="tb-summary-value" style="color: var(--danger-400);">${formatCurrency(totalCredit)}</span>
          </div>
          <div class="tb-summary-item">
            <span class="tb-summary-label">Sbilancio</span>
            <span class="tb-summary-value" style="color: ${Math.abs(totalDebit - totalCredit) < 0.01 ? 'var(--success-400)' : 'var(--warning-400)'};">
              ${formatCurrency(totalDebit - totalCredit)}
            </span>
          </div>
          <div class="tb-summary-item">
            <span class="tb-summary-label">Conti (aggregati)</span>
            <span class="tb-summary-value" style="color: ${unmapped > 0 ? 'var(--warning-400)' : 'var(--success-400)'};">
              ${aggregated.length}
            </span>
            <span style="font-size: var(--text-xs); color: var(--text-muted); margin-top: 4px;">${tb.length} righe totali</span>
          </div>
          <div class="tb-summary-item">
            <span class="tb-summary-label">Non Classificati</span>
            <span class="tb-summary-value" style="color: ${unmapped > 0 ? 'var(--warning-400)' : 'var(--success-400)'};">
              ${unmapped}
            </span>
          </div>
        </div>
        ` : ''}
      </div> <!-- /tb-insights-pane -->
  `;

  updateDOM(container, htmlString);
  bindEvents();

  if (window.refreshIcons) window.refreshIcons();
}

function escapeAttr(str) {
  return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  // Delegate input events
  container.addEventListener('input', (e) => {
    if (e.target.id === 'tb-search') {
      searchQuery = e.target.value;
      render();
    }
  });

  // Delegate keydown events
  container.addEventListener('keydown', (e) => {
    if (['tb-gl-account', 'tb-name', 'tb-date', 'tb-amount'].includes(e.target.id)) {
      if (e.key === 'Enter') {
        const inputGL = container.querySelector('#tb-gl-account');
        const inputName = container.querySelector('#tb-name');
        const inputDate = container.querySelector('#tb-date');
        const inputAmount = container.querySelector('#tb-amount');
        addRow(inputGL, inputName, inputDate, inputAmount);
      }
    }
  });

  // Delegate change events
  container.addEventListener('change', async (e) => {
    if (e.target.id === 'csv-file-input') {
      const file = e.target.files[0];
      if (file) await importCSV(file);
      // Reset input so the same file can be selected again
      e.target.value = '';
    } else if (e.target.classList.contains('category-select')) {
      const key = e.target.dataset.key;
      store.setAccountMapping(key, e.target.value);
    }
  });

  // Delegate drag & drop for drop-zone
  container.addEventListener('dragover', (e) => {
    const dropZone = e.target.closest('#csv-drop-zone');
    if (dropZone) {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    }
  });
  container.addEventListener('dragleave', (e) => {
    const dropZone = e.target.closest('#csv-drop-zone');
    if (dropZone) dropZone.classList.remove('drag-over');
  });
  container.addEventListener('drop', async (e) => {
    const dropZone = e.target.closest('#csv-drop-zone');
    if (dropZone) {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) await importCSV(file);
    }
  });

  // Delegate click events
  container.addEventListener('click', (e) => {
    // Tutorial
    if (e.target.closest('#btn-start-tb-tour')) {
      startTour();
      return;
    }

    const target = e.target;
    
    // Add row
    if (target.closest('#btn-add-row')) {
      const inputGL = container.querySelector('#tb-gl-account');
      const inputName = container.querySelector('#tb-name');
      const inputDate = container.querySelector('#tb-date');
      const inputAmount = container.querySelector('#tb-amount');
      addRow(inputGL, inputName, inputDate, inputAmount);
      return;
    }

    // CSV Dropzone
    if (target.closest('#csv-drop-zone')) {
      container.querySelector('#csv-file-input')?.click();
      return;
    }

    // Classify actions
    if (target.closest('#btn-ai-classify')) { handleAiClassify(); return; }
    if (target.closest('#btn-prefix-classify')) { handlePrefixClassify(); return; }
    if (target.closest('#btn-clear-all')) {
      if (confirm('Eliminare tutti i dati del bilancio di verifica?')) {
        store.setTrialBalance([]);
        store.set('accountMapping', {});
        store.setOpeningBalances([]);
        store.clearAiReasonings();
        showToast('Dati cancellati', 'info');
      }
      return;
    }

    // Table elements
    const groupHeader = target.closest('.tb-group-header');
    if (groupHeader) {
      const groupId = groupHeader.closest('tbody').dataset.group;
      if (expandedGroups.has(groupId)) {
        expandedGroups.delete(groupId);
      } else {
        expandedGroups.add(groupId);
      }
      render();
      return;
    }

    const btnLoadMore = target.closest('.btn-load-more');
    if (btnLoadMore) {
      const groupId = btnLoadMore.dataset.group;
      groupPages[groupId] = (groupPages[groupId] || 1) + 1;
      render();
      return;
    }

    const btnExpandAccount = target.closest('.btn-expand-account');
    if (btnExpandAccount) {
      e.stopPropagation();
      const key = btnExpandAccount.dataset.key;
      if (expandedAccounts.has(key)) expandedAccounts.delete(key);
      else expandedAccounts.add(key);
      render();
      return;
    }

    const btnDelete = target.closest('.btn-delete-account');
    if (btnDelete) {
      const key = btnDelete.dataset.key;
      const newTb = store.state.trialBalance.filter(entry => (entry.glAccount || entry.name) !== key);
      store.setTrialBalance(newTb);
      showToast('Conto eliminato', 'info');
      return;
    }

    const aiReasoningIcon = target.closest('.ai-reasoning-icon');
    if (aiReasoningIcon) {
      e.stopPropagation();
      const key = aiReasoningIcon.dataset.key;
      const reasoning = store.state.aiReasonings[key];
      if (reasoning) showReasoningPopover(aiReasoningIcon, reasoning);
      return;
    }
  });
}

function showReasoningPopover(anchor, text) {
  // Remove any existing popover
  document.querySelectorAll('.reasoning-popover').forEach(p => p.remove());

  const popover = document.createElement('div');
  popover.className = 'reasoning-popover';
  popover.innerHTML = `
    <div class="reasoning-popover-header">Ragionamento AI</div>
    <div class="reasoning-popover-body">${text}</div>
  `;
  document.body.appendChild(popover);
  if (window.refreshIcons) window.refreshIcons();

  const rect = anchor.getBoundingClientRect();
  popover.style.top = `${rect.bottom + 8}px`;
  popover.style.left = `${Math.max(16, rect.left - 100)}px`;

  // Close on click outside
  const closeHandler = (e) => {
    if (!popover.contains(e.target) && e.target !== anchor) {
      popover.remove();
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 10);
}

function parseAmount(val) {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  // If it's a string, use our locale-aware parser
  return parseItalianNumber(val);
}

function startTour() {
  if (!window.driver) {
    console.warn("Driver.js non caricato");
    return;
  }
  const driverObj = window.driver.js.driver({
    showProgress: true,
    steps: [
      { 
        popover: { 
          title: 'Importazione Dati', 
          description: 'Questo tab è il cuore del programma. Qui importi e classifichi i tuoi conti contabili.' 
        } 
      },
      { 
        element: '#csv-drop-zone', 
        popover: { 
          title: 'Importa CSV', 
          description: 'Puoi trascinare o cliccare qui per caricare il tuo bilancio in formato CSV. Il sistema mapperà automaticamente colonne come Codice, Nome e Importo.' 
        } 
      },
      { 
        element: '#btn-ai-classify', 
        popover: { 
          title: 'Intelligenza Artificiale', 
          description: 'Dopo aver importato i dati, clicca qui per far capire all\'AI in quali categorie di bilancio ricadono i tuoi conti (es. Ricavi, Costi, Crediti).' 
        } 
      },
      { 
        element: '.tb-actions', 
        popover: { 
          title: 'Gestione Regole', 
          description: 'Puoi anche classificare per "Prefisso". Ad esempio tutti i conti che iniziano per "1" possono andare nelle Attività.' 
        } 
      },
      { 
        element: '.data-table-wrapper', 
        popover: { 
          title: 'Controlla e Modifica', 
          description: 'Nella tabella vedrai tutti i conti. Clicca sul badge colorato di fianco a ogni conto per correggere manualmente la classificazione se l\'AI ha sbagliato.' 
        } 
      }
    ]
  });
  driverObj.drive();
}

function addRow(inputGL, inputName, inputDate, inputAmount) {
  const name = inputName.value.trim();
  const amount = parseAmount(inputAmount.value);
  const dateStr = inputDate?.value.trim() || '';

  if (!name) {
    showToast('Inserisci almeno il nome del conto', 'warning');
    inputName.focus();
    return;
  }

  // Parse manual date with simple DD-MM default formatting
  const date = dateStr ? parseAndFormatDate(dateStr, 'DD-MM') : '';

  const row = {
    glAccount: inputGL.value.trim(),
    name,
    amount,
    date,
  };

  // Auto-classify by prefix first, then keyword fallback
  const key = row.glAccount || row.name;
  let catId = 'UNMAPPED';
  if (row.glAccount) {
    // Try prefix classification
    const prefixMapping = classifyAllByPrefix([row]);
    catId = prefixMapping[key] || 'UNMAPPED';
  }

  if (catId === 'UNMAPPED') {
    catId = classifyByKeywords(row.name);
  }

  store.addTrialBalanceRow(row);
  store.setAccountMapping(key, catId);

  // Clear inputs
  inputGL.value = '';
  inputName.value = '';
  if (inputDate) inputDate.value = '';
  inputAmount.value = '';
  inputGL.focus();

  showToast(`Conto "${name}" aggiunto`, 'success');
}

async function importCSV(file) {
  try {
    const text = await readFileAsText(file);
    
    showCSVMappingModal(text, (rows, errors) => {
      if (errors.length > 0 && rows.length === 0) {
        showToast(errors[0], 'warning');
        return;
      }

      if (rows.length > 0) {
        // Append to existing or replace
        const existing = store.state.trialBalance;
        if (existing.length > 0) {
          const replace = confirm(`Ci sono già ${existing.length} conti. Vuoi sostituirli con i ${rows.length} conti dal CSV?`);
          if (replace) {
            store.setTrialBalance(rows);
          } else {
            store.setTrialBalance([...existing, ...rows]);
          }
        } else {
          store.setTrialBalance(rows);
        }

        // Auto-classify with prefix rules first, then keyword fallback
        const prefixMapping = classifyAllByPrefix(rows);
        const keywordMapping = classifyAll(rows);
        
        // Merge: prefix takes priority over keyword when it's not UNMAPPED
        const finalMapping = {};
        for (const key of Object.keys(keywordMapping)) {
          if (prefixMapping[key] && prefixMapping[key] !== 'UNMAPPED') {
            finalMapping[key] = prefixMapping[key];
          } else {
            finalMapping[key] = keywordMapping[key];
          }
        }
        
        store.setBulkAccountMapping(finalMapping);

        showToast(`Importati ${rows.length} conti da CSV`, 'success');
        
        // Auto-expand UNMAPPED group
        expandedGroups.add('UNMAPPED');
        render();
      }
    });

  } catch (e) {
    showToast(`Errore import CSV: ${e.message}`, 'error');
  }
}


async function handleAiClassify() {
  if (!isAiConfigured()) {
    showToast("Configura la API Key Gemini nelle Impostazioni prima di usare l'AI", 'warning');
    return;
  }

  const tb = store.state.trialBalance;
  if (tb.length === 0) return;

  const btn = container.querySelector('#btn-ai-classify');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Classificazione in corso...';

  try {
    const { mapping, reasonings } = await aiClassifyAccounts(tb);
    
    // Extract mapped accounts to deduce rules
    const mappedAccounts = [];
    const uniqueKeys = new Set();
    for (const acc of tb) {
      const key = acc.glAccount || acc.name;
      if (uniqueKeys.has(key)) continue;
      uniqueKeys.add(key);

      const catId = mapping[key];
      if (catId && catId !== 'UNMAPPED' && acc.glAccount) {
        mappedAccounts.push({
          glAccount: acc.glAccount,
          name: acc.name,
          categoryId: catId
        });
      }
    }

    let deducedRules = [];
    if (mappedAccounts.length > 0) {
      btn.innerHTML = '<span class="spinner"></span> Apprendimento regole...';
      deducedRules = await aiDeduceRules(mappedAccounts);
    }

    // Apply these deduced rules to classify remaining UNMAPPED accounts in the mapping
    const finalMapping = { ...mapping };
    const finalReasonings = { ...reasonings };
    
    // Create a copy of tb entries to attach deduced prefix metadata
    const tbWithMetadata = tb.map(acc => ({ ...acc }));

    if (deducedRules.length > 0) {
      // Assicuriamoci che tutti i prefissi siano stringhe, altrimenti il sort e lo startsWith falliscono
      deducedRules.forEach(r => r.prefix = String(r.prefix));
      
      // Salva automaticamente e sovrascrive le regole dedotte nello store
      let existingRules = [...(store.state.classificationRules || [])];
      
      for (const deduced of deducedRules) {
        const idx = existingRules.findIndex(r => r.prefix === deduced.prefix);
        if (idx >= 0) {
          existingRules[idx] = deduced; // Sovrascrive la vecchia regola
        } else {
          existingRules.push(deduced); // Aggiunge nuova regola
        }
      }
      
      store.setClassificationRules(existingRules);

      // Sort rules by prefix length descending to match most specific prefix first
      const sortedRules = [...deducedRules].sort((a, b) => b.prefix.length - a.prefix.length);
      
      for (const acc of tbWithMetadata) {
        const key = acc.glAccount || acc.name;
        
        if (acc.glAccount) {
          const accStr = String(acc.glAccount);
          const matchingRule = sortedRules.find(r => accStr.startsWith(r.prefix));
          if (matchingRule) {
            // Only apply if it's still UNMAPPED
            if (!finalMapping[key] || finalMapping[key] === 'UNMAPPED') {
              finalMapping[key] = matchingRule.categoryId;
              finalReasonings[key] = `Classificato tramite regola dedotta: prefisso ${matchingRule.prefix}* (${matchingRule.label})`;
              acc.deducedPrefix = matchingRule.prefix;
            } else if (finalMapping[key] !== matchingRule.categoryId) {
              // Segnala la discrepanza se la classificazione semantica differisce dalla regola!
              acc.discrepancy = {
                aiCategory: finalMapping[key],
                ruleCategory: matchingRule.categoryId,
                rulePrefix: matchingRule.prefix
              };
            }
          }
        }
      }
    }


    // Show review panel before applying
    showAiReviewPanel(finalMapping, finalReasonings, deducedRules, tbWithMetadata);
    
  } catch (e) {
    showToast(`Errore AI: ${e.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '🤖 Classifica con AI';
  }
}

function showAiReviewPanel(mapping, reasonings, deducedRules, tb) {
  const entries = Object.entries(mapping);
  const classified = entries.filter(([_, catId]) => catId !== 'UNMAPPED').length;
  
  const contentHTML = `
    <p style="margin-bottom: var(--space-4); color: var(--text-secondary);">
      L'AI ha classificato/dedotto <strong style="color: var(--success-400);">${classified}</strong> conti su ${entries.length}. 
      Verifica le classificazioni e le regole dedotte prima di applicarle.
    </p>

    <!-- Deduced Rules Panel -->
    ${deducedRules.length > 0 ? `
    <div style="margin-bottom: var(--space-6); padding: var(--space-4); background: var(--surface-color); border: 1px solid var(--border-color); border-radius: var(--radius-md);">
      <h4 style="margin-top: 0; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
        <i data-lucide="edit-3" style="width:16px;height:16px;"></i> Regole di Prefisso Salvare Automaticamente
      </h4>
      <p style="font-size: var(--text-xs); color: var(--text-secondary); margin-bottom: var(--space-3);">
        L'AI ha individuato i seguenti pattern nei codici GL e le regole <strong>sono state salvate</strong> nelle Impostazioni.
      </p>
      <div style="display: flex; flex-direction: column; gap: var(--space-2);">
        ${deducedRules.map((rule, idx) => `
          <div style="display: flex; align-items: center; gap: 10px; background: var(--background-color); padding: 8px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); font-size: var(--text-xs);">
            <div style="flex: 1;">
              Codici che iniziano con <code>${rule.prefix}</code> &rarr; 
              <span class="badge badge-info">${CATEGORIES[rule.categoryId]?.label || rule.categoryId}</span> 
              <span style="color: var(--text-secondary); margin-left: 8px;">(${rule.label})</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <div class="data-table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 40px;"><input type="checkbox" id="ai-review-select-all" checked></th>
            <th style="width: 100px;">Codice</th>
            <th>Nome</th>
            <th style="width: 180px;">Categoria</th>
            <th>Motivazione / Logica AI</th>
          </tr>
        </thead>
        <tbody>
          ${entries.map(([key, catId]) => {
            const cat = CATEGORIES[catId];
            const reasoning = reasonings[key] || '';
            const account = tb.find(a => (a.glAccount || a.name) === key);
            const deducedPrefix = account?.deducedPrefix || '';
            const discrepancy = account?.discrepancy;
            
            const discrepancyBadge = discrepancy ? 
              `<span class="badge badge-danger" style="margin-left: 6px; font-size: 10px;" title="L'IA lo ha classificato come ${discrepancy.aiCategory}, ma la regola dedotta (${discrepancy.rulePrefix}) prevede ${CATEGORIES[discrepancy.ruleCategory]?.label || discrepancy.ruleCategory}">Discrepanza Regola!</span>` 
              : '';
              
            return `
            <tr data-review-key="${escapeAttr(key)}" ${discrepancy ? 'style="background: rgba(255, 68, 68, 0.05);"' : ''}>
              <td>
                <input type="checkbox" class="ai-review-check" 
                  data-key="${escapeAttr(key)}" 
                  checked>
              </td>
              <td><code style="color: var(--text-muted);">${key}</code></td>
              <td>${account?.name || key}</td>
              <td>
                <span class="badge badge-info">${cat?.label || catId}</span>
                ${deducedPrefix ? `<span class="badge badge-warning" style="margin-left: 6px; font-size: 10px;">Dedotto</span>` : ''}
                ${discrepancyBadge}
              </td>
              <td style="font-size: var(--text-xs); color: var(--text-secondary); max-width: 300px;">
                ${reasoning ? `${reasoning}` : '<span class="text-muted">—</span>'}
                ${discrepancy ? `<br><strong style="color: var(--danger-400);">Attenzione:</strong> il codice inizia con <code>${discrepancy.rulePrefix}</code>, che normalmente è associato a ${CATEGORIES[discrepancy.ruleCategory]?.label || discrepancy.ruleCategory}. Verifica se la classificazione semantica è corretta.` : ''}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  const footerHTML = `
    <button class="btn btn-primary" id="ai-review-apply"><i data-lucide="check" style="width:14px;height:14px;margin-right:6px;"></i> Applica Selezionati</button>
  `;

  const { overlay, close } = createModal({
    title: 'Review Classificazione AI & Regole',
    icon: 'bot',
    contentHTML,
    footerHTML,
    modalClass: 'modal-xl',
    contentStyle: 'max-height: 90vh;',
    bodyStyle: 'overflow-y: auto;'
  });

  // Select all toggle
  overlay.querySelector('#ai-review-select-all').addEventListener('change', (e) => {
    overlay.querySelectorAll('.ai-review-check').forEach(cb => cb.checked = e.target.checked);
  });

  // Apply selected
  overlay.querySelector('#ai-review-apply').addEventListener('click', () => {
    const selectedMapping = {};
    const selectedReasonings = {};
    
    overlay.querySelectorAll('.ai-review-check:checked').forEach(cb => {
      const key = cb.dataset.key;
      if (mapping[key]) {
        selectedMapping[key] = mapping[key];
      }
      if (reasonings[key]) {
        selectedReasonings[key] = reasonings[key];
      }
    });

    store.setBulkAccountMapping(selectedMapping);
    store.setAiReasonings(selectedReasonings);

    const count = Object.keys(selectedMapping).filter(k => selectedMapping[k] !== 'UNMAPPED').length;
    showToast(`Applicate ${count} classificazioni AI`, 'success');
    close();
  });
}

function handlePrefixClassify() {
  const tb = store.state.trialBalance;
  if (tb.length === 0) return;

  const mapping = classifyAllByPrefix(tb);
  store.setBulkAccountMapping(mapping);

  const classified = Object.values(mapping).filter(v => v !== 'UNMAPPED').length;
  const total = Object.keys(mapping).length;
  showToast(`Classificati ${classified} su ${total} conti con regole prefisso G/L`, 'success');
}


