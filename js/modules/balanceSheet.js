// ═══════════════════════════════════════════
// BALANCE SHEET — Stato Patrimoniale
// ═══════════════════════════════════════════

import { store, CATEGORIES } from '../data/store.js';
import { formatCurrency } from '../utils/formatters.js';
import { computeAggregates } from '../utils/kpiEngine.js';
import { aggregateByGLAccount } from '../utils/accountHelpers.js';
import { updateDOM } from '../utils/domHelpers.js';

let container;
const expandedSections = new Set();
let eventsBound = false;

export function init(el) {
  container = el;
}

export function render() {
  const tb = store.state.trialBalance;
  const mapping = store.state.accountMapping;

  if (tb.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i data-lucide="file-text" class="empty-state-icon" style="width:48px;height:48px;border:none;background:transparent;"></i>
        <h3 class="empty-state-title">Nessun dato disponibile</h3>
        <p class="empty-state-desc">Inserisci prima il bilancio di verifica nella sezione Input.</p>
      </div>`;
    return;
  }

  // Opening balances
  const openBal = store.state.openingBalances;
  const hasOpeningBalances = openBal.length > 0;

  // Group aggregated accounts by category
  const groups = groupByCategory(tb, mapping, openBal);
  const agg = computeAggregates();

  const htmlString = `
    <div class="financial-document">
      <div class="doc-title-bar">
        <div class="doc-title">
          <div class="doc-title-icon sp"><i data-lucide="file-text"></i></div>
          <div>
            <div>Stato Patrimoniale</div>
            ${store.state.settings.companyName ? `<div style="font-size: var(--text-sm); font-weight: 400; color: var(--text-secondary);">${store.state.settings.companyName}</div>` : ''}
          </div>
        </div>
        <div style="display: flex; gap: var(--space-3); align-items: center;">
          <button class="btn btn-outline btn-sm no-print" id="btn-start-bs-tour">
            <i data-lucide="help-circle" style="width:14px;height:14px;margin-right:6px;"></i> Tutorial
          </button>
          <button class="btn btn-ghost btn-sm no-print" id="bs-toggle-details" data-tooltip="Espandi/Comprimi dettagli">
            <i data-lucide="list" style="width:14px;height:14px;margin-right:6px;"></i> Dettagli
          </button>
          <button class="btn btn-secondary btn-sm no-print" onclick="window.print()"><i data-lucide="printer" style="width:14px;height:14px;margin-right:6px;"></i> Stampa</button>
        </div>
      </div>

      <div class="data-table-wrapper">
        <table class="data-table" id="bs-table">
          <thead>
            <tr>
              <th>Conto</th>
              <th style="text-align: right; width: 180px;">Importo</th>
              ${hasOpeningBalances ? '<th style="text-align: right; width: 180px;">Saldo Iniziale</th><th style="text-align: right; width: 150px;">Variazione</th>' : ''}
            </tr>
          </thead>
          <tbody>
            <!-- ATTIVO -->
            <tr class="section-header"><td colspan="${hasOpeningBalances ? 4 : 2}">ATTIVO</td></tr>

            <!-- Attività Correnti -->
            ${renderCategorySection('CURRENT_ASSETS', 'Attività Correnti', groups, openBal, hasOpeningBalances, false)}
            <tr class="subtotal-row">
              <td>Totale Attività Correnti</td>
              <td class="amount">${formatCurrency(agg.totaleAttivoCorrente)}</td>
              ${hasOpeningBalances ? `<td class="amount">${formatCurrency(sumOpeningByCategory(openBal, groups.CURRENT_ASSETS))}</td><td class="amount">${renderVariation(agg.totaleAttivoCorrente, sumOpeningByCategory(openBal, groups.CURRENT_ASSETS))}</td>` : ''}
            </tr>

            <!-- Attività Non Correnti -->
            ${renderCategorySection('NON_CURRENT_ASSETS', 'Attività Non Correnti', groups, openBal, hasOpeningBalances, false)}
            <tr class="subtotal-row">
              <td>Totale Attività Non Correnti</td>
              <td class="amount">${formatCurrency(agg.totaleAttivoNonCorrente)}</td>
              ${hasOpeningBalances ? `<td class="amount">${formatCurrency(sumOpeningByCategory(openBal, groups.NON_CURRENT_ASSETS))}</td><td class="amount">${renderVariation(agg.totaleAttivoNonCorrente, sumOpeningByCategory(openBal, groups.NON_CURRENT_ASSETS))}</td>` : ''}
            </tr>

            <tr class="total-row">
              <td>TOTALE ATTIVO</td>
              <td class="amount">${formatCurrency(agg.totaleAttivo)}</td>
              ${hasOpeningBalances ? `<td class="amount">${formatCurrency(sumOpeningByCategory(openBal, groups.CURRENT_ASSETS) + sumOpeningByCategory(openBal, groups.NON_CURRENT_ASSETS))}</td><td class="amount">${renderVariation(agg.totaleAttivo, sumOpeningByCategory(openBal, groups.CURRENT_ASSETS) + sumOpeningByCategory(openBal, groups.NON_CURRENT_ASSETS))}</td>` : ''}
            </tr>

            <!-- PASSIVO -->
            <tr class="section-header"><td colspan="${hasOpeningBalances ? 4 : 2}">PASSIVO E PATRIMONIO NETTO</td></tr>

            <!-- Passività Correnti -->
            ${renderCategorySection('CURRENT_LIABILITIES', 'Passività Correnti', groups, openBal, hasOpeningBalances, true)}
            <tr class="subtotal-row">
              <td>Totale Passività Correnti</td>
              <td class="amount">${formatCurrency(agg.totalePassivoCorrente)}</td>
              ${hasOpeningBalances ? `<td class="amount">${formatCurrency(Math.abs(sumOpeningByCategory(openBal, groups.CURRENT_LIABILITIES)))}</td><td class="amount">${renderVariation(agg.totalePassivoCorrente, Math.abs(sumOpeningByCategory(openBal, groups.CURRENT_LIABILITIES)))}</td>` : ''}
            </tr>

            <!-- Passività Non Correnti -->
            ${renderCategorySection('NON_CURRENT_LIABILITIES', 'Passività Non Correnti', groups, openBal, hasOpeningBalances, true)}
            <tr class="subtotal-row">
              <td>Totale Passività Non Correnti</td>
              <td class="amount">${formatCurrency(agg.totalePassivoNonCorrente)}</td>
              ${hasOpeningBalances ? `<td class="amount">${formatCurrency(Math.abs(sumOpeningByCategory(openBal, groups.NON_CURRENT_LIABILITIES)))}</td><td class="amount">${renderVariation(agg.totalePassivoNonCorrente, Math.abs(sumOpeningByCategory(openBal, groups.NON_CURRENT_LIABILITIES)))}</td>` : ''}
            </tr>

            <!-- Patrimonio Netto -->
            ${renderCategorySection('EQUITY', 'Patrimonio Netto', groups, openBal, hasOpeningBalances, true)}
            <tr class="subtotal-row">
              <td>Totale Patrimonio Netto</td>
              <td class="amount">${formatCurrency(agg.patrimonioNetto)}</td>
              ${hasOpeningBalances ? `<td class="amount">${formatCurrency(Math.abs(sumOpeningByCategory(openBal, groups.EQUITY)))}</td><td class="amount">${renderVariation(agg.patrimonioNetto, Math.abs(sumOpeningByCategory(openBal, groups.EQUITY)))}</td>` : ''}
            </tr>

            <tr class="total-row">
              <td>TOTALE PASSIVO + P.N.</td>
              <td class="amount">${formatCurrency(agg.totalePassivo + agg.patrimonioNetto)}</td>
              ${hasOpeningBalances ? `<td class="amount">${formatCurrency(Math.abs(sumOpeningByCategory(openBal, groups.CURRENT_LIABILITIES) + sumOpeningByCategory(openBal, groups.NON_CURRENT_LIABILITIES) + sumOpeningByCategory(openBal, groups.EQUITY)))}</td><td class="amount">${renderVariation(agg.totalePassivo + agg.patrimonioNetto, Math.abs(sumOpeningByCategory(openBal, groups.CURRENT_LIABILITIES) + sumOpeningByCategory(openBal, groups.NON_CURRENT_LIABILITIES) + sumOpeningByCategory(openBal, groups.EQUITY)))}</td>` : ''}
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Balance Check -->
      <div style="margin-top: var(--space-4); padding: var(--space-3) var(--space-4); border-radius: var(--radius-lg); font-size: var(--text-sm); ${Math.abs(agg.totaleAttivo - (agg.totalePassivo + agg.patrimonioNetto)) < 0.01 ? 'background: var(--success-bg); color: var(--success-400); border: 1px solid rgba(16,185,129,0.2);' : 'background: var(--danger-bg); color: var(--danger-400); border: 1px solid rgba(244,63,94,0.2);'}">
        ${Math.abs(agg.totaleAttivo - (agg.totalePassivo + agg.patrimonioNetto)) < 0.01
          ? '<i data-lucide="check-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:6px;"></i> Il bilancio è in quadratura: Attivo = Passivo + Patrimonio Netto'
          : `<i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:6px;"></i> Sbilancio: differenza di ${formatCurrency(agg.totaleAttivo - (agg.totalePassivo + agg.patrimonioNetto))}`}
      </div>
    </div>
  `;

  updateDOM(container, htmlString);
  bindEvents();

  if (window.refreshIcons) window.refreshIcons();
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  container.addEventListener('click', (e) => {
    if (e.target.closest('#btn-start-bs-tour')) {
      startTour();
      return;
    }

    // Section Toggle
    const toggle = e.target.closest('.doc-section-toggle');
    if (toggle) {
      const catId = toggle.dataset.catId;
      if (expandedSections.has(catId)) expandedSections.delete(catId);
      else expandedSections.add(catId);
      render();
      return;
    }

    // Toggle All Details
    if (e.target.closest('#bs-toggle-details')) {
      const allCatIds = ['CURRENT_ASSETS', 'NON_CURRENT_ASSETS', 'CURRENT_LIABILITIES', 'NON_CURRENT_LIABILITIES', 'EQUITY'];
      const allExpanded = allCatIds.every(id => expandedSections.has(id));
      if (allExpanded) allCatIds.forEach(id => expandedSections.delete(id));
      else allCatIds.forEach(id => expandedSections.add(id));
      render();
      return;
    }
  });
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
          title: 'Stato Patrimoniale', 
          description: 'Questo documento mostra la fotografia del patrimonio aziendale: Attività, Passività e Patrimonio Netto.' 
        } 
      },
      { 
        element: '#bs-toggle-details', 
        popover: { 
          title: 'Livello di Dettaglio', 
          description: 'Puoi cliccare questo pulsante per espandere tutte le macro-voci e vedere nel dettaglio i singoli conti contabili che le compongono.' 
        } 
      },
      { 
        element: '#bs-table', 
        popover: { 
          title: 'Struttura', 
          description: 'La tabella è strutturata secondo gli standard internazionali. Qualsiasi errore di quadratura (es. Attivo ≠ Passivo) verrà evidenziato qui in fondo.' 
        } 
      }
    ]
  });
  driverObj.drive();
}

function groupByCategory(tb, mapping, openBal) {
  // Aggregate by GL account first.
  // We need to merge tb and openBal to ensure accounts with only opening balance are included
  const mergedTb = [...tb];
  for (const ob of openBal) {
    if (!mergedTb.find(t => t.glAccount === ob.glAccount)) {
      mergedTb.push({ glAccount: ob.glAccount, name: ob.name || ob.glAccount, amount: 0 });
    }
  }

  const aggregated = aggregateByGLAccount(mergedTb);

  const groups = {};
  for (const catId of Object.keys(CATEGORIES)) {
    groups[catId] = [];
  }
  for (const entry of aggregated) {
    const key = entry.glAccount || entry.name;
    const catId = mapping[key] || 'UNMAPPED';
    if (CATEGORIES[catId]?.section === 'bs') {
      groups[catId].push(entry);
    }
  }
  return groups;
}

function renderCategorySection(catId, label, groups, openBal, showOpening, absValue) {
  const accounts = groups[catId] || [];
  const isExpanded = expandedSections.has(catId);
  const colSpan = showOpening ? 4 : 2;

  let html = `
    <tr class="section-header doc-section-toggle" data-cat-id="${catId}" style="cursor: pointer;">
      <td colspan="${colSpan}" style="color: var(--accent-400); font-size: var(--text-xs);">
        <i data-lucide="${isExpanded ? 'chevron-down' : 'chevron-right'}" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> ${label}
        <span class="badge badge-info" style="margin-left: 8px; font-size: 10px;">${accounts.length} conti</span>
      </td>
    </tr>`;

  if (isExpanded) {
    html += renderAccountGroup(accounts, openBal, showOpening, absValue);
  }

  return html;
}

function renderAccountGroup(accounts, openBal, showOpening, absValue = false) {
  if (!accounts || accounts.length === 0) {
    return `<tr><td colspan="${showOpening ? 4 : 2}" class="text-muted" style="padding-left: var(--space-8); font-style: italic;">Nessun conto in questa categoria</td></tr>`;
  }
  return accounts.map(a => {
    const openEntry = openBal.find(o => o.glAccount === a.glAccount);
    const opening = openEntry ? openEntry.amount : 0;
    
    // a.amount is the sum of movements (Variation)
    const variation = a.amount;
    const finalBalance = opening + variation;

    const finalDisplay = absValue ? Math.abs(finalBalance) : finalBalance;
    const openingDisplay = absValue ? Math.abs(opening) : opening;

    return `
      <tr>
        <td style="padding-left: var(--space-8);">${a.glAccount ? `<code style="color: var(--text-muted); margin-right: var(--space-2);">${a.glAccount}</code>` : ''}${a.name}</td>
        <td class="amount">${formatCurrency(finalDisplay)}</td>
        ${showOpening ? `<td class="amount">${formatCurrency(openingDisplay)}</td><td class="amount">${renderVariation(finalDisplay, openingDisplay)}</td>` : ''}
      </tr>`;
  }).join('');
}

function sumOpeningByCategory(openBal, accounts) {
  let sum = 0;
  for (const a of accounts) {
    const ob = openBal.find(o => o.glAccount === a.glAccount);
    if (ob) sum += ob.amount;
  }
  return sum;
}

function renderVariation(current, opening) {
  const diff = current - opening;
  if (Math.abs(diff) < 0.01) return '<span class="text-muted">—</span>';
  const color = diff > 0 ? 'var(--success-400)' : 'var(--danger-400)';
  const sign = diff > 0 ? '+' : '';
  return `<span style="color: ${color}; font-family: var(--font-mono);">${sign}${formatCurrency(diff)}</span>`;
}
