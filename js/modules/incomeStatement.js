// ═══════════════════════════════════════════
// INCOME STATEMENT — Conto Economico
// ═══════════════════════════════════════════

import { store, CATEGORIES } from '../data/store.js';
import { formatCurrency } from '../utils/formatters.js';
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
        <i data-lucide="line-chart" class="empty-state-icon" style="width:48px;height:48px;border:none;background:transparent;"></i>
        <h3 class="empty-state-title">Nessun dato disponibile</h3>
        <p class="empty-state-desc">Inserisci prima il bilancio di verifica nella sezione Input.</p>
      </div>`;
    return;
  }

  // Aggregate by GL account, then group by IS category
  const aggregated = aggregateByGLAccount(tb);
  const groups = {};
  for (const entry of aggregated) {
    const key = entry.glAccount || entry.name;
    const catId = mapping[key] || 'UNMAPPED';
    const cat = CATEGORIES[catId];
    if (cat?.section !== 'is') continue;
    if (!groups[catId]) groups[catId] = [];
    groups[catId].push(entry);
  }

  const signWarnings = {};
  for (const [catId, accounts] of Object.entries(groups)) {
    if (!accounts || accounts.length === 0) continue;
    const expectNegative = ['REVENUE', 'OTHER_INCOME', 'FINANCIAL_INCOME'].includes(catId);
    const wrongSign = accounts.filter(a => expectNegative ? a.amount > 0 : a.amount < 0);
    if (wrongSign.length > 0) {
      signWarnings[catId] = wrongSign.map(a => `${a.name} (${a.amount >= 0 ? '+' : ''}${a.amount.toFixed(2)})`);
    }
  }

  // Calculate sums
  const sum = (catId) => {
    return (groups[catId] || []).reduce((s, e) => s + Math.abs(e.amount), 0);
  };

  const ricavi = sum('REVENUE');
  const altriRicavi = sum('OTHER_INCOME');
  const costoVenduto = sum('COGS');
  const costiOperativi = sum('OPERATING_EXPENSES');
  const ammortamenti = sum('DEPRECIATION');
  const proventiFinanziari = sum('FINANCIAL_INCOME');
  const oneriFinanziari = sum('FINANCIAL_EXPENSES');
  const altriOneri = sum('OTHER_EXPENSES');
  const imposte = sum('TAXES');

  const margineContribuzione = ricavi - costoVenduto;
  const ebitda = margineContribuzione + altriRicavi - costiOperativi - altriOneri;
  const ebit = ebitda - ammortamenti;
  const risultatoPrimaImposte = ebit + proventiFinanziari - oneriFinanziari;
  const utileNetto = risultatoPrimaImposte - imposte;

  const htmlString = `
    <div class="financial-document">
      <div class="doc-title-bar">
        <div class="doc-title">
          <div class="doc-title-icon ce"><i data-lucide="line-chart"></i></div>
          <div>
            <div>Conto Economico</div>
            ${store.state.settings.companyName ? `<div style="font-size: var(--text-sm); font-weight: 400; color: var(--text-secondary);">${store.state.settings.companyName}</div>` : ''}
          </div>
        </div>
        <div style="display: flex; gap: var(--space-3); align-items: center;">
          <button class="btn btn-outline btn-sm no-print" id="btn-start-is-tour">
            <i data-lucide="help-circle" style="width:14px;height:14px;margin-right:6px;"></i> Tutorial
          </button>
          <button class="btn btn-ghost btn-sm no-print" id="is-toggle-details" data-tooltip="Espandi/Comprimi dettagli">
            <i data-lucide="list" style="width:14px;height:14px;margin-right:6px;"></i> Dettagli
          </button>
          <button class="btn btn-secondary btn-sm no-print" onclick="window.print()"><i data-lucide="printer" style="width:14px;height:14px;margin-right:6px;"></i> Stampa</button>
        </div>
      </div>

      <div class="data-table-wrapper">
        <table class="data-table" id="is-table">
          <thead>
            <tr>
              <th>Voce</th>
              <th style="text-align: right; width: 180px;">Importo</th>
            </tr>
          </thead>
          <tbody>
            <!-- Ricavi -->
            <tr class="section-header"><td colspan="2">RICAVI</td></tr>
            ${renderCollapsibleGroup('REVENUE', groups.REVENUE, 'Ricavi delle vendite e prestazioni', true, signWarnings.REVENUE)}
            ${(groups.OTHER_INCOME || []).length > 0 ? renderCollapsibleGroup('OTHER_INCOME', groups.OTHER_INCOME, 'Altri ricavi e proventi', false, signWarnings.OTHER_INCOME) : ''}
            <tr class="subtotal-row">
              <td>Totale Ricavi</td>
              <td class="amount positive">${formatCurrency(ricavi + altriRicavi)}</td>
            </tr>

            <!-- Costo del Venduto -->
            ${(groups.COGS || []).length > 0 ? `
            <tr class="section-header"><td colspan="2">COSTO DEL VENDUTO</td></tr>
            ${renderCollapsibleGroup('COGS', groups.COGS, null, true, signWarnings.COGS)}
            <tr class="subtotal-row">
              <td>Margine Lordo (Contribuzione)</td>
              <td class="amount ${margineContribuzione >= 0 ? 'positive' : 'negative'}">${formatCurrency(margineContribuzione)}</td>
            </tr>
            ` : ''}

            <!-- Costi Operativi -->
            <tr class="section-header"><td colspan="2">COSTI OPERATIVI</td></tr>
            ${renderCollapsibleGroup('OPERATING_EXPENSES', groups.OPERATING_EXPENSES, null, true, signWarnings.OPERATING_EXPENSES)}
            ${(groups.OTHER_EXPENSES || []).length > 0 ? renderCollapsibleGroup('OTHER_EXPENSES', groups.OTHER_EXPENSES, 'Oneri diversi', true, signWarnings.OTHER_EXPENSES) : ''}

            <tr class="total-row" style="background: rgba(20, 184, 166, 0.05);">
              <td><strong>EBITDA</strong> <span style="font-weight:400; color: var(--text-muted); font-size: var(--text-xs);">(Margine Operativo Lordo)</span></td>
              <td class="amount ${ebitda >= 0 ? 'positive' : 'negative'}" style="font-size: var(--text-md);">${formatCurrency(ebitda)}</td>
            </tr>

            <!-- Ammortamenti -->
            <tr class="section-header"><td colspan="2">AMMORTAMENTI E SVALUTAZIONI</td></tr>
            ${renderCollapsibleGroup('DEPRECIATION', groups.DEPRECIATION, null, true, signWarnings.DEPRECIATION)}

            <tr class="total-row" style="background: rgba(99, 102, 241, 0.05);">
              <td><strong>EBIT</strong> <span style="font-weight:400; color: var(--text-muted); font-size: var(--text-xs);">(Risultato Operativo)</span></td>
              <td class="amount ${ebit >= 0 ? 'positive' : 'negative'}" style="font-size: var(--text-md);">${formatCurrency(ebit)}</td>
            </tr>

            <!-- Proventi/Oneri Finanziari -->
            <tr class="section-header"><td colspan="2">AREA FINANZIARIA</td></tr>
            ${(groups.FINANCIAL_INCOME || []).length > 0 ? renderCollapsibleGroup('FINANCIAL_INCOME', groups.FINANCIAL_INCOME, 'Proventi finanziari', false, signWarnings.FINANCIAL_INCOME) : ''}
            ${(groups.FINANCIAL_EXPENSES || []).length > 0 ? renderCollapsibleGroup('FINANCIAL_EXPENSES', groups.FINANCIAL_EXPENSES, 'Oneri finanziari', true, signWarnings.FINANCIAL_EXPENSES) : ''}

            <tr class="subtotal-row">
              <td>Risultato prima delle imposte</td>
              <td class="amount ${risultatoPrimaImposte >= 0 ? 'positive' : 'negative'}">${formatCurrency(risultatoPrimaImposte)}</td>
            </tr>

            <!-- Imposte -->
            ${(groups.TAXES || []).length > 0 ? `
            <tr class="section-header"><td colspan="2">IMPOSTE SUL REDDITO</td></tr>
            ${renderCollapsibleGroup('TAXES', groups.TAXES, null, true, signWarnings.TAXES)}
            ` : ''}

            <!-- Utile Netto -->
            <tr class="total-row" style="background: ${utileNetto >= 0 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(244, 63, 94, 0.08)'};">
              <td><strong>${utileNetto >= 0 ? 'UTILE NETTO' : 'PERDITA NETTA'}</strong></td>
              <td class="amount ${utileNetto >= 0 ? 'positive' : 'negative'}" style="font-size: var(--text-lg);">${formatCurrency(utileNetto)}</td>
            </tr>
          </tbody>
        </table>
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
    if (e.target.closest('#btn-start-is-tour')) {
      startTour();
      return;
    }

    const toggle = e.target.closest('.doc-section-toggle');
    if (toggle) {
      const catId = toggle.dataset.catId;
      if (expandedSections.has(catId)) expandedSections.delete(catId);
      else expandedSections.add(catId);
      render();
      return;
    }

    if (e.target.closest('#is-toggle-details')) {
      const allCatIds = ['REVENUE', 'OTHER_INCOME', 'COGS', 'OPERATING_EXPENSES', 'OTHER_EXPENSES', 'DEPRECIATION', 'FINANCIAL_INCOME', 'FINANCIAL_EXPENSES', 'TAXES'];
      const allExpanded = allCatIds.every(id => expandedSections.has(id));
      if (allExpanded) allCatIds.forEach(id => expandedSections.delete(id));
      else allCatIds.forEach(id => expandedSections.add(id));
      render();
      return;
    }
  });
}

function renderCollapsibleGroup(catId, accounts, label, showNegative = true, warningList = null) {
  if (!accounts || accounts.length === 0) {
    return `<tr><td colspan="2" class="text-muted" style="padding-left: var(--space-8); font-style: italic;">—</td></tr>`;
  }

  const isExpanded = expandedSections.has(catId);
  const total = accounts.reduce((s, a) => s + Math.abs(a.amount), 0);
  const warningBadge = warningList && warningList.length > 0
    ? `<span class="badge badge-warning" style="margin-left: 8px; font-size: 10px; cursor: help;" title="Attenzione: ${warningList.length} conto/i hanno un segno anomalo per questa sezione:\n${warningList.join('\n')}"><i data-lucide="alert-triangle" style="width:12px;height:12px;display:inline-block;vertical-align:middle;"></i> Segno Anomalo</span>`
    : '';

  let html = '';
  if (label) {
    html += `
      <tr class="doc-section-toggle" data-cat-id="${catId}" style="cursor: pointer;">
        <td style="padding-left: var(--space-6); color: var(--text-secondary); font-weight: 500; font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.03em;">
          <i data-lucide="${isExpanded ? 'chevron-down' : 'chevron-right'}" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> ${label}
          <span class="badge badge-info" style="margin-left: 8px; font-size: 10px;">${accounts.length}</span>
          ${warningBadge}
        </td>
        <td class="amount" style="color: var(--text-secondary); font-size: var(--text-xs);">${showNegative ? '−' : ''} ${formatCurrency(total)}</td>
      </tr>`;
  }

  if (isExpanded) {
    for (const a of accounts) {
      const val = Math.abs(a.amount);
      html += `
        <tr>
          <td style="padding-left: var(--space-8);">${a.glAccount ? `<code style="color: var(--text-muted); margin-right: var(--space-2);">${a.glAccount}</code>` : ''}${a.name}</td>
          <td class="amount ${showNegative ? 'negative' : 'positive'}">${showNegative ? '−' : ''} ${formatCurrency(val)}</td>
        </tr>`;
    }
  }

  if (!label) {
    // If no label, treat as a simple group toggle
    html += `
      <tr class="doc-section-toggle" data-cat-id="${catId}" style="cursor: pointer;">
        <td style="padding-left: var(--space-6); color: var(--text-secondary); font-weight: 500; font-size: var(--text-xs);">
          <i data-lucide="${isExpanded ? 'chevron-down' : 'chevron-right'}" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> ${accounts.length} conti
          ${warningBadge}
        </td>
        <td class="amount" style="color: var(--text-secondary); font-size: var(--text-xs);">${showNegative ? '−' : ''} ${formatCurrency(total)}</td>
      </tr>`;

    if (isExpanded) {
      for (const a of accounts) {
        const val = Math.abs(a.amount);
        html += `
          <tr>
            <td style="padding-left: var(--space-8);">${a.glAccount ? `<code style="color: var(--text-muted); margin-right: var(--space-2);">${a.glAccount}</code>` : ''}${a.name}</td>
            <td class="amount ${showNegative ? 'negative' : 'positive'}">${showNegative ? '−' : ''} ${formatCurrency(val)}</td>
          </tr>`;
      }
    }
  }

  return html;
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
          title: 'Conto Economico', 
          description: 'Il Conto Economico a cascata ti permette di analizzare la redditività e capire come si forma l\'utile (o la perdita) dell\'azienda.' 
        } 
      },
      { 
        element: '#is-toggle-details', 
        popover: { 
          title: 'Esplora i Dettagli', 
          description: 'Con questo tasto puoi espandere automaticamente tutte le categorie (come i Ricavi o l\'EBITDA) per vedere quali conti contabili specifici stanno contribuendo al totale.' 
        } 
      },
      { 
        element: '#is-table', 
        popover: { 
          title: 'Analisi Margini', 
          description: 'Scorri la tabella per osservare i vari livelli di marginalità: dal Gross Profit (Margine di Contribuzione) fino all\'Utile Netto finale.' 
        } 
      }
    ]
  });
  driverObj.drive();
}
