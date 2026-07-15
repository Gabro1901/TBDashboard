// ═══════════════════════════════════════════
// CASH FLOW — Rendiconto Finanziario (Metodo Indiretto)
// ═══════════════════════════════════════════

import { store, CATEGORIES } from '../data/store.js';
import { formatCurrency } from '../utils/formatters.js';
import { aggregateByGLAccount } from '../utils/accountHelpers.js';
import { aiFixCashFlow } from '../utils/aiService.js';
import { showToast } from '../utils/toast.js';
import { updateDOM } from '../utils/domHelpers.js';

let container;
let expandedSections = { A: true, B: true, C: true };
let eventsBound = false;
let latestRenderData = null;

export function init(el) {
  container = el;
}

export function render() {
  const tb = store.state.trialBalance;
  const mapping = store.state.accountMapping;
  const openBal = store.state.openingBalances;

  if (tb.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i data-lucide="coins" class="empty-state-icon" style="width:48px;height:48px;border:none;background:transparent;"></i>
        <h3 class="empty-state-title">Nessun dato disponibile</h3>
        <p class="empty-state-desc">Inserisci prima il bilancio di verifica nella sezione Input.</p>
      </div>`;
    return;
  }

  if (openBal.length === 0) {
    container.innerHTML = `
      <div class="opening-notice">
        <i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:6px;"></i> Per calcolare il Rendiconto Finanziario con metodo indiretto sono necessari i <strong>saldi iniziali</strong>. Inseriscili nella sezione "Saldi Iniziali".
      </div>
      <div class="empty-state">
        <i data-lucide="coins" class="empty-state-icon" style="width:48px;height:48px;border:none;background:transparent;"></i>
        <h3 class="empty-state-title">Saldi iniziali mancanti</h3>
        <p class="empty-state-desc">Il rendiconto finanziario con metodo indiretto calcola le variazioni tra saldi iniziali e finali dei conti patrimoniali.</p>
      </div>`;
    return;
  }

  // Compute values
  const result = computeCashFlow(tb, mapping, openBal);

  const htmlString = `
    <div class="financial-document">
      <div class="doc-title-bar">
        <div class="doc-title">
          <div class="doc-title-icon rf"><i data-lucide="coins"></i></div>
          <div>
            <div>Rendiconto Finanziario</div>
            <div style="font-size: var(--text-sm); font-weight: 400; color: var(--text-secondary);">Metodo Indiretto${store.state.settings.companyName ? ' — ' + store.state.settings.companyName : ''}</div>
          </div>
        </div>
        <div style="display: flex; gap: var(--space-3); align-items: center;">
          <button class="btn btn-outline btn-sm no-print" id="btn-start-cf-tour">
            <i data-lucide="help-circle" style="width:14px;height:14px;margin-right:6px;"></i> Tutorial
          </button>
          <button class="btn btn-secondary btn-sm no-print" onclick="window.print()"><i data-lucide="printer" style="width:14px;height:14px;margin-right:6px;"></i> Stampa</button>
        </div>
      </div>

      <div class="data-table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>Voce</th>
              <th style="text-align: right; width: 180px;">Importo</th>
            </tr>
          </thead>
          <tbody>
            <!-- Attività Operativa -->
            <tr class="section-header" style="cursor:pointer;" data-section="A">
              <td colspan="2">
                <div style="display:flex; justify-content:space-between;">
                  <span>${expandedSections.A ? '▼' : '▶'} A) FLUSSO DI CASSA DA ATTIVITÀ OPERATIVA</span>
                  <span>${formatCurrency(result.operatingCashFlow)}</span>
                </div>
              </td>
            </tr>

            ${expandedSections.A ? `
            <tr>
              <td style="padding-left: var(--space-6);">Utile (Perdita) netto dell'esercizio</td>
              <td class="amount ${result.utileNetto >= 0 ? 'positive' : 'negative'}">${formatCurrency(result.utileNetto)}</td>
            </tr>

            <tr><td colspan="2" style="padding-left: var(--space-6); color: var(--text-secondary); font-weight: 500; font-size: var(--text-xs); text-transform: uppercase;">Rettifiche per elementi non monetari</td></tr>

            <tr>
              <td style="padding-left: var(--space-8);">+ Ammortamenti e svalutazioni</td>
              <td class="amount positive">${formatCurrency(result.ammortamenti)}</td>
            </tr>

            ${result.varTFR !== 0 ? `
            <tr>
              <td style="padding-left: var(--space-8);">± Variazione TFR e fondi</td>
              <td class="amount ${result.varTFR >= 0 ? 'positive' : 'negative'}">${formatCurrency(result.varTFR)}</td>
            </tr>` : ''}

            <tr><td colspan="2" style="padding-left: var(--space-6); color: var(--text-secondary); font-weight: 500; font-size: var(--text-xs); text-transform: uppercase;">Variazioni del capitale circolante</td></tr>

            ${result.workingCapitalItems.map(item => `
            <tr>
              <td style="padding-left: var(--space-8);">${item.label}</td>
              <td class="amount ${item.value >= 0 ? 'positive' : 'negative'}">${formatCurrency(item.value)}</td>
            </tr>`).join('')}
            ` : ''}

            <tr class="total-row" style="background: rgba(20, 184, 166, 0.05);">
              <td><strong>Flusso netto da attività operativa</strong></td>
              <td class="amount ${result.operatingCashFlow >= 0 ? 'positive' : 'negative'}" style="font-size: var(--text-md);">${formatCurrency(result.operatingCashFlow)}</td>
            </tr>

            <!-- Attività di Investimento -->
            <tr class="section-header" style="cursor:pointer;" data-section="B">
              <td colspan="2">
                <div style="display:flex; justify-content:space-between;">
                  <span>${expandedSections.B ? '▼' : '▶'} B) FLUSSO DI CASSA DA ATTIVITÀ DI INVESTIMENTO</span>
                  <span>${formatCurrency(result.investingCashFlow)}</span>
                </div>
              </td>
            </tr>

            ${expandedSections.B ? `
            ${result.investingItems.map(item => `
            <tr>
              <td style="padding-left: var(--space-8);">${item.label}</td>
              <td class="amount ${item.value >= 0 ? 'positive' : 'negative'}">${formatCurrency(item.value)}</td>
            </tr>`).join('')}

            ${result.investingItems.length === 0 ? `
            <tr><td style="padding-left: var(--space-8);" class="text-muted">Nessuna variazione rilevata</td><td class="amount">€ 0,00</td></tr>` : ''}
            ` : ''}

            <tr class="total-row" style="background: rgba(99, 102, 241, 0.05);">
              <td><strong>Flusso netto da attività di investimento</strong></td>
              <td class="amount ${result.investingCashFlow >= 0 ? 'positive' : 'negative'}" style="font-size: var(--text-md);">${formatCurrency(result.investingCashFlow)}</td>
            </tr>

            <!-- Attività Finanziaria -->
            <tr class="section-header" style="cursor:pointer;" data-section="C">
              <td colspan="2">
                <div style="display:flex; justify-content:space-between;">
                  <span>${expandedSections.C ? '▼' : '▶'} C) FLUSSO DI CASSA DA ATTIVITÀ FINANZIARIA</span>
                  <span>${formatCurrency(result.financingCashFlow)}</span>
                </div>
              </td>
            </tr>

            ${expandedSections.C ? `
            ${result.financingItems.map(item => `
            <tr>
              <td style="padding-left: var(--space-8);">${item.label}</td>
              <td class="amount ${item.value >= 0 ? 'positive' : 'negative'}">${formatCurrency(item.value)}</td>
            </tr>`).join('')}

            ${result.financingItems.length === 0 ? `
            <tr><td style="padding-left: var(--space-8);" class="text-muted">Nessuna variazione rilevata</td><td class="amount">€ 0,00</td></tr>` : ''}
            ` : ''}

            <tr class="total-row" style="background: rgba(245, 158, 11, 0.05);">
              <td><strong>Flusso netto da attività finanziaria</strong></td>
              <td class="amount ${result.financingCashFlow >= 0 ? 'positive' : 'negative'}" style="font-size: var(--text-md);">${formatCurrency(result.financingCashFlow)}</td>
            </tr>

            <!-- Riepilogo -->
            <tr class="section-header"><td colspan="2">RIEPILOGO</td></tr>

            <tr class="total-row" style="background: ${result.netCashFlow >= 0 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(244, 63, 94, 0.08)'};">
              <td><strong>VARIAZIONE NETTA DELLA LIQUIDITÀ (A+B+C)</strong></td>
              <td class="amount ${result.netCashFlow >= 0 ? 'positive' : 'negative'}" style="font-size: var(--text-lg);">${formatCurrency(result.netCashFlow)}</td>
            </tr>

            <tr>
              <td style="padding-left: var(--space-6);">Disponibilità liquide iniziali</td>
              <td class="amount">${formatCurrency(result.openingCash)}</td>
            </tr>

            <tr class="total-row">
              <td><strong>DISPONIBILITÀ LIQUIDE FINALI</strong></td>
              <td class="amount ${(result.openingCash + result.netCashFlow) >= 0 ? 'positive' : 'negative'}" style="font-size: var(--text-lg);">${formatCurrency(result.openingCash + result.netCashFlow)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="cash-flow-check ${result.isCashFlowCorrect ? 'success' : 'warning'}" style="margin-top: var(--space-6); padding: var(--space-4); border-radius: var(--radius-md); background: ${result.isCashFlowCorrect ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)'}; border: 1px solid ${result.isCashFlowCorrect ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)'};">
        <div style="display: flex; align-items: center; gap: var(--space-2); font-weight: 600; color: ${result.isCashFlowCorrect ? 'var(--success-600)' : 'var(--danger-600)'}; margin-bottom: var(--space-2);">
          <i data-lucide="${result.isCashFlowCorrect ? 'check-circle-2' : 'alert-circle'}" style="width: 20px; height: 20px;"></i> 
          Verifica Quadratura Rendiconto
        </div>
        ${result.isCashFlowCorrect ? `
          <p style="font-size: var(--text-sm); color: var(--text-secondary);">Il rendiconto è bilanciato. La variazione calcolata (${formatCurrency(result.netCashFlow)}) corrisponde esattamente alla variazione reale della liquidità.</p>
        ` : `
          <p style="font-size: var(--text-sm); color: var(--text-secondary);">Attenzione: il rendiconto presenta una squadratura.</p>
          <ul style="font-size: var(--text-sm); color: var(--text-secondary); margin-top: var(--space-2); margin-bottom: var(--space-2); margin-left: var(--space-4);">
            <li>Variazione calcolata (Metodo Indiretto): <strong>${formatCurrency(result.netCashFlow)}</strong></li>
            <li>Variazione reale (Cassa Finale - Cassa Iniziale): <strong>${formatCurrency(result.directCashFlow)}</strong></li>
            <li>Differenza da giustificare: <strong>${formatCurrency(result.cashFlowDiff)}</strong></li>
          </ul>
          <p style="font-size: var(--text-xs); color: var(--text-muted); margin-top: var(--space-2);">Controlla che tutti i conti patrimoniali siano mappati correttamente e che i saldi iniziali inseriti siano quadrati.</p>
          
          <div style="margin-top: var(--space-4); border-top: 1px solid rgba(244, 63, 94, 0.2); padding-top: var(--space-4);">
            <h4 style="font-size: var(--text-sm); font-weight: 600; margin-bottom: var(--space-3); color: var(--text-primary);">Dettaglio Cause e Soluzioni</h4>
            
            ${result.diagnosticData.openingGap > 0.01 ? `
            <div style="margin-bottom: var(--space-2); padding: var(--space-3); background: rgba(245, 158, 11, 0.1); border-left: 3px solid var(--warning-500); border-radius: 0 var(--radius-sm) var(--radius-sm) 0;">
              <strong style="color: var(--text-primary);">1. Saldi Iniziali Sbilanciati (${formatCurrency(result.diagnosticData.openingGap)}):</strong> <span style="color: var(--text-secondary);">Il totale delle Attività non coincide con Passività + Patrimonio Netto nei saldi d'apertura. Controlla la sezione Saldi Iniziali.</span>
            </div>` : ''}

            ${result.diagnosticData.closingGap > 0.01 ? `
            <div style="margin-bottom: var(--space-2); padding: var(--space-3); background: rgba(244, 63, 94, 0.1); border-left: 3px solid var(--danger-500); border-radius: 0 var(--radius-sm) var(--radius-sm) 0;">
              <strong style="color: var(--text-primary);">2. Bilancio Finale Sbilanciato / Errori di Mappatura (${formatCurrency(result.diagnosticData.closingGap)}):</strong> <span style="color: var(--text-secondary);">Ci sono discrepanze tra Attività e Passività/Netto. Probabilmente ci sono conti patrimoniali non mappati o mappati come costi/ricavi (o viceversa).</span>
            </div>` : ''}

            ${result.diagnosticData.unmappedAccounts.length > 0 ? `
            <div style="margin-bottom: var(--space-2); padding: var(--space-3); background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
              <strong style="color: var(--text-primary);">Conti Non Classificati:</strong>
              <ul style="margin-top: var(--space-2); margin-left: var(--space-4); font-size: var(--text-xs); color: var(--text-secondary);">
                ${result.diagnosticData.unmappedAccounts.slice(0, 5).map(a => `<li>${a.name} (${formatCurrency(a.amount)})</li>`).join('')}
                ${result.diagnosticData.unmappedAccounts.length > 5 ? `<li>...e altri ${result.diagnosticData.unmappedAccounts.length - 5} conti</li>` : ''}
              </ul>
            </div>` : ''}

            ${result.diagnosticData.omittedVariations.length > 0 ? `
            <div style="margin-bottom: var(--space-3); padding: var(--space-3); background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
              <strong style="color: var(--text-primary);">Variazioni Omesse (es. saldi iniziali mancanti):</strong>
              <ul style="margin-top: var(--space-2); margin-left: var(--space-4); font-size: var(--text-xs); color: var(--text-secondary);">
                ${result.diagnosticData.omittedVariations.slice(0, 5).map(a => `<li>${a.name}: ${a.reason}</li>`).join('')}
                ${result.diagnosticData.omittedVariations.length > 5 ? `<li>...e altri ${result.diagnosticData.omittedVariations.length - 5} conti</li>` : ''}
              </ul>
            </div>` : ''}

            ${(result.diagnosticData.closingGap > 0.01 || result.diagnosticData.unmappedAccounts.length > 0) ? `
            <div style="margin-top: var(--space-4);">
              <button id="btn-ai-fix-cashflow" class="btn btn-primary" style="width: 100%; justify-content: center;">
                <i data-lucide="sparkles" style="width: 14px; height: 14px; margin-right: 6px;"></i> Risolvi Mappature con l'IA
              </button>
              <div id="ai-fix-loading" style="display: none; text-align: center; margin-top: var(--space-3); font-size: var(--text-sm); color: var(--text-secondary);">
                <i data-lucide="loader-2" class="spin" style="width: 16px; height: 16px; display: inline-block; vertical-align: middle; margin-right: 6px;"></i> L'IA sta analizzando le discrepanze contabili...
              </div>
            </div>
            ` : ''}
          </div>
        `}
      </div>

    </div>
  `;

  updateDOM(container, htmlString);
  bindEvents(result, tb, mapping);

  if (window.lucide) window.lucide.createIcons();
  if (window.refreshIcons) window.refreshIcons();
}

function bindEvents(result, tb, mapping) {
  latestRenderData = { result, tb, mapping };
  if (eventsBound) return;
  eventsBound = true;

  container.addEventListener('click', async (e) => {
    // Tutorial
    if (e.target.closest('#btn-start-cf-tour')) {
      startTour();
      return;
    }

    // Section Header toggle
    const sectionHeader = e.target.closest('.section-header');
    if (sectionHeader) {
      const sec = sectionHeader.dataset.section;
      if (sec) {
        expandedSections[sec] = !expandedSections[sec];
        render();
      }
      return;
    }

    // AI Fix Button
    const btnAiFix = e.target.closest('#btn-ai-fix-cashflow');
    if (btnAiFix) {
      const { result, tb, mapping } = latestRenderData;
      const loading = container.querySelector('#ai-fix-loading');
      btnAiFix.style.display = 'none';
      if (loading) loading.style.display = 'block';
      
      try {
        const { mapping: newMapping } = await aiFixCashFlow(result.diagnosticData, tb, mapping);
        store.setBulkAccountMapping(newMapping);
        showToast("Mappature corrette dall'IA. Rendiconto aggiornato.", 'success');
      } catch (err) {
        showToast(err.message, 'error');
        btnAiFix.style.display = 'flex';
        if (loading) loading.style.display = 'none';
      }
      return;
    }
  });
}

function computeCashFlow(tb, mapping, openBal) {
  const aggregatedTb = aggregateByGLAccount(tb);

  // Helper: sum current amounts for a category
  const sumCurrent = (catId) => {
    let s = 0;
    for (const e of tb) {
      const key = e.glAccount || e.name;
      if (mapping[key] === catId) s += e.amount;
    }
    return s;
  };

  // Helper: sum opening balances for a category
  const sumOpening = (catId) => {
    let s = 0;
    for (const e of openBal) {
      const key = e.glAccount || e.name;
      if (mapping[key] === catId) s += e.amount;
    }
    return s;
  };

  // Income statement aggregates
  const revenueAmt = Math.abs(sumCurrent('REVENUE')) + Math.abs(sumCurrent('OTHER_INCOME'));
  const cogsAmt = Math.abs(sumCurrent('COGS'));
  const opexAmt = Math.abs(sumCurrent('OPERATING_EXPENSES'));
  const otherExpAmt = Math.abs(sumCurrent('OTHER_EXPENSES'));
  const ammortamenti = Math.abs(sumCurrent('DEPRECIATION'));
  const finIncome = Math.abs(sumCurrent('FINANCIAL_INCOME'));
  const finExpense = Math.abs(sumCurrent('FINANCIAL_EXPENSES'));
  const imposte = Math.abs(sumCurrent('TAXES'));

  const ebitda = revenueAmt - cogsAmt - opexAmt - otherExpAmt;
  const ebit = ebitda - ammortamenti;
  const utileNetto = ebit + finIncome - finExpense - imposte;

  // Working capital changes (current assets & current liabilities)
  // Δ = final - opening. For assets: increase = cash outflow (negative). For liabilities: increase = cash inflow (positive).
  const workingCapitalItems = [];

  // Current assets changes (excluding cash)
  const currentAssetAccounts = aggregatedTb.filter(e => {
    const key = e.glAccount || e.name;
    if (mapping[key] !== 'CURRENT_ASSETS') return false;
    const lower = e.name.toLowerCase();
    return !lower.includes('cassa') && !lower.includes('banca') && !lower.includes('bank') && !lower.includes('contanti') && !lower.includes('deposito') && !lower.includes('c/c');
  });

  for (const acc of currentAssetAccounts) {
    const openEntry = openBal.find(o => o.glAccount === acc.glAccount);
    const opening = openEntry ? openEntry.amount : 0;
    const finalBalance = opening + acc.amount;
    const delta = finalBalance - opening;
    if (Math.abs(delta) > 0.01) {
      workingCapitalItems.push({
        label: `± Variazione ${acc.name}`,
        value: -delta, // Asset increase = cash outflow
      });
    }
  }

  // Current liabilities changes
  const currentLiabAccounts = aggregatedTb.filter(e => {
    const key = e.glAccount || e.name;
    return mapping[key] === 'CURRENT_LIABILITIES';
  });

  for (const acc of currentLiabAccounts) {
    const openEntry = openBal.find(o => o.glAccount === acc.glAccount);
    const opening = openEntry ? openEntry.amount : 0;
    const finalBalance = opening + acc.amount;
    const delta = Math.abs(finalBalance) - Math.abs(opening);
    if (Math.abs(delta) > 0.01) {
      workingCapitalItems.push({
        label: `± Variazione ${acc.name}`,
        value: delta, // Liability increase = cash inflow
      });
    }
  }

  // TFR / Non-current liabilities changes
  let varTFR = 0;
  const nonCurrentLiabAccounts = aggregatedTb.filter(e => {
    const key = e.glAccount || e.name;
    return mapping[key] === 'NON_CURRENT_LIABILITIES';
  });
  // For operating section, only TFR
  for (const acc of nonCurrentLiabAccounts) {
    if (acc.name.toLowerCase().includes('tfr') || acc.name.toLowerCase().includes('trattamento fine')) {
      const openEntry = openBal.find(o => o.glAccount === acc.glAccount);
      const opening = openEntry ? openEntry.amount : 0;
      const finalBalance = opening + acc.amount;
      varTFR += Math.abs(finalBalance) - Math.abs(opening);
    }
  }

  const wcTotal = workingCapitalItems.reduce((s, i) => s + i.value, 0);
  const operatingCashFlow = utileNetto + ammortamenti + varTFR + wcTotal;

  // Investing activities: changes in non-current assets
  const investingItems = [];
  const nonCurrentAssets = aggregatedTb.filter(e => {
    const key = e.glAccount || e.name;
    return mapping[key] === 'NON_CURRENT_ASSETS';
  });

  for (const acc of nonCurrentAssets) {
    const openEntry = openBal.find(o => o.glAccount === acc.glAccount);
    const lower = acc.name.toLowerCase();
    if (lower.includes('fondo ammortamento') || lower.includes('ammortamento accumulato')) continue;
    const opening = openEntry ? openEntry.amount : 0;
    const finalBalance = opening + acc.amount;
    const delta = finalBalance - opening;
    if (Math.abs(delta) > 0.01) {
      investingItems.push({
        label: `${delta < 0 ? 'Disinvestimento' : 'Investimento in'} ${acc.name}`,
        value: -delta, // Asset increase = cash outflow
      });
    }
  }

  const investingCashFlow = investingItems.reduce((s, i) => s + i.value, 0);

  // Financing activities: changes in non-current liabilities (excl TFR) + equity
  const financingItems = [];

  for (const acc of nonCurrentLiabAccounts) {
    if (acc.name.toLowerCase().includes('tfr') || acc.name.toLowerCase().includes('trattamento fine')) continue;
    const openEntry = openBal.find(o => o.glAccount === acc.glAccount);
    const opening = openEntry ? openEntry.amount : 0;
    const finalBalance = opening + acc.amount;
    const delta = Math.abs(finalBalance) - Math.abs(opening);
    if (Math.abs(delta) > 0.01) {
      financingItems.push({
        label: `± Variazione ${acc.name}`,
        value: delta,
      });
    }
  }

  const equityAccounts = aggregatedTb.filter(e => {
    const key = e.glAccount || e.name;
    return mapping[key] === 'EQUITY';
  });

  for (const acc of equityAccounts) {
    const lower = acc.name.toLowerCase();
    if (lower.includes('utile') || lower.includes('perdita') || lower.includes('risultato')) continue;
    const openEntry = openBal.find(o => o.glAccount === acc.glAccount);
    const opening = openEntry ? openEntry.amount : 0;
    const finalBalance = opening + acc.amount;
    const delta = Math.abs(finalBalance) - Math.abs(opening);
    if (Math.abs(delta) > 0.01) {
      financingItems.push({
        label: `± Variazione ${acc.name}`,
        value: delta,
      });
    }
  }

  const financingCashFlow = financingItems.reduce((s, i) => s + i.value, 0);
  const netCashFlow = operatingCashFlow + investingCashFlow + financingCashFlow;

  // Track cash accounts correctly across opening and current balances
  const cashAccounts = new Set();
  openBal.forEach(e => {
    const key = e.glAccount || e.name;
    if (mapping[key] === 'CURRENT_ASSETS') {
      const lower = e.name.toLowerCase();
      if (lower.includes('cassa') || lower.includes('banca') || lower.includes('bank') || lower.includes('contanti') || lower.includes('deposito') || lower.includes('c/c')) {
        cashAccounts.add(key);
      }
    }
  });
  aggregatedTb.forEach(e => {
    const key = e.glAccount || e.name;
    if (mapping[key] === 'CURRENT_ASSETS') {
      const lower = e.name.toLowerCase();
      if (lower.includes('cassa') || lower.includes('banca') || lower.includes('bank') || lower.includes('contanti') || lower.includes('deposito') || lower.includes('c/c')) {
        cashAccounts.add(key);
      }
    }
  });

  let openingCash = 0;
  let closingCash = 0;
  for (const key of cashAccounts) {
    const openEntry = openBal.find(o => (o.glAccount || o.name) === key);
    const tbEntry = aggregatedTb.find(t => (t.glAccount || t.name) === key);
    const opening = openEntry ? openEntry.amount : 0;
    const variation = tbEntry ? tbEntry.amount : 0;
    openingCash += opening;
    closingCash += (opening + variation);
  }

  const directCashFlow = closingCash - openingCash;
  const cashFlowDiff = Math.abs(netCashFlow - directCashFlow);
  const isCashFlowCorrect = cashFlowDiff < 0.01;


  // --- Diagnostic Data ---
  let openingAssets = 0;
  let openingLiabilities = 0;
  let openingEquity = 0;
  for (const entry of openBal) {
    const key = entry.glAccount || entry.name;
    const catId = mapping[key];
    if (!catId || catId === 'UNMAPPED') continue;
    const type = CATEGORIES[catId]?.type;
    if (type === 'asset') openingAssets += Math.abs(entry.amount);
    else if (type === 'liability') openingLiabilities += Math.abs(entry.amount);
    else if (type === 'equity') openingEquity += Math.abs(entry.amount);
  }
  const openingGap = Math.abs(openingAssets - (openingLiabilities + openingEquity));

  let closingAssets = 0;
  let closingLiabilities = 0;
  let closingEquity = 0;
  const unmappedAccounts = [];
  
  for (const entry of aggregatedTb) {
    const key = entry.glAccount || entry.name;
    const catId = mapping[key];
    if (!catId || catId === 'UNMAPPED') {
      unmappedAccounts.push({ name: entry.name, amount: entry.amount, glAccount: entry.glAccount });
      continue;
    }
    const type = CATEGORIES[catId]?.type;
    if (type === 'asset') closingAssets += Math.abs(entry.amount);
    else if (type === 'liability') closingLiabilities += Math.abs(entry.amount);
    else if (type === 'equity') closingEquity += Math.abs(entry.amount);
  }
  const closingGap = Math.abs(closingAssets - (closingLiabilities + closingEquity + utileNetto));

  const omittedVariations = [];
  const allBsAccounts = new Set();
  openBal.forEach(e => {
    const catId = mapping[e.glAccount || e.name];
    if (CATEGORIES[catId]?.section === 'bs' || !catId || catId === 'UNMAPPED') allBsAccounts.add(e.glAccount || e.name);
  });
  aggregatedTb.forEach(e => {
    const catId = mapping[e.glAccount || e.name];
    if (CATEGORIES[catId]?.section === 'bs' || !catId || catId === 'UNMAPPED') allBsAccounts.add(e.glAccount || e.name);
  });

  for (const key of allBsAccounts) {
    const inOpen = openBal.find(o => (o.glAccount || o.name) === key);
    const inTb = aggregatedTb.find(t => (t.glAccount || t.name) === key);
    if (inOpen && !inTb) {
      omittedVariations.push({ name: inOpen.name, amount: inOpen.amount, reason: 'Presente nei saldi iniziali ma assente nel bilancio finale' });
    }
    if (inTb && !inOpen) {
       omittedVariations.push({ name: inTb.name, amount: inTb.amount, reason: 'Presente nel bilancio finale ma senza saldo iniziale' });
    }
  }

  const diagnosticData = {
    openingGap,
    closingGap,
    unmappedAccounts,
    omittedVariations
  };

  return {
    utileNetto,
    ammortamenti,
    varTFR,
    workingCapitalItems,
    operatingCashFlow,
    investingItems,
    investingCashFlow,
    financingItems,
    financingCashFlow,
    netCashFlow,
    openingCash,
    closingCash,
    directCashFlow,
    cashFlowDiff,
    isCashFlowCorrect,
    diagnosticData,
  };
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
          title: 'Rendiconto Finanziario', 
          description: 'Questo tab mostra da dove arriva la cassa della tua azienda e dove viene spesa, usando il Metodo Indiretto.' 
        } 
      },
      { 
        element: '.data-table', 
        popover: { 
          title: 'Tre Aree di Flusso', 
          description: 'Clicca sulle intestazioni (Attività Operativa, di Investimento o Finanziaria) per espandere i dettagli di ogni macro-area.' 
        } 
      },
      { 
        element: '.cash-flow-check', 
        popover: { 
          title: 'Quadratura', 
          description: 'In fondo troverai il pannello di quadratura. Se il rendiconto non quadra, il sistema analizzerà le cause (es. saldi iniziali mancanti o conti non mappati) e ti permetterà di sistemarli automaticamente tramite l\'Intelligenza Artificiale.' 
        } 
      }
    ]
  });
  driverObj.drive();
}
