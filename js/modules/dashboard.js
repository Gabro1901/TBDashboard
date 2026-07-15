// ═══════════════════════════════════════════
// DASHBOARD — KPI & Charts
// ═══════════════════════════════════════════

import { store } from '../data/store.js';
import { computeAggregates, computeKpi, getPresetKpis, getVariableDescriptions, evaluateFormulaDetailed, formatKpiValue } from '../utils/kpiEngine.js';
import { formatCurrency } from '../utils/formatters.js';
import { aiGenerateKpi, isAiConfigured } from '../utils/aiService.js';
import { showToast } from '../utils/toast.js';
import { initFormulaBuilder } from '../utils/formulaAutocomplete.js';
import { updateDOM } from '../utils/domHelpers.js';
import { createModal } from '../utils/uiComponents.js';
import { generateNarrativeReport } from '../utils/narrativeEngine.js';
import { renderCharts, openChartModal, destroyAllCharts } from './dashboardCharts.js';
import { openVariablesModal } from './dashboardVariables.js';

let container;
const kpiFormulasExpanded = new Set(); // Track which KPI cards have formulas expanded
let eventsBound = false;

let periodA = { start: '', end: '' };
let periodB = { start: '', end: '' };

function parseItDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  return new Date(`${y}-${m}-${d}T00:00:00`);
}

function filterTb(tb, startYMD, endYMD) {
  if (!startYMD && !endYMD) return tb;
  const start = startYMD ? new Date(`${startYMD}T00:00:00`) : new Date('1900-01-01T00:00:00');
  const end = endYMD ? new Date(`${endYMD}T23:59:59`) : new Date('2100-01-01T23:59:59');
  return tb.filter(row => {
    if (!row.date) return false;
    const rd = parseItDate(row.date);
    if (!rd) return false;
    return rd >= start && rd <= end;
  });
}

export function init(el) {
  container = el;
  
  // Create preset KPIs if none exist
  if (store.state.dashboardKpis.length === 0) {
    const presets = getPresetKpis();
    // Add first 4 presets by default
    presets.slice(0, 4).forEach(p => store.addKpi(p));
  }

  render();
  store.on('dashboardKpis', render);
  store.on('trialBalance', render);
  store.on('accountMapping', render);
}

export function render() {
  if (!container) return;
  store.ensureKpiIds();

  const kpis = store.state.dashboardKpis;
  const tbA = periodA.start || periodA.end ? filterTb(store.state.trialBalance, periodA.start, periodA.end) : store.state.trialBalance;
  const tbB = periodB.start || periodB.end ? filterTb(store.state.trialBalance, periodB.start, periodB.end) : null;

  const aggregatesA = computeAggregates(tbA);
  const aggregatesB = tbB ? computeAggregates(tbB) : null;
  const presets = getPresetKpis();
  const varDesc = getVariableDescriptions();

  // If we don't have enough data (no trial balance)
  const hasData = store.state.trialBalance.length > 0;

  const htmlString = `
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center;">
      <div>
        <h1 class="page-title">Dashboard KPI</h1>
        <p class="page-subtitle">Analisi degli indicatori di performance, configurabili e supportati dall'AI.</p>
      </div>
      <button class="btn btn-outline btn-sm" id="btn-start-db-tour">
        <i data-lucide="help-circle" style="width:14px;height:14px;margin-right:6px;"></i> Tutorial
      </button>
    </div>

    <!-- Filtri di Periodo -->
    <div class="dashboard-filters card" style="margin-bottom: var(--space-6); padding: var(--space-4);">
      <h3 style="font-size: var(--text-sm); font-weight: 600; margin-bottom: var(--space-3); color: var(--text-primary);">Confronto Temporale</h3>
      <div style="display: flex; gap: var(--space-6); flex-wrap: wrap;">
        <div class="filter-group">
          <label style="font-size: var(--text-xs); color: var(--text-muted); margin-bottom: var(--space-1); display: block;">Periodo A (Riferimento)</label>
          <div style="display: flex; gap: var(--space-2);">
            <input type="date" class="form-input" id="filter-a-start" value="${periodA.start}">
            <input type="date" class="form-input" id="filter-a-end" value="${periodA.end}">
          </div>
        </div>
        <div class="filter-group">
          <label style="font-size: var(--text-xs); color: var(--text-muted); margin-bottom: var(--space-1); display: block;">Periodo B (Confronto)</label>
          <div style="display: flex; gap: var(--space-2);">
            <input type="date" class="form-input" id="filter-b-start" value="${periodB.start}">
            <input type="date" class="form-input" id="filter-b-end" value="${periodB.end}">
          </div>
        </div>
        <div style="display: flex; align-items: flex-end;">
          <button class="btn btn-secondary" id="btn-apply-filters">Applica Filtri</button>
          <button class="btn btn-ghost" id="btn-reset-filters" style="margin-left: var(--space-2);">Reset</button>
        </div>
      </div>
    </div>

    ${!hasData ? `
      <div class="card" style="margin-bottom: var(--space-6);">
        <div class="empty-state">
          <i data-lucide="bar-chart-2" class="empty-state-icon" style="width:48px;height:48px;border:none;background:transparent;"></i>
          <h3 class="empty-state-title">Nessun dato contabile</h3>
          <p class="empty-state-desc">Importa un bilancio di verifica per vedere i KPI calcolati e i grafici.</p>
        </div>
      </div>
    ` : ''}

    <!-- KPI Grid -->
    <div class="bento-dashboard-v2" id="kpi-grid">
      ${kpis.map((kpi, index) => {
        const valA = hasData ? computeKpi(kpi, aggregatesA) : NaN;
        const valB = aggregatesB ? computeKpi(kpi, aggregatesB) : NaN;
        
        let formattedA = '—';
        let formattedB = '';
        let varianceHtml = '';

        if (!isNaN(valA)) {
          formattedA = formatKpiValue(valA, kpi.type);
        }

        if (aggregatesB && !isNaN(valB)) {
          formattedB = formatKpiValue(valB, kpi.type);
          
          if (valB !== 0 && !isNaN(valA)) {
            const variance = ((valA - valB) / Math.abs(valB)) * 100;
            const isPositive = variance > 0;
            const varianceColor = isPositive ? 'var(--success-500)' : (variance < 0 ? 'var(--danger-500)' : 'var(--text-muted)');
            const varianceIcon = isPositive ? '↗' : (variance < 0 ? '↘' : '=');
            varianceHtml = `<div style="font-size: var(--text-xs); font-weight: 600; color: ${varianceColor}; background: ${varianceColor}20; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-left: var(--space-2);">${varianceIcon} ${Math.abs(variance).toFixed(1)}%</div>`;
          }
        }
        
        const isExpanded = kpiFormulasExpanded.has(kpi.id);
        const formulaDetails = hasData ? evaluateFormulaDetailed(kpi.formula, aggregatesA) : { steps: '' };
        
        const cardClass = index < 2 ? 'kpi-card-primary' : 'kpi-card-secondary';

        return `
          <div class="kpi-card ${cardClass}" data-id="${kpi.id}" draggable="true">
            <div class="kpi-card-actions">
              <button class="btn btn-ghost btn-icon btn-sm btn-edit-kpi" data-id="${kpi.id}" data-tooltip="Modifica KPI"><i data-lucide="edit-2" style="width:14px;height:14px;"></i></button>
              <button class="btn btn-ghost btn-icon btn-sm btn-delete-kpi" data-id="${kpi.id}" data-tooltip="Elimina KPI"><i data-lucide="x" style="width:14px;height:14px;"></i></button>
            </div>
            <div class="kpi-card-label" style="display: flex; align-items: center; gap: var(--space-2); cursor: grab;" title="Trascina per riordinare">
              <i data-lucide="grip-horizontal" style="width:12px;height:12px;color:var(--text-muted);"></i> ${kpi.name}
            </div>
            <div style="display: flex; align-items: baseline; gap: var(--space-2);">
              <div class="kpi-card-value">${formattedA}</div>
              ${varianceHtml}
            </div>
            ${aggregatesB ? `<div style="font-size: var(--text-sm); color: var(--text-muted); margin-top: var(--space-1);">vs ${formattedB} (Per. B)</div>` : ''}
            
            <div class="kpi-card-formula" style="border-top: none; padding-top: 0;">
              <button id="kpi-formula-btn-${kpi.id}" class="btn btn-ghost btn-sm btn-toggle-formula" data-id="${kpi.id}" style="padding: var(--space-1) var(--space-2); margin-top: var(--space-2); width: 100%; justify-content: center; font-size: var(--text-xs); color: var(--text-muted);">
                <span>${isExpanded ? 'Nascondi calcolo' : 'Mostra calcolo'}</span> <i data-lucide="${isExpanded ? 'chevron-up' : 'chevron-down'}" style="width:14px;height:14px;margin-left:4px;"></i>
              </button>
              <div id="kpi-formula-details-${kpi.id}" style="display: ${isExpanded ? 'block' : 'none'}; margin-top: var(--space-3); padding: var(--space-3); background: var(--bg-surface); border-radius: var(--radius-sm); border: 1px solid var(--glass-border); text-align: left;">
                <div style="font-size: var(--text-xs); color: var(--text-secondary); margin-bottom: var(--space-2); font-family: var(--font-mono);"><strong>Formula:</strong> ${kpi.formula}</div>
                <div style="font-size: var(--text-xs); color: var(--text-secondary); margin-bottom: var(--space-2); word-break: break-all; font-family: var(--font-mono);">
                  <strong>Valori (Per. A):</strong> ${formulaDetails.steps}
                </div>
                <div style="font-weight: 600; color: var(--primary-400);">
                  = ${formattedA}
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>

    <!-- Commento Analitico (Narrative Reporting) -->
    <div style="margin-top: var(--space-6); margin-bottom: var(--space-4);">
      <h2 style="font-size: var(--text-xl); font-weight: 600; color: var(--text-primary); margin-bottom: var(--space-3);">Commento Gestionale</h2>
      <div class="card" style="padding: var(--space-4); background: var(--bg-surface); border-left: 4px solid var(--primary-500);">
        <p style="font-size: var(--text-md); line-height: 1.6; color: var(--text-secondary); margin: 0;">
          ${hasData && aggregatesB ? generateNarrativeReport(aggregatesA, aggregatesB) : "Seleziona o compila un 'Periodo B (Confronto)' nei filtri in alto per generare un commento analitico sulle variazioni."}
        </p>
      </div>
    </div>

    <!-- Charts Area -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: var(--space-6); margin-bottom: var(--space-4);">
      <h2 style="font-size: var(--text-xl); font-weight: 600; color: var(--text-primary);">Grafici Dashboard</h2>
      <button class="btn btn-primary btn-sm" id="btn-open-add-chart">
        <i data-lucide="bar-chart-2" style="width:14px;height:14px;margin-right:6px;"></i> Aggiungi Grafico
      </button>
    </div>

    ${hasData ? `
      <div class="dashboard-charts-bento">
        ${(store.state.dashboardCharts || []).map(chart => `
          <div class="chart-container" data-chart-id="${chart.id}">
            <div class="chart-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4);">
              <h3 class="chart-title" style="margin-bottom: 0;">${chart.name}</h3>
              <div style="display: flex; gap: var(--space-1);">
                <button class="btn btn-ghost btn-icon btn-sm btn-edit-chart" data-id="${chart.id}"><i data-lucide="edit-2" style="width:14px;height:14px;"></i></button>
                <button class="btn btn-ghost btn-icon btn-sm btn-delete-chart" data-id="${chart.id}"><i data-lucide="x" style="width:14px;height:14px;"></i></button>
              </div>
            </div>
            <div class="chart-canvas-wrapper">
              <canvas id="canvas-${chart.id}"></canvas>
            </div>
          </div>
        `).join('')}
      </div>
    ` : `
      <div class="empty-state" style="margin-top: var(--space-4);">
        Nessun dato contabile per generare i grafici.
      </div>
    `}


    <div class="divider"></div>

    <!-- Configuration Area -->
    <div style="display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: var(--space-6);">
      
      <!-- Preset & AI KPI creation -->
      <div>
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Aggiungi KPI Predefinito</h3>
          </div>
          <div class="kpi-preset-grid">
            ${presets.filter(p => !kpis.find(k => k.name === p.name)).map(p => `
              <div class="kpi-preset-item" data-preset="${p.id}">
                <div class="kpi-preset-info">
                  <div class="kpi-preset-name">${p.name}</div>
                  <div class="kpi-preset-formula">${p.formula}</div>
                </div>
                <button class="btn btn-ghost btn-icon btn-sm btn-add-preset" data-preset="${p.id}"><i data-lucide="plus" style="width:14px;height:14px;"></i></button>
              </div>
            `).join('') || '<div class="text-muted">Tutti i KPI predefiniti sono già stati aggiunti.</div>'}
          </div>

          <div class="divider"></div>

          <div class="card-header">
            <h3 class="card-title"><i data-lucide="plus-circle" style="display:inline-block;vertical-align:middle;margin-right:6px;width:18px;height:18px;"></i> Nuovo KPI Personalizzato</h3>
          </div>
          
          <div class="tabs" style="margin-bottom: var(--space-4);">
            <div class="tab active" id="tab-kpi-manual" data-target="panel-kpi-manual">✍️ Manuale</div>
            <div class="tab" id="tab-kpi-ai" data-target="panel-kpi-ai">🤖 Con AI</div>
          </div>

          <div id="panel-kpi-manual">
            <div class="form-group" style="margin-bottom: var(--space-3);">
              <label class="form-label">Nome KPI</label>
              <input type="text" id="manual-kpi-name" class="form-input" placeholder="Es. Margine Operativo">
            </div>
            <div class="form-group" style="margin-bottom: var(--space-3);">
              <label class="form-label">Formula <span style="font-weight: normal; color: var(--text-muted);">(usa le variabili a destra)</span></label>
              <input type="text" id="manual-kpi-formula" class="form-input" placeholder="Es. ebitda / ricavi">
            </div>
            <div class="form-group" style="margin-bottom: var(--space-4);">
              <label class="form-label">Formato</label>
              <select id="manual-kpi-type" class="form-select">
                <option value="currency">Valuta (€)</option>
                <option value="percent">Percentuale (%)</option>
                <option value="ratio">Rapporto (x)</option>
              </select>
            </div>
            <button class="btn btn-primary" id="btn-add-manual-kpi">Aggiungi KPI</button>
          </div>

          <div id="panel-kpi-ai" style="display: none;">
            <p style="font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: var(--space-4);">
              Descrivi in linguaggio naturale l'indicatore che vuoi calcolare. L'AI genererà automaticamente la formula.
            </p>
            <div class="ai-input-area">
              <input type="text" class="form-input" id="ai-kpi-prompt" placeholder="es. 'Voglio vedere l'incidenza del costo del personale sui ricavi totali'">
              <button class="btn btn-primary" id="btn-ai-kpi">
                <i data-lucide="sparkles" style="width:14px;height:14px;margin-right:6px;"></i> Genera
              </button>
            </div>
            <div id="ai-kpi-result-container"></div>
          </div>

          <div class="divider"></div>

          <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
            <h3 class="card-title"><i data-lucide="database" style="display:inline-block;vertical-align:middle;margin-right:6px;width:18px;height:18px;"></i> Variabili Personalizzate</h3>
            <button class="btn btn-outline btn-sm" id="btn-manage-variables">Gestisci</button>
          </div>
          <div class="text-muted" style="font-size: var(--text-sm); margin-top: var(--space-2);">
            Crea variabili raggruppando conti specifici dal bilancio di verifica per usarle nelle formule dei tuoi KPI.
          </div>
        </div>
      </div>

      <!-- Variable Reference Panel -->
      <div>
        <div class="card" style="height: 100%;">
          <div class="card-header">
            <h3 class="card-title"><i data-lucide="book" style="display:inline-block;vertical-align:middle;margin-right:6px;width:18px;height:18px;"></i> Dizionario Variabili</h3>
          </div>
          <p style="font-size: var(--text-xs); color: var(--text-secondary); margin-bottom: var(--space-4);">
            Variabili utilizzabili nelle formule KPI e come vengono calcolate dal bilancio.
          </p>
          <div style="max-height: 400px; overflow-y: auto; padding-right: var(--space-2);">
            ${varDesc.map(v => `
              <div style="margin-bottom: var(--space-3); padding-bottom: var(--space-3); border-bottom: 1px solid var(--glass-border);">
                <div style="font-family: var(--font-mono); font-weight: 600; color: var(--primary-400); font-size: var(--text-sm); margin-bottom: 2px;">
                  ${v.name}
                </div>
                <div style="font-size: var(--text-sm); color: var(--text-primary); margin-bottom: 2px;">
                  ${v.description}
                </div>
                <div style="font-size: var(--text-xs); color: var(--text-muted); font-style: italic;">
                  Calcolo: ${v.computation}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>

    <div id="kpi-edit-modal-container"></div>
    <div id="chart-edit-modal-container"></div>
    <div id="vars-modal-container"></div>
  `;

  updateDOM(container, htmlString);
  bindEvents();
  if (hasData) {
    // Delay chart rendering slightly to ensure DOM is ready
    setTimeout(() => {
      renderCharts(aggregatesA, aggregatesB);
    }, 50);
  }
  if (window.refreshIcons) window.refreshIcons();
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  // Init formula builder once for the static manual input
  const manualKpiFormulaInput = container.querySelector('#manual-kpi-formula');
  if (manualKpiFormulaInput) initFormulaBuilder(manualKpiFormulaInput);

  // ── Drag & Drop for KPI Grid (event delegation) ──────────────────────────
  let draggedEl = null;          // the card being dragged
  let placeholder = null;        // visual drop-target indicator

  const makePlaceholder = (height) => {
    const el = document.createElement('div');
    el.id = 'kpi-drag-placeholder';
    el.style.cssText = `height:${height}px;border-radius:var(--radius-lg);background:var(--primary-500);opacity:0.15;border:2px dashed var(--primary-400);transition:none;pointer-events:none;`;
    return el;
  };

  const removePlaceholder = () => {
    placeholder?.remove();
    placeholder = null;
  };

  container.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.kpi-card');
    if (!card) return;
    draggedEl = card;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.dataset.id);
    placeholder = makePlaceholder(card.offsetHeight);
    requestAnimationFrame(() => card.classList.add('dragging'));
  });

  container.addEventListener('dragend', () => {
    draggedEl?.classList.remove('dragging');
    removePlaceholder();
    draggedEl = null;
  });

  container.addEventListener('dragenter', (e) => { 
    if (e.target.closest('#kpi-grid')) e.preventDefault(); 
  });

  container.addEventListener('dragover', (e) => {
    if (!draggedEl) return;
    const grid = e.target.closest('#kpi-grid');
    if (!grid) return;
    
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const target = e.target.closest('.kpi-card');
    if (!target || target === draggedEl) return;

    const rect = target.getBoundingClientRect();
    let insertAfter = false;
    if (e.clientY > rect.bottom - rect.height * 0.25) {
      insertAfter = true;
    } else if (e.clientY < rect.top + rect.height * 0.25) {
      insertAfter = false;
    } else {
      insertAfter = e.clientX > rect.left + rect.width / 2;
    }

    if (insertAfter) target.after(placeholder);
    else target.before(placeholder);
  });

  container.addEventListener('drop', (e) => {
    if (!draggedEl || !placeholder) return;
    const grid = e.target.closest('#kpi-grid');
    if (!grid) return;

    e.preventDefault();
    placeholder.replaceWith(draggedEl);
    placeholder = null;
    draggedEl.classList.remove('dragging');

    const newOrderIds = Array.from(grid.querySelectorAll('.kpi-card')).map(c => c.dataset.id);
    store.reorderKpis(newOrderIds);
    draggedEl = null;
  });

  // ── Input / Keydown Delegation ──────────────────────────
  container.addEventListener('keydown', (e) => {
    if (e.target.id === 'ai-kpi-prompt' && e.key === 'Enter') {
      handleAiKpiGeneration(e.target.value);
    }
  });

  // ── Click Event Delegation ───────────────────────────────
  container.addEventListener('click', (e) => {
    const target = e.target;

    // Tutorial
    if (target.closest('#btn-start-db-tour')) {
      startTour();
      return;
    }

    // Apply Filters
    if (target.closest('#btn-apply-filters')) {
      periodA.start = container.querySelector('#filter-a-start').value;
      periodA.end = container.querySelector('#filter-a-end').value;
      periodB.start = container.querySelector('#filter-b-start').value;
      periodB.end = container.querySelector('#filter-b-end').value;
      render();
      return;
    }

    // Reset Filters
    if (target.closest('#btn-reset-filters')) {
      periodA = { start: '', end: '' };
      periodB = { start: '', end: '' };
      render();
      return;
    }

    // Edit KPI
    const btnEditKpi = target.closest('.btn-edit-kpi');
    if (btnEditKpi) {
      e.stopPropagation();
      openEditKpiModal(btnEditKpi.dataset.id);
      return;
    }

    // Delete KPI
    const btnDeleteKpi = target.closest('.btn-delete-kpi');
    if (btnDeleteKpi) {
      e.stopPropagation();
      if (confirm('Sei sicuro di voler eliminare questo KPI?')) {
        store.removeKpi(btnDeleteKpi.dataset.id);
      }
      return;
    }

    // Open Add Chart
    if (target.closest('#btn-open-add-chart')) {
      openChartModal(null, render);
      return;
    }

    // Edit Chart
    const btnEditChart = target.closest('.btn-edit-chart');
    if (btnEditChart) {
      e.stopPropagation();
      openChartModal(btnEditChart.dataset.id, render);
      return;
    }

    // Delete Chart
    const btnDeleteChart = target.closest('.btn-delete-chart');
    if (btnDeleteChart) {
      e.stopPropagation();
      if (confirm('Sei sicuro di voler eliminare questo grafico?')) {
        store.removeChart(btnDeleteChart.dataset.id);
      }
      return;
    }

    // Tabs
    const tab = target.closest('.tab');
    if (tab && (tab.id === 'tab-kpi-manual' || tab.id === 'tab-kpi-ai')) {
      container.querySelectorAll('#tab-kpi-manual, #tab-kpi-ai').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const t = tab.dataset.target;
      container.querySelector('#panel-kpi-manual').style.display = t === 'panel-kpi-manual' ? 'block' : 'none';
      container.querySelector('#panel-kpi-ai').style.display = t === 'panel-kpi-ai' ? 'block' : 'none';
      return;
    }

    // Add Manual KPI
    if (target.closest('#btn-add-manual-kpi')) {
      const name = container.querySelector('#manual-kpi-name').value.trim();
      const formula = container.querySelector('#manual-kpi-formula').value.trim();
      const type = container.querySelector('#manual-kpi-type').value;

      if (!name || !formula) {
        showToast('Inserisci nome e formula per il KPI', 'warning');
        return;
      }

      store.addKpi({ id: 'kpi_' + Math.random().toString(36).substr(2, 9), name, formula, type });
      showToast('KPI personalizzato aggiunto', 'success');
      container.querySelector('#manual-kpi-name').value = '';
      container.querySelector('#manual-kpi-formula').value = '';
      return;
    }

    // Manage Variables
    if (target.closest('#btn-manage-variables')) {
      openVariablesModal();
      return;
    }

    // Toggle Formula
    const btnToggleFormula = target.closest('.btn-toggle-formula');
    if (btnToggleFormula) {
      e.stopPropagation();
      const id = btnToggleFormula.dataset.id;
      const detailsDiv = container.querySelector(`#kpi-formula-details-${id}`);
      const textSpan = btnToggleFormula.querySelector('span');
      
      let isExpanded;
      if (detailsDiv.style.display === 'none') {
        detailsDiv.style.display = 'block';
        textSpan.textContent = 'Nascondi calcolo';
        kpiFormulasExpanded.add(id);
        isExpanded = true;
      } else {
        detailsDiv.style.display = 'none';
        textSpan.textContent = 'Mostra calcolo';
        kpiFormulasExpanded.delete(id);
        isExpanded = false;
      }

      const oldIcon = btnToggleFormula.querySelector('svg') || btnToggleFormula.querySelector('i');
      if (oldIcon) oldIcon.remove();
      
      const newIcon = document.createElement('i');
      newIcon.setAttribute('data-lucide', isExpanded ? 'chevron-up' : 'chevron-down');
      newIcon.style.width = '14px';
      newIcon.style.height = '14px';
      newIcon.style.marginLeft = '4px';
      btnToggleFormula.appendChild(newIcon);

      if (window.lucide) window.lucide.createIcons({ root: btnToggleFormula });
      return;
    }

    // Preset KPI Add
    const presetItem = target.closest('.kpi-preset-item');
    if (presetItem) {
      const presetId = presetItem.dataset.preset;
      if (presetId) {
        const preset = getPresetKpis().find(p => p.id === presetId);
        if (preset) {
          store.addKpi(preset);
          showToast(`KPI "${preset.name}" aggiunto`, 'success');
        }
      }
      return;
    }

    // AI KPI Generate
    if (target.closest('#btn-ai-kpi')) {
      handleAiKpiGeneration(container.querySelector('#ai-kpi-prompt').value);
      return;
    }
  });

  // Checkbox Event Delegation (for "change" event)
  container.addEventListener('change', (e) => {
    if (e.target.classList.contains('fixed-category-cb')) {
      const checkboxes = container.querySelectorAll('.fixed-category-cb:checked');
      const selected = Array.from(checkboxes).map(cb => cb.value);
      store.setFixedCategories(selected);
    }
  });
}

function openEditKpiModal(id) {
  const kpi = store.state.dashboardKpis.find(k => k.id === id);
  if (!kpi) return;

  const contentHTML = `
    <div class="form-group" style="margin-bottom: var(--space-3);">
      <label class="form-label">Nome KPI</label>
      <input type="text" id="edit-kpi-name" class="form-input" value="${kpi.name.replace(/"/g, '&quot;')}">
    </div>
    <div class="form-group" style="margin-bottom: var(--space-3);">
      <label class="form-label">Formula</label>
      <input type="text" id="edit-kpi-formula" class="form-input" value="${kpi.formula.replace(/"/g, '&quot;')}">
    </div>
    <div class="form-group" style="margin-bottom: var(--space-4);">
      <label class="form-label">Formato</label>
      <select id="edit-kpi-type" class="form-select">
        <option value="currency" ${kpi.type === 'currency' ? 'selected' : ''}>Valuta (€)</option>
        <option value="percent" ${kpi.type === 'percent' ? 'selected' : ''}>Percentuale (%)</option>
        <option value="ratio" ${kpi.type === 'ratio' ? 'selected' : ''}>Rapporto (x)</option>
      </select>
    </div>
  `;

  const footerHTML = `
    <button class="btn btn-primary" id="btn-save-edit-kpi">Salva Modifiche</button>
  `;

  const { overlay, close } = createModal({
    title: 'Modifica KPI',
    contentHTML,
    footerHTML
  });

  const formulaInput = overlay.querySelector('#edit-kpi-formula');
  if (formulaInput) initFormulaBuilder(formulaInput);

  const saveBtn = overlay.querySelector('#btn-save-edit-kpi');
  
  saveBtn.addEventListener('click', () => {
    const name = overlay.querySelector('#edit-kpi-name').value.trim();
    const formula = overlay.querySelector('#edit-kpi-formula').value.trim();
    const type = overlay.querySelector('#edit-kpi-type').value;
    
    if (!name || !formula) {
      showToast('Nome e formula sono obbligatori', 'warning');
      return;
    }
    
    store.updateKpi(id, { name, formula, type });
    showToast('KPI modificato con successo', 'success');
    close();
  });
}

async function handleAiKpiGeneration(prompt) {
  if (!prompt.trim()) {
    showToast('Inserisci una descrizione per il KPI', 'warning');
    return;
  }

  if (!isAiConfigured()) {
    showToast('Configura la API Key Gemini nelle Impostazioni', 'warning');
    return;
  }

  const btn = container.querySelector('#btn-ai-kpi');
  const resultContainer = container.querySelector('#ai-kpi-result-container');
  
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner btn-icon"></span>';
  resultContainer.innerHTML = '';

  try {
    const kpi = await aiGenerateKpi(prompt);
    
    // Show suggestion
    resultContainer.innerHTML = `
      <div class="ai-suggestion">
        <div class="ai-suggestion-header">
          <span>✨ KPI Generato: ${kpi.name}</span>
        </div>
        <div class="ai-formula-display">${kpi.formula}</div>
        <div style="font-size: var(--text-xs); color: var(--text-secondary); margin-bottom: var(--space-3);">
          <strong>Tipo:</strong> ${kpi.type === 'percent' ? 'Percentuale (%)' : kpi.type === 'currency' ? 'Valuta (€)' : 'Rapporto (x)'}
        </div>
        <div style="display: flex; gap: var(--space-3);">
          <button class="btn btn-primary btn-sm" id="btn-accept-ai-kpi">Aggiungi alla Dashboard</button>
          <button class="btn btn-ghost btn-sm" id="btn-reject-ai-kpi">Rifiuta</button>
        </div>
      </div>
    `;

    resultContainer.querySelector('#btn-accept-ai-kpi').addEventListener('click', () => {
      kpi.id = 'kpi_' + Math.random().toString(36).substr(2, 9);
      store.addKpi(kpi);
      resultContainer.innerHTML = '';
      container.querySelector('#ai-kpi-prompt').value = '';
      showToast('KPI AI aggiunto', 'success');
    });

    resultContainer.querySelector('#btn-reject-ai-kpi').addEventListener('click', () => {
      resultContainer.innerHTML = '';
    });

  } catch (err) {
    showToast(`Errore AI: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '✨ Genera';
  }
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
          title: 'Dashboard KPI', 
          description: 'Qui puoi configurare i tuoi indicatori di performance preferiti e creare grafici per monitorare l\'andamento dell\'azienda.' 
        } 
      },
      { 
        element: '.dashboard-filters', 
        popover: { 
          title: 'Confronto Temporale', 
          description: 'Seleziona due periodi distinti (Periodo A e Periodo B). La dashboard confronterà automaticamente i KPI tra questi due archi temporali.' 
        } 
      },
      { 
        element: '#kpi-grid', 
        popover: { 
          title: 'KPI e Metriche', 
          description: 'Le tue metriche appaiono qui. Puoi cliccare su \'Mostra calcolo\' per vedere esattamente quali conti formano il totale.' 
        } 
      },
      { 
        element: '.dashboard-charts-bento', 
        popover: { 
          title: 'Grafici', 
          description: 'Aggiungi grafici a torta o a barre per avere una visione d\'insieme della composizione dei costi o della marginalità.' 
        } 
      },
      { 
        element: '.kpi-preset-grid', 
        popover: { 
          title: 'Configurazione KPI', 
          description: 'Scegli dei KPI predefiniti dalla libreria oppure usa la scheda "Con AI" per farti generare formule complesse semplicemente scrivendo cosa vuoi misurare.' 
        } 
      }
    ]
  });
  driverObj.drive();
}
