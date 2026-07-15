// ═══════════════════════════════════════════
// KPI ENGINE — Compute KPIs + preset library
// ═══════════════════════════════════════════

import { store, CATEGORIES } from '../data/store.js';

let _aggCache = null;
let _aggCacheKey = null;
let _aggCacheMappingKey = null;

store.on('trialBalance', () => { _aggCache = null; });
store.on('accountMapping', () => { _aggCache = null; });
store.on('openingBalances', () => { _aggCache = null; });


/**
 * Preset KPI definitions.
 * Each has an id, name, formula string, description, and output type.
 */
export const KPI_PRESETS = [
  // ── Profitability ──
  {
    id: 'roe',
    name: 'ROE',
    formula: '(utileNetto / patrimonioNetto) * 100',
    description: 'Return on Equity — Rendimento del capitale proprio',
    type: 'percentage',
    group: 'Redditività',
  },
  {
    id: 'roi',
    name: 'ROI',
    formula: '(ebit / totaleAttivo) * 100',
    description: 'Return on Investment — Rendimento del capitale investito',
    type: 'percentage',
    group: 'Redditività',
  },
  {
    id: 'ros',
    name: 'ROS',
    formula: '(ebit / ricavi) * 100',
    description: 'Return on Sales — Redditività delle vendite',
    type: 'percentage',
    group: 'Redditività',
  },
  {
    id: 'margine_profitto_netto',
    name: 'Margine di Profitto Netto',
    formula: '(utileNetto / ricavi) * 100',
    description: 'Percentuale di utile netto sui ricavi',
    type: 'percentage',
    group: 'Redditività',
  },
  {
    id: 'margine_ebitda',
    name: 'Margine EBITDA',
    formula: '(ebitda / ricavi) * 100',
    description: 'EBITDA in percentuale sui ricavi',
    type: 'percentage',
    group: 'Redditività',
  },
  {
    id: 'margine_lordo',
    name: 'Margine Lordo',
    formula: '(margineContribuzione / ricavi) * 100',
    description: 'Margine di contribuzione in percentuale sui ricavi',
    type: 'percentage',
    group: 'Redditività',
  },

  // ── Liquidity ──
  {
    id: 'current_ratio',
    name: 'Current Ratio',
    formula: 'totaleAttivoCorrente / totalePassivoCorrente',
    description: 'Rapporto tra attività e passività correnti. >1 = buona liquidità',
    type: 'ratio',
    group: 'Liquidità',
  },
  {
    id: 'quick_ratio',
    name: 'Quick Ratio',
    formula: '(totaleAttivoCorrente - rimanenze) / totalePassivoCorrente',
    description: 'Rapporto acido — liquidità escludendo le rimanenze',
    type: 'ratio',
    group: 'Liquidità',
  },
  {
    id: 'cash_ratio',
    name: 'Cash Ratio',
    formula: 'cassa / totalePassivoCorrente',
    description: 'Rapporto tra liquidità immediata e passività correnti',
    type: 'ratio',
    group: 'Liquidità',
  },

  // ── Leverage ──
  {
    id: 'debt_equity',
    name: 'Debt / Equity',
    formula: 'totalePassivo / patrimonioNetto',
    description: 'Rapporto di indebitamento. Misura la leva finanziaria',
    type: 'ratio',
    group: 'Struttura Finanziaria',
  },
  {
    id: 'leverage',
    name: 'Leverage',
    formula: 'totaleAttivo / patrimonioNetto',
    description: 'Leva finanziaria — Moltiplicatore del capitale',
    type: 'ratio',
    group: 'Struttura Finanziaria',
  },
  {
    id: 'autonomia_finanziaria',
    name: 'Indice Autonomia Finanziaria',
    formula: '(patrimonioNetto / totaleAttivo) * 100',
    description: 'Percentuale del patrimonio netto sul totale attivo',
    type: 'percentage',
    group: 'Struttura Finanziaria',
  },
  {
    id: 'copertura_interessi',
    name: 'Copertura Interessi',
    formula: 'ebit / oneriFinanziari',
    description: 'Capacità di coprire gli oneri finanziari con il reddito operativo',
    type: 'ratio',
    group: 'Struttura Finanziaria',
  },

  // ── Efficiency ──
  {
    id: 'rotazione_crediti',
    name: 'Rotazione Crediti',
    formula: 'ricavi / crediti',
    description: 'Quante volte i crediti si rinnovano nel periodo',
    type: 'ratio',
    group: 'Efficienza',
  },
  {
    id: 'giorni_incasso',
    name: 'Giorni Medi di Incasso',
    formula: '(crediti / ricavi) * 365',
    description: 'Tempo medio di incasso dei crediti in giorni',
    type: 'days',
    group: 'Efficienza',
  },
  {
    id: 'giorni_pagamento',
    name: 'Giorni Medi di Pagamento',
    formula: '(debiti / costoVenduto) * 365',
    description: 'Tempo medio di pagamento dei fornitori in giorni',
    type: 'days',
    group: 'Efficienza',
  },
  {
    id: 'rotazione_magazzino',
    name: 'Rotazione Magazzino',
    formula: 'costoVenduto / rimanenze',
    description: 'Quante volte il magazzino si rinnova nel periodo',
    type: 'ratio',
    group: 'Efficienza',
  },
  {
    id: 'giorni_magazzino',
    name: 'Giorni di Giacenza',
    formula: '(rimanenze / costoVenduto) * 365',
    description: 'Tempo medio di permanenza delle scorte in magazzino',
    type: 'days',
    group: 'Efficienza',
  },
];

/**
 * Compute all financial aggregates from the trial balance.
 * These are the variables available in KPI formulas.
 *
 * @returns {Object} Key-value pairs of financial aggregates
 */
export function computeAggregates(tbRows) {
  const tb = tbRows || store.state.trialBalance;
  const mapping = store.state.accountMapping;
  const openBal = store.state.openingBalances || [];

  if (!tbRows && _aggCache && _aggCacheKey === tb && _aggCacheMappingKey === mapping) {
    return _aggCache;
  }

  const byCategory = {};

  for (const catId of Object.keys(CATEGORIES)) {
    byCategory[catId] = 0;
  }

  // 1. Aggiungi i movimenti dal Trial Balance
  for (const entry of tb) {
    const key = entry.glAccount || entry.name;
    const catId = mapping[key] || 'UNMAPPED';
    byCategory[catId] = (byCategory[catId] || 0) + entry.amount;
  }

  // 2. Aggiungi i Saldi Iniziali SOLO per le voci Patrimoniali (Attivo, Passivo, Netto)
  for (const entry of openBal) {
    const key = entry.glAccount || entry.name;
    const catId = mapping[key] || 'UNMAPPED';
    if (CATEGORIES[catId]?.section === 'bs') {
      byCategory[catId] = (byCategory[catId] || 0) + entry.amount;
    }
  }

  // Derived values
  const totaleAttivoCorrente = byCategory.CURRENT_ASSETS || 0;
  const totaleAttivoNonCorrente = byCategory.NON_CURRENT_ASSETS || 0;
  const totaleAttivo = totaleAttivoCorrente + totaleAttivoNonCorrente;

  const totalePassivoCorrente = Math.abs(byCategory.CURRENT_LIABILITIES || 0);
  const totalePassivoNonCorrente = Math.abs(byCategory.NON_CURRENT_LIABILITIES || 0);
  const totalePassivo = totalePassivoCorrente + totalePassivoNonCorrente;

  const patrimonioNetto = Math.abs(byCategory.EQUITY || 0);

  const ricavi = Math.abs(byCategory.REVENUE || 0) + Math.abs(byCategory.OTHER_INCOME || 0);
  const costoVenduto = Math.abs(byCategory.COGS || 0);
  const costiOperativi = Math.abs(byCategory.OPERATING_EXPENSES || 0);
  const ammortamenti = Math.abs(byCategory.DEPRECIATION || 0);
  const proventiFinanziari = Math.abs(byCategory.FINANCIAL_INCOME || 0);
  const oneriFinanziari = Math.abs(byCategory.FINANCIAL_EXPENSES || 0);
  const imposte = Math.abs(byCategory.TAXES || 0);

  const margineContribuzione = ricavi - costoVenduto;
  const ebitda = margineContribuzione - costiOperativi;
  const ebit = ebitda - ammortamenti;
  const utileNetto = ebit + proventiFinanziari - oneriFinanziari - imposte;

  // For efficiency ratios, isolate specific accounts (using both movements and opening balances for BS items)
  const bsEntries = [...tb, ...openBal.filter(ob => {
    const catId = mapping[ob.glAccount || ob.name];
    return CATEGORIES[catId]?.section === 'bs';
  })];

  const crediti = sumAccountsByPartialCategory(bsEntries, mapping, 'CURRENT_ASSETS', ['crediti', 'credito', 'receivable', 'cliente']);
  const debiti = sumAccountsByPartialCategory(bsEntries, mapping, 'CURRENT_LIABILITIES', ['debiti fornitori', 'fornitore', 'payable']);
  const rimanenze = sumAccountsByPartialCategory(bsEntries, mapping, 'CURRENT_ASSETS', ['rimanenze', 'magazzino', 'scorte', 'inventory']);
  const cassa = sumAccountsByPartialCategory(bsEntries, mapping, 'CURRENT_ASSETS', ['cassa', 'banca', 'bank', 'c/c', 'contanti', 'deposito']);

  const baseAggregates = {
    // Balance Sheet
    totaleAttivo,
    totaleAttivoCorrente,
    totaleAttivoNonCorrente,
    totalePassivo,
    totalePassivoCorrente,
    totalePassivoNonCorrente,
    patrimonioNetto,

    // Income Statement
    ricavi,
    costoVenduto,
    costiOperativi,
    ammortamenti,
    proventiFinanziari,
    oneriFinanziari,
    imposte,
    margineContribuzione,
    ebitda,
    ebit,
    utileNetto,

    // Specific items for efficiency ratios
    crediti: Math.abs(crediti),
    debiti: Math.abs(debiti),
    rimanenze: Math.abs(rimanenze),
    cassa: Math.abs(cassa),

    // Raw by-category (for charts)
    _byCategory: byCategory,
  };

  const customVariables = store.state.customVariables || [];
  for (const cv of customVariables) {
    if (cv.type === 'accounts' && cv.accounts) {
      let sum = 0;
      const allEntries = [...tb, ...openBal];
      for (const entry of allEntries) {
        const key = entry.glAccount || entry.name;
        if (cv.accounts.includes(key)) {
          sum += entry.amount;
        }
      }
      baseAggregates[cv.name] = sum;
    } else if (cv.type === 'formula') {
      baseAggregates[cv.name] = evaluateFormula(cv.formula, baseAggregates);
    }
  }

  if (!tbRows) {
    _aggCache = baseAggregates;
    _aggCacheKey = tb;
    _aggCacheMappingKey = mapping;
  }

  return baseAggregates;
}


/**
 * Sum amounts from accounts in a category that match any of the given keywords.
 */
function sumAccountsByPartialCategory(tb, mapping, categoryId, keywords) {
  let sum = 0;
  for (const entry of tb) {
    const key = entry.glAccount || entry.name;
    const cat = mapping[key];
    if (cat !== categoryId) continue;

    const nameLower = entry.name.toLowerCase();
    if (keywords.some(kw => nameLower.includes(kw))) {
      sum += entry.amount;
    }
  }
  // If no specific match, return the full category amount
  if (sum === 0) {
    for (const entry of tb) {
      const key = entry.glAccount || entry.name;
      if (mapping[key] === categoryId) {
        sum += entry.amount;
      }
    }
  }
  return sum;
}

/**
 * Safely evaluate a KPI formula using the financial aggregates.
 * Uses a restricted parser — no eval().
 *
 * @param {string} formula - The formula string
 * @param {Object} variables - The computed aggregates
 * @returns {number} The computed value
 */
export function evaluateFormula(formula, variables) {
  if (!formula || typeof formula !== 'string') return NaN;

  try {
    // Replace variable names with their values
    let expr = formula.trim();

    // Handle abs() function
    expr = expr.replace(/abs\s*\(/g, 'Math.abs(');

    // Replace variable names (longest first to avoid partial matches)
    const varNames = Object.keys(variables)
      .filter(k => !k.startsWith('_'))
      .sort((a, b) => b.length - a.length);

    for (const name of varNames) {
      const regex = new RegExp(`\\b${name}\\b`, 'g');
      const val = variables[name];
      expr = expr.replace(regex, `(${typeof val === 'number' ? val : 0})`);
    }

    // Validate: only allow numbers, operators, parens, Math.abs
    const sanitized = expr.replace(/Math\.abs/g, '');
    if (!/^[\d\s+\-*/().eE,]+$/.test(sanitized)) {
      console.warn('KPI formula contains invalid characters:', formula, '→', sanitized);
      return NaN;
    }

    // Safe evaluation using Function constructor (limited scope)
    const fn = new Function('Math', `"use strict"; return (${expr});`);
    const result = fn(Math);

    if (!isFinite(result)) return NaN;
    return result;
  } catch (e) {
    console.warn('KPI formula evaluation error:', formula, e);
    return NaN;
  }
}

/**
 * Get descriptions of all available KPI formula variables.
 * @returns {Array<{name: string, description: string, computation: string}>}
 */
export function getVariableDescriptions() {
  const baseDesc = [
    { name: 'totaleAttivo',            description: 'Totale attività',                       computation: 'Attività Correnti + Attività Non Correnti' },
    { name: 'totaleAttivoCorrente',    description: 'Attività correnti',                     computation: 'Somma conti classificati CURRENT_ASSETS' },
    { name: 'totaleAttivoNonCorrente', description: 'Attività non correnti',                 computation: 'Somma conti classificati NON_CURRENT_ASSETS' },
    { name: 'totalePassivo',           description: 'Totale passività',                      computation: '|Passività Correnti| + |Passività Non Correnti|' },
    { name: 'totalePassivoCorrente',   description: 'Passività correnti',                    computation: '|Somma conti CURRENT_LIABILITIES|' },
    { name: 'totalePassivoNonCorrente',description: 'Passività non correnti',                computation: '|Somma conti NON_CURRENT_LIABILITIES|' },
    { name: 'patrimonioNetto',         description: 'Patrimonio netto',                      computation: '|Somma conti EQUITY|' },
    { name: 'ricavi',                  description: 'Ricavi totali',                         computation: '|REVENUE| + |OTHER_INCOME|' },
    { name: 'costoVenduto',            description: 'Costo del venduto',                     computation: '|Somma conti COGS|' },
    { name: 'costiOperativi',          description: 'Costi operativi totali',                computation: '|Somma conti OPERATING_EXPENSES|' },
    { name: 'ammortamenti',            description: 'Ammortamenti e svalutazioni',           computation: '|Somma conti DEPRECIATION|' },
    { name: 'proventiFinanziari',      description: 'Proventi finanziari',                   computation: '|Somma conti FINANCIAL_INCOME|' },
    { name: 'oneriFinanziari',         description: 'Oneri finanziari',                      computation: '|Somma conti FINANCIAL_EXPENSES|' },
    { name: 'imposte',                 description: 'Imposte sul reddito',                   computation: '|Somma conti TAXES|' },
    { name: 'margineContribuzione',    description: 'Margine di Contribuzione',              computation: 'ricavi - costoVenduto' },
    { name: 'ebitda',                  description: 'EBITDA (MOL)',                          computation: 'margineContribuzione - costiOperativi' },
    { name: 'ebit',                    description: 'EBIT (Risultato Operativo)',            computation: 'ebitda - ammortamenti' },
    { name: 'utileNetto',              description: 'Utile Netto',                           computation: 'ebit + proventiFinanziari - oneriFinanziari - imposte' },
    { name: 'crediti',                 description: 'Crediti commerciali',                   computation: 'Conti in CURRENT_ASSETS con keyword crediti/cliente' },
    { name: 'debiti',                  description: 'Debiti commerciali',                    computation: 'Conti in CURRENT_LIABILITIES con keyword debiti/fornitore' },
    { name: 'rimanenze',               description: 'Rimanenze',                             computation: 'Conti in CURRENT_ASSETS con keyword rimanenze/magazzino' },
    { name: 'cassa',                   description: 'Disponibilità liquide',                 computation: 'Conti in CURRENT_ASSETS con keyword cassa/banca' },
  ];

  const customVars = store.state.customVariables || [];
  customVars.forEach(cv => {
    baseDesc.push({
      name: cv.name,
      description: 'Variabile personalizzata',
      computation: cv.type === 'accounts' ? 'Somma di conti specifici' : cv.formula
    });
  });

  return baseDesc;
}

/**
 * Evaluate a formula and return the detailed computation steps.
 * @param {string} formula
 * @param {Object} variables
 * @returns {{result: number, steps: string}}
 */
export function evaluateFormulaDetailed(formula, variables) {
  if (!formula || typeof formula !== 'string') return { result: NaN, steps: '' };

  const varNames = Object.keys(variables)
    .filter(k => !k.startsWith('_'))
    .sort((a, b) => b.length - a.length);

  let substituted = formula.trim();
  for (const name of varNames) {
    const regex = new RegExp(`\\b${name}\\b`, 'g');
    const val = variables[name];
    if (val !== undefined) {
      const formatted = typeof val === 'number' ? val.toLocaleString('it-IT', { maximumFractionDigits: 2 }) : '0';
      substituted = substituted.replace(regex, formatted);
    }
  }

  const result = evaluateFormula(formula, variables);
  return { result, steps: substituted };
}

/**
 * Compute a single KPI value.
 * @param {Object} kpi - KPI definition { formula, type }
 * @param {Object} [aggregates] - Pre-computed aggregates (optional)
 * @returns {number}
 */
export function computeKpi(kpi, aggregates) {
  const vars = aggregates || computeAggregates();
  return evaluateFormula(kpi.formula, vars);
}

/**
 * Compute all active dashboard KPIs.
 * @returns {Array<{kpi: Object, value: number}>}
 */
export function computeAllKpis() {
  const kpis = store.state.dashboardKpis;
  const aggregates = computeAggregates();

  return kpis.map(kpi => ({
    kpi,
    value: evaluateFormula(kpi.formula, aggregates),
  }));
}

/**
 * Format a KPI value based on its type.
 * @param {number} value
 * @param {string} type - 'percentage', 'currency', 'ratio', 'days'
 * @returns {string}
 */
export function formatKpiValue(value, type) {
  if (isNaN(value) || !isFinite(value)) return 'N/D';

  switch (type) {
    case 'percentage':
      return value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
    case 'currency':
      return '€ ' + value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case 'days':
      return Math.round(value).toLocaleString('it-IT') + ' gg';
    case 'ratio':
    default:
      return value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}

/**
 * Get the list of preset KPIs.
 * @returns {Array} Array of preset KPI objects
 */
export function getPresetKpis() {
  return KPI_PRESETS;
}
