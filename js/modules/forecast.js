// ═══════════════════════════════════════════
// FORECAST — PE-Grade Levered Free Cash Flow Model
// ═══════════════════════════════════════════

import { store, CATEGORIES } from '../data/store.js';
import { computeAggregates } from '../utils/kpiEngine.js';
import { formatCurrency, formatPercent } from '../utils/formatters.js';
import { updateDOM } from '../utils/domHelpers.js';

let container;
let charts = {};

let eventsBound = false;

// Helper to parse Italian dates (DD/MM/YYYY or DD-MM-YYYY)
function parseDateLocal(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split(/[-/]/);
  if (parts.length === 3) {
    const [d, m, y] = parts;
    if (d && m && y) return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
  }
  const fallback = new Date(dateStr);
  return isNaN(fallback) ? null : fallback;
}

export function init(el) {
  container = el;
  const renderIfActive = () => {
    if (document.getElementById('page-forecast')?.classList.contains('active')) {
      render();
    }
  };
  store.on('trialBalance', renderIfActive);
  store.on('accountMapping', renderIfActive);
  store.on('forecastAssumptions', renderIfActive);
  store.on('forecastMonths', renderIfActive);
  store.on('openingBalances', renderIfActive);
}

export function render() {
  const tb = store.state.trialBalance;
  if (!tb || tb.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i data-lucide="trending-up" class="empty-state-icon" style="width:48px;height:48px;border:none;background:transparent;"></i>
        <h3 class="empty-state-title">Nessun dato disponibile</h3>
        <p class="empty-state-desc">Importa un bilancio per attivare la simulazione finanziaria.</p>
      </div>`;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  // Compute base aggregates
  const aggregates = computeAggregates(tb);
  const fd = computeForecastData(aggregates);
  const asm = store.state.forecastAssumptions;
  const activeTab = container.dataset.activeTab || 'pnl';

  const htmlString = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-6);">
      <div>
        <h2 style="font-size: var(--text-2xl); font-weight: 700; color: var(--text-primary); letter-spacing: -0.02em;">Modello LFCF & Scenari (PE-Grade)</h2>
        <p style="font-size: var(--text-sm); color: var(--text-secondary); margin-top: var(--space-1);">Simulazione a cascata del Levered Free Cash Flow con NWC completo e ammortamenti integrati.</p>
      </div>
      <button class="btn btn-outline btn-sm" id="btn-start-forecast-tour">
        <i data-lucide="help-circle" style="width:14px;height:14px;margin-right:6px;"></i> Tutorial Interattivo
      </button>
    </div>

    <!-- Forecast KPI Summary Row -->
    <div id="forecast-summary-row" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-4); margin-bottom: var(--space-6);">
      ${renderSummaryKPIs(fd)}
    </div>

    <!-- Main Layout Grid -->
    <div style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 3fr); gap: var(--space-6); align-items: start;">
      
      <!-- Left Panel: Assumptions Config -->
      <div class="card cash-flow-settings">
        <h3 style="font-size: var(--text-sm); font-weight: 600; margin-bottom: var(--space-3); color: var(--text-primary);"><i data-lucide="sliders" style="display:inline-block;vertical-align:text-bottom;width:16px;height:16px;"></i> Assumptions</h3>
        
        <div style="display: flex; gap: var(--space-1); margin-bottom: var(--space-4); border-bottom: 1px solid var(--glass-border); padding-bottom: 8px;">
          <button class="btn btn-sm btn-ghost fc-tab-btn ${activeTab === 'pnl' ? 'active' : ''}" data-tab="pnl" style="padding: 4px 8px; font-size: 12px;">P&L</button>
          <button class="btn btn-sm btn-ghost fc-tab-btn ${activeTab === 'nwc' ? 'active' : ''}" data-tab="nwc" style="padding: 4px 8px; font-size: 12px;">NWC</button>
          <button class="btn btn-sm btn-ghost fc-tab-btn ${activeTab === 'capex' ? 'active' : ''}" data-tab="capex" style="padding: 4px 8px; font-size: 12px;">Debt & Inv</button>
          <button class="btn btn-sm btn-ghost fc-tab-btn ${activeTab === 'scen' ? 'active' : ''}" data-tab="scen" style="padding: 4px 8px; font-size: 12px;">Scenari</button>
        </div>

        <div id="tab-pnl" class="fc-tab-content" style="display: ${activeTab === 'pnl' ? 'block' : 'none'};">
          <div class="form-group" style="margin-bottom: var(--space-3);">
            <label class="form-label">Crescita Ricavi (YoY %)</label>
            <input type="number" id="fc-growth" class="form-input" value="${asm.revenueGrowthYoY}" step="0.5">
          </div>
          <div class="form-group" style="margin-bottom: var(--space-3);">
            <label class="form-label">COGS Margin (%)</label>
            <div style="display:flex; align-items:center; gap:var(--space-2);">
              <input type="number" id="fc-cogs" class="form-input" value="${asm.cogsMarginBase}" step="0.5">
              <span style="font-size:var(--text-xs); color:var(--text-muted);">St: ${(fd.historicalMetrics.autoCogsMargin*100).toFixed(1)}%</span>
            </div>
          </div>
          <div class="form-group" style="margin-bottom: var(--space-3);">
            <label class="form-label">Opex Variabile (% Ricavi)</label>
            <input type="number" id="fc-opex-var" class="form-input" value="${asm.opexVariablePct}" step="0.5">
          </div>
          <div class="form-group" style="margin-bottom: var(--space-3);">
            <label class="form-label">Inflazione Opex Fisso (YoY %)</label>
            <input type="number" id="fc-opex-fix" class="form-input" value="${asm.opexFixedInflation}" step="0.5">
          </div>
        </div>

        <div id="tab-nwc" class="fc-tab-content" style="display: ${activeTab === 'nwc' ? 'block' : 'none'};">
          <p style="font-size:11px; color:var(--text-secondary); margin-bottom:12px;">Lascia vuoto per usare le medie storiche.</p>
          <div class="form-group" style="margin-bottom: var(--space-3);">
            <label class="form-label">DSO - Giorni Crediti</label>
            <input type="number" id="fc-dso" class="form-input" value="${asm.targetDso !== null ? asm.targetDso : ''}" placeholder="Storico: ${Math.round(fd.historicalMetrics.autoDso)}">
          </div>
          <div class="form-group" style="margin-bottom: var(--space-3);">
            <label class="form-label">DPO - Giorni Debiti</label>
            <input type="number" id="fc-dpo" class="form-input" value="${asm.targetDpo !== null ? asm.targetDpo : ''}" placeholder="Storico: ${Math.round(fd.historicalMetrics.autoDpo)}">
          </div>
          <div class="form-group" style="margin-bottom: var(--space-3);">
            <label class="form-label">DIO - Giorni Rimanenze</label>
            <input type="number" id="fc-dio" class="form-input" value="${asm.targetDio !== null ? asm.targetDio : ''}" placeholder="Storico: ${Math.round(fd.historicalMetrics.autoDio)}">
          </div>
        </div>

        <div id="tab-capex" class="fc-tab-content" style="display: ${activeTab === 'capex' ? 'block' : 'none'};">
          <div class="form-group" style="margin-bottom: var(--space-3);">
            <label class="form-label">CapEx Mensile (€)</label>
            <input type="number" id="fc-capex" class="form-input" value="${asm.capexMonthly}" step="1000">
          </div>
          <div class="form-group" style="margin-bottom: var(--space-3);">
            <label class="form-label">Vita Utile Ammortamenti (Anni)</label>
            <input type="number" id="fc-useful-life" class="form-input" value="${asm.usefulLifeYears}" step="1">
          </div>
          <div class="divider" style="margin: var(--space-3) 0;"></div>
          <div class="form-group" style="margin-bottom: var(--space-3);">
            <label class="form-label">Quota Capitale Mutui (€/mese)</label>
            <input type="number" id="fc-principal" class="form-input" value="${asm.monthlyPrincipal}" step="100">
          </div>
          <div class="form-group" style="margin-bottom: var(--space-3);">
            <label class="form-label">Oneri Finanziari (€/mese)</label>
            <input type="number" id="fc-interest" class="form-input" value="${asm.monthlyInterest}" step="100">
          </div>
          <div class="form-group" style="margin-bottom: var(--space-3);">
            <label class="form-label">Tax Rate (%)</label>
            <input type="number" id="fc-tax" class="form-input" value="${asm.taxRate}" step="1" max="100">
          </div>
        </div>

        <div id="tab-scen" class="fc-tab-content" style="display: ${activeTab === 'scen' ? 'block' : 'none'};">
           <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); margin-bottom: var(--space-3);">
            <div>
              <label class="form-label" style="font-size:10px;">Ottimistico (YoY +%)</label>
              <input type="number" id="fc-opt-rev" class="form-input" value="${asm.optRevenueMod}" step="1">
            </div>
            <div>
              <label class="form-label" style="font-size:10px;">Ottimistico (COGS +%)</label>
              <input type="number" id="fc-opt-margin" class="form-input" value="${asm.optMarginMod}" step="1">
            </div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); margin-bottom: var(--space-3);">
            <div>
              <label class="form-label" style="font-size:10px;">Pessimistico (YoY %)</label>
              <input type="number" id="fc-pes-rev" class="form-input" value="${asm.pesRevenueMod}" step="1">
            </div>
            <div>
              <label class="form-label" style="font-size:10px;">Pessimistico (COGS %)</label>
              <input type="number" id="fc-pes-margin" class="form-input" value="${asm.pesMarginMod}" step="1">
            </div>
          </div>
        </div>

        <div class="divider" style="margin: var(--space-4) 0;"></div>

        <h3 style="font-size: var(--text-sm); font-weight: 600; margin-bottom: var(--space-2); color: var(--text-primary);">Orizzonte Temporale</h3>
        <div style="display: flex; gap: var(--space-2); flex-wrap: wrap;">
          <button class="btn btn-sm forecast-months-btn ${(store.state.forecastMonths || 6) === 3 ? 'btn-primary' : 'btn-ghost'}" data-months="3">3m</button>
          <button class="btn btn-sm forecast-months-btn ${(store.state.forecastMonths || 6) === 6 ? 'btn-primary' : 'btn-ghost'}" data-months="6">6m</button>
          <button class="btn btn-sm forecast-months-btn ${(store.state.forecastMonths || 6) === 12 ? 'btn-primary' : 'btn-ghost'}" data-months="12">12m</button>
          <button class="btn btn-sm forecast-months-btn ${(store.state.forecastMonths || 6) === 24 ? 'btn-primary' : 'btn-ghost'}" data-months="24">24m</button>
          <button class="btn btn-sm forecast-months-btn ${(store.state.forecastMonths || 6) === 36 ? 'btn-primary' : 'btn-ghost'}" data-months="36">3y</button>
          <button class="btn btn-sm forecast-months-btn ${(store.state.forecastMonths || 6) === 60 ? 'btn-primary' : 'btn-ghost'}" data-months="60">5y</button>
        </div>
      </div>

      <!-- Right Panel: Charts & Tables -->
      <div style="display: flex; flex-direction: column; gap: var(--space-6);">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Sensibility Analysis: Saldo Cassa Proiettato</h3>
          </div>
          <div class="cash-flow-chart-wrapper" style="position: relative; height: 320px; width: 100%;">
            <canvas id="scenario-forecast-chart"></canvas>
          </div>
        </div>

        <div class="card" id="forecast-matrix-card">
          <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
            <h3 class="card-title">Matrice Finanziaria</h3>
            <select id="fc-scenario-select" class="form-input" style="width: auto; padding: 4px 8px; font-size: 12px;">
              <option value="base" ${container.dataset.activeScenario === 'base' || !container.dataset.activeScenario ? 'selected' : ''}>Base Case</option>
              <option value="opt" ${container.dataset.activeScenario === 'opt' ? 'selected' : ''}>Ottimistico</option>
              <option value="pes" ${container.dataset.activeScenario === 'pes' ? 'selected' : ''}>Pessimistico</option>
            </select>
          </div>
          <div style="overflow-x: auto;">
            ${renderPnlMatrix(fd[container.dataset.activeScenario + 'Scenario'] || fd.baseScenario, fd.labels)}
          </div>
        </div>
      </div>
    </div>
  `;

  updateDOM(container, htmlString);
  bindEvents();
  
  // Render chart
  setTimeout(() => {
    renderScenarioChart(fd);
  }, 50);

  if (window.lucide) window.lucide.createIcons();
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  container.addEventListener('click', (e) => {
    if (e.target.closest('#btn-start-forecast-tour')) {
      startTour();
      return;
    }

    const btnTab = e.target.closest('.fc-tab-btn');
    if (btnTab) {
      container.dataset.activeTab = btnTab.dataset.tab;
      render();
      return;
    }

    const btnMonths = e.target.closest('.forecast-months-btn');
    if (btnMonths) {
      const months = parseInt(btnMonths.dataset.months, 10);
      store.setForecastMonths(months);
    }
  });

  container.addEventListener('change', (e) => {
    if (e.target.id === 'fc-scenario-select') {
      container.dataset.activeScenario = e.target.value;
      render();
    }
  });

  container.addEventListener('input', (e) => {
    const idMap = {
      'fc-growth': 'revenueGrowthYoY',
      'fc-cogs': 'cogsMarginBase',
      'fc-opex-var': 'opexVariablePct',
      'fc-opex-fix': 'opexFixedInflation',
      'fc-capex': 'capexMonthly',
      'fc-useful-life': 'usefulLifeYears',
      'fc-principal': 'monthlyPrincipal',
      'fc-interest': 'monthlyInterest',
      'fc-tax': 'taxRate',
      'fc-opt-rev': 'optRevenueMod',
      'fc-opt-margin': 'optMarginMod',
      'fc-pes-rev': 'pesRevenueMod',
      'fc-pes-margin': 'pesMarginMod'
    };
    
    if (idMap[e.target.id]) {
      const val = parseFloat(e.target.value) || 0;
      clearTimeout(e.target._timeout);
      e.target._timeout = setTimeout(() => {
        store.setForecastAssumption(idMap[e.target.id], val);
      }, 300);
    }

    // Special handling for NWC inputs (can be null/empty)
    const nwcMap = { 'fc-dso': 'targetDso', 'fc-dpo': 'targetDpo', 'fc-dio': 'targetDio' };
    if (nwcMap[e.target.id]) {
      const val = e.target.value === '' ? null : parseFloat(e.target.value);
      clearTimeout(e.target._timeout);
      e.target._timeout = setTimeout(() => {
        store.setForecastAssumption(nwcMap[e.target.id], val);
      }, 300);
    }
  });
}

function computeForecastData(aggregates) {
  const tb = store.state.trialBalance;
  const forecastMonths = store.state.forecastMonths || 6;
  const assumptions = store.state.forecastAssumptions;

  // 1. Calculate Historical Months
  let historicalMonths = 1;
  let minDate = null, maxDate = null;
  if (tb && tb.length > 0) {
    tb.forEach(row => {
      const d = parseDateLocal(row.date);
      if (d && !isNaN(d)) {
        if (!minDate || d < minDate) minDate = d;
        if (!maxDate || d > maxDate) maxDate = d;
      }
    });
    if (minDate && maxDate && minDate <= maxDate) {
      const diffDays = Math.ceil(Math.abs(maxDate - minDate) / (1000 * 60 * 60 * 24));
      historicalMonths = Math.max(1, Math.round(diffDays / 30));
    }
  }

  // 2. Historical Averages
  const currentCash = aggregates.cassa || 0;
  const avgMonthlyRev = aggregates.ricavi / historicalMonths;
  const avgMonthlyCogs = aggregates.costoVenduto / historicalMonths;
  const avgMonthlyOpex = aggregates.costiOperativi / historicalMonths;
  const avgMonthlyDa = aggregates.ammortamenti / historicalMonths;
  
  const crediti = aggregates.crediti || 0;
  const debiti = aggregates.debiti || 0;
  const rimanenze = aggregates.rimanenze || 0;
  
  const autoCogsMargin = avgMonthlyRev > 0 ? (avgMonthlyCogs / avgMonthlyRev) : 0;
  const autoDso = avgMonthlyRev > 0 ? (crediti / avgMonthlyRev) * 30 : 30;
  const autoDpo = avgMonthlyCogs > 0 ? (debiti / avgMonthlyCogs) * 30 : 30;
  const autoDio = avgMonthlyCogs > 0 ? (rimanenze / avgMonthlyCogs) * 30 : 30;

  const historicalMetrics = {
    avgMonthlyRev, avgMonthlyCogs, avgMonthlyOpex, avgMonthlyDa,
    autoCogsMargin, autoDso, autoDpo, autoDio, crediti, debiti, rimanenze
  };

  // 3. Define Scenarios
  const baseDef = {
    growthYoY: (assumptions.revenueGrowthYoY || 0) / 100,
    cogsMargin: (assumptions.cogsMarginBase || 0) / 100,
    opexVarPct: (assumptions.opexVariablePct || 0) / 100,
    opexFixInf: (assumptions.opexFixedInflation || 0) / 100,
    capex: assumptions.capexMonthly || 0,
    usefulLife: assumptions.usefulLifeYears || 5,
    principal: assumptions.monthlyPrincipal || 0,
    interest: assumptions.monthlyInterest || 0,
    taxRate: (assumptions.taxRate || 0) / 100,
    dso: assumptions.targetDso !== null ? assumptions.targetDso : autoDso,
    dpo: assumptions.targetDpo !== null ? assumptions.targetDpo : autoDpo,
    dio: assumptions.targetDio !== null ? assumptions.targetDio : autoDio,
  };

  const optDef = {
    ...baseDef,
    growthYoY: baseDef.growthYoY + ((assumptions.optRevenueMod || 0) / 100),
    cogsMargin: Math.max(0, baseDef.cogsMargin + ((assumptions.optMarginMod || 0) / 100))
  };

  const pesDef = {
    ...baseDef,
    growthYoY: baseDef.growthYoY + ((assumptions.pesRevenueMod || 0) / 100),
    cogsMargin: Math.min(1, baseDef.cogsMargin + ((assumptions.pesMarginMod || 0) / 100))
  };

  // 4. Simulate
  const labels = [];
  for (let i = 1; i <= forecastMonths; i++) labels.push('Mese ' + i);

  const simulate = (scenDef) => {
    let cash = currentCash;
    let prevNwc = crediti + rimanenze - debiti;
    let lastRev = avgMonthlyRev;
    let baseOpexFixed = avgMonthlyOpex; 
    let accumulatedDa = 0; 
    
    let table = [];
    let cashPoints = [currentCash];

    for (let i = 1; i <= forecastMonths; i++) {
      let monthlyGrowth = Math.pow(1 + scenDef.growthYoY, 1/12) - 1;
      let rev = lastRev * (1 + monthlyGrowth);
      
      let cogs = rev * scenDef.cogsMargin;
      let gp = rev - cogs;
      
      let monthlyInflation = Math.pow(1 + scenDef.opexFixInf, 1/12) - 1;
      baseOpexFixed = baseOpexFixed * (1 + monthlyInflation);
      let opexVar = rev * scenDef.opexVarPct;
      let opex = baseOpexFixed + opexVar;
      
      let ebitda = gp - opex;
      
      accumulatedDa += (scenDef.capex / (scenDef.usefulLife * 12));
      let da = avgMonthlyDa + accumulatedDa;
      let ebit = ebitda - da;
      
      // Transition NWC
      let transitionFactor = Math.min(i / 12, 1);
      let currDso = autoDso + (scenDef.dso - autoDso) * transitionFactor;
      let currDpo = autoDpo + (scenDef.dpo - autoDpo) * transitionFactor;
      let currDio = autoDio + (scenDef.dio - autoDio) * transitionFactor;
      
      let currCrediti = rev * (currDso / 30);
      let currDebiti = cogs * (currDpo / 30);
      let currRimanenze = cogs * (currDio / 30);
      
      let currNwc = currCrediti + currRimanenze - currDebiti;
      let nwcChange = currNwc - prevNwc; 
      
      let ebt = ebit - scenDef.interest;
      let taxes = ebt > 0 ? ebt * scenDef.taxRate : 0;
      let netIncome = ebt - taxes;
      
      // UFCF = NOPAT + D&A - NWC Change - CapEx
      let nopat = ebit > 0 ? ebit * (1 - scenDef.taxRate) : ebit;
      let ufcf = nopat + da - nwcChange - scenDef.capex;
      
      // LFCF = Net Income + D&A - NWC Change - CapEx - Principal
      let lfcf = netIncome + da - nwcChange - scenDef.capex - scenDef.principal;
      
      cash += lfcf;

      table.push({ 
        rev, cogs, gp, opex, ebitda, da, ebit, 
        interest: scenDef.interest, ebt, taxes, netIncome, 
        nwcChange, capex: scenDef.capex, principal: scenDef.principal, 
        ufcf, lfcf, cash 
      });
      cashPoints.push(cash);

      lastRev = rev;
      prevNwc = currNwc;
    }
    return { cashPoints, table };
  };

  return {
    historicalMetrics,
    labels: ['Oggi', ...labels],
    currentCash,
    baseScenario: simulate(baseDef),
    optScenario: simulate(optDef),
    pesScenario: simulate(pesDef)
  };
}

function renderSummaryKPIs(fd) {
  const baseTN = fd.baseScenario.table[fd.baseScenario.table.length - 1];
  const avgUfcf = fd.baseScenario.table.reduce((sum, m) => sum + m.ufcf, 0) / fd.baseScenario.table.length;
  const avgLfcf = fd.baseScenario.table.reduce((sum, m) => sum + m.lfcf, 0) / fd.baseScenario.table.length;

  return `
    <div class="card" style="padding: var(--space-4);">
      <div style="font-size: var(--text-xs); font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--space-1);">Target NWC (DSO/DPO/DIO)</div>
      <div style="font-size: var(--text-2xl); font-weight: 700; color: var(--text-primary);">${store.state.forecastAssumptions.targetDso || Math.round(fd.historicalMetrics.autoDso)}/${store.state.forecastAssumptions.targetDpo || Math.round(fd.historicalMetrics.autoDpo)}/${store.state.forecastAssumptions.targetDio || Math.round(fd.historicalMetrics.autoDio)}</div>
      <div style="font-size: var(--text-xs); color: var(--text-muted); margin-top: 4px;">Giorni stimati a regime</div>
    </div>
    <div class="card" style="padding: var(--space-4);">
      <div style="font-size: var(--text-xs); font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--space-1);">Media Mensile UFCF</div>
      <div style="font-size: var(--text-2xl); font-weight: 700; color: var(--primary-500);">${formatCurrency(avgUfcf)}</div>
      <div style="font-size: var(--text-xs); color: var(--text-muted); margin-top: 4px;">Unlevered FCF (operativo)</div>
    </div>
    <div class="card" style="padding: var(--space-4);">
      <div style="font-size: var(--text-xs); font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--space-1);">Media Mensile LFCF</div>
      <div style="font-size: var(--text-2xl); font-weight: 700; color: ${avgLfcf >= 0 ? 'var(--success-500)' : 'var(--danger-500)'};">${formatCurrency(avgLfcf)}</div>
      <div style="font-size: var(--text-xs); color: var(--text-muted); margin-top: 4px;">Levered FCF (post debito)</div>
    </div>
    <div class="card" style="padding: var(--space-4);">
      <div style="font-size: var(--text-xs); font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--space-1);">Cassa Finale Proiettata</div>
      <div style="font-size: var(--text-2xl); font-weight: 700; color: var(--text-primary);">${formatCurrency(baseTN ? baseTN.cash : 0)}</div>
      <div style="font-size: var(--text-xs); color: var(--text-muted); margin-top: 4px;">Alla fine del periodo (Base Case)</div>
    </div>
  `;
}

function renderPnlMatrix(scenario, labels) {
  if (!scenario || scenario.table.length === 0) return '';
  const months = labels.slice(1);
  
  const rRow = (label, key, isBold, isTotal, colorClassFn) => {
    let html = `<tr style="${isBold ? 'font-weight:600; background:var(--bg-surface);' : ''} ${isTotal ? 'border-top: 2px solid var(--glass-border);' : 'border-bottom: 1px solid var(--glass-border);'}">`;
    html += `<td style="padding: 8px 12px; min-width: 150px; position: sticky; left: 0; background: ${isBold ? 'var(--bg-surface)' : 'var(--bg-base)'};">${label}</td>`;
    scenario.table.forEach(m => {
      let color = colorClassFn ? colorClassFn(m[key]) : '';
      html += `<td style="padding: 8px 12px; text-align: right; font-family: var(--font-mono); font-size: 13px; ${color}">${formatCurrency(m[key])}</td>`;
    });
    html += `</tr>`;
    return html;
  };

  const posNegColor = (val) => val >= 0 ? 'color: var(--success-500);' : 'color: var(--danger-500);';
  const invPosNegColor = (val) => val <= 0 ? 'color: var(--success-500);' : 'color: var(--danger-500);'; // negative nwcChange means cash IN

  return `
    <table style="width: 100%; border-collapse: collapse; font-size: var(--text-sm);">
      <thead>
        <tr>
          <th style="text-align: left; padding: 8px 12px; background: var(--bg-surface); position: sticky; left: 0; z-index: 2;">Voce</th>
          ${months.map(m => `<th style="text-align: right; padding: 8px 12px; background: var(--bg-surface); color: var(--text-secondary);">${m}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rRow('Ricavi', 'rev', false, false)}
        ${rRow('COGS', 'cogs', false, false)}
        ${rRow('Gross Profit', 'gp', true, false)}
        ${rRow('Opex', 'opex', false, false)}
        ${rRow('EBITDA', 'ebitda', true, false)}
        ${rRow('D&A', 'da', false, false)}
        ${rRow('EBIT', 'ebit', true, false)}
        ${rRow('Oneri Finanziari', 'interest', false, false)}
        ${rRow('EBT', 'ebt', true, false)}
        ${rRow('Taxes', 'taxes', false, false)}
        ${rRow('Net Income', 'netIncome', true, false)}
        ${rRow('+ D&A', 'da', false, false)}
        ${rRow('- Δ NWC', 'nwcChange', false, false, invPosNegColor)}
        ${rRow('- CapEx', 'capex', false, false)}
        ${rRow('Unlevered FCF', 'ufcf', true, true, posNegColor)}
        ${rRow('- Quota Capitale', 'principal', false, false)}
        ${rRow('Levered FCF', 'lfcf', true, true, posNegColor)}
        ${rRow('Cash Balance', 'cash', true, false)}
      </tbody>
    </table>
  `;
}

function renderScenarioChart(fd) {
  if (!window.Chart) return;
  const canvas = document.getElementById('scenario-forecast-chart');
  if (!canvas) return;

  if (charts['scenarioChart']) {
    charts['scenarioChart'].destroy();
  }

  const datasets = [
    {
      label: 'Scenario Ottimistico',
      data: fd.optScenario.cashPoints,
      borderColor: '#10b981',
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderDash: [5, 5],
      tension: 0.1,
      pointRadius: 3,
    },
    {
      label: 'Base Case',
      data: fd.baseScenario.cashPoints,
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      borderWidth: 3,
      fill: true,
      tension: 0.1,
      pointRadius: 4,
    },
    {
      label: 'Scenario Pessimistico',
      data: fd.pesScenario.cashPoints,
      borderColor: '#f43f5e',
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderDash: [5, 5],
      tension: 0.1,
      pointRadius: 3,
    }
  ];

  charts['scenarioChart'] = new Chart(canvas, {
    type: 'line',
    data: { labels: fd.labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'top', labels: { usePointStyle: true, boxWidth: 8 } },
        tooltip: { callbacks: { label: (ctx) => ctx.dataset.label + ': ' + formatCurrency(ctx.parsed.y) } }
      },
      scales: {
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            callback: (v) => {
              if (Math.abs(v) >= 1000000) return (v / 1000000).toFixed(1) + 'M';
              if (Math.abs(v) >= 1000) return (v / 1000).toFixed(0) + 'k';
              return formatCurrency(v);
            }
          }
        },
        x: { grid: { display: false } }
      }
    }
  });
}

function startTour() {
  if (!window.driver) return;
  const driverObj = window.driver.js.driver({
    showProgress: true,
    steps: [
      { popover: { title: 'Modello PE-Grade', description: 'Benvenuto nel nuovo simulatore LFCF completo di dinamiche NWC e Debt.' } },
      { element: '#forecast-summary-row', popover: { title: 'KPI Sintetici', description: 'Trovi qui i target di capitale circolante (DSO/DPO/DIO) e i flussi di cassa medi Unlevered e Levered.' } },
      { element: '.cash-flow-settings', popover: { title: 'Assumptions a Schede', description: 'Naviga tra P&L, NWC, e Debito/Investimenti per personalizzare il forecast.' } },
      { element: '#scenario-forecast-chart', popover: { title: 'Grafico Scenari', description: 'Visualizza il saldo cassa proiettato.' } },
      { element: '#forecast-matrix-card', popover: { title: 'Matrice Finanziaria', description: 'Usa la tendina in alto a destra per esplorare lo scenario base, ottimistico e pessimistico con dettagli completi.' } }
    ]
  });
  driverObj.drive();
}
