// ═══════════════════════════════════════════
// CHART OF ACCOUNTS — Default category mapping patterns
// ═══════════════════════════════════════════

import { store } from './store.js';

/**
 * This module provides two fallback classification strategies:
 * 1. Prefix-based: Uses G/L account number prefixes (configurable rules)
 * 2. Keyword-based: Uses account name keyword matching
 *
 * The AI (Gemini) is the primary classifier. These are fallbacks.
 */

/**
 * Classify a G/L account by its number prefix, using the rules stored in settings.
 * Matches the LONGEST prefix first for specificity (e.g. "510" beats "5" beats "51").
 *
 * @param {string} glAccount - The G/L account number
 * @returns {string} Category ID or 'UNMAPPED'
 */
export function classifyByPrefix(glAccount) {
  if (!glAccount) return 'UNMAPPED';

  const rules = store.state.classificationRules || [];
  // Sort by prefix length descending so longest (most specific) prefix matches first
  const sorted = [...rules].sort((a, b) => b.prefix.length - a.prefix.length);

  for (const rule of sorted) {
    if (glAccount.startsWith(rule.prefix)) {
      return rule.categoryId;
    }
  }

  return 'UNMAPPED';
}

/**
 * Classify all trial balance entries using G/L prefix rules.
 * @param {Array} trialBalance - Array of { glAccount, name, amount }
 * @returns {Object} Mapping of accountKey → categoryId
 */
export function classifyAllByPrefix(trialBalance) {
  const mapping = {};
  for (const entry of trialBalance) {
    const key = entry.glAccount || entry.name;
    const catId = classifyByPrefix(entry.glAccount);
    mapping[key] = catId;
  }
  return mapping;
}

const keywordMap = [
  // ── Current Assets ──
  { keywords: ['cassa', 'cash', 'contanti'],                           category: 'CURRENT_ASSETS' },
  { keywords: ['banca', 'bank', 'c/c', 'conto corrente', 'deposito'], category: 'CURRENT_ASSETS' },
  { keywords: ['crediti', 'credito', 'receivable', 'cliente'],         category: 'CURRENT_ASSETS' },
  { keywords: ['rimanenze', 'magazzino', 'scorte', 'inventory'],       category: 'CURRENT_ASSETS' },
  { keywords: ['ratei attivi', 'risconti attivi', 'prepaid'],          category: 'CURRENT_ASSETS' },
  { keywords: ['iva a credito', 'iva ns credito', 'credito iva'],      category: 'CURRENT_ASSETS' },
  { keywords: ['anticipi', 'acconti attivi'],                          category: 'CURRENT_ASSETS' },
  { keywords: ['titoli', 'investimenti breve'],                        category: 'CURRENT_ASSETS' },

  // ── Non-Current Assets ──
  { keywords: ['immobilizzazioni', 'immobilizzazione', 'fixed asset'],                category: 'NON_CURRENT_ASSETS' },
  { keywords: ['terreni', 'fabbricati', 'edifici', 'building', 'land'],               category: 'NON_CURRENT_ASSETS' },
  { keywords: ['macchinari', 'impianti', 'attrezzature', 'equipment', 'machinery'],   category: 'NON_CURRENT_ASSETS' },
  { keywords: ['mobili', 'arredamento', 'furniture'],                                  category: 'NON_CURRENT_ASSETS' },
  { keywords: ['automezzi', 'veicoli', 'vehicle'],                                    category: 'NON_CURRENT_ASSETS' },
  { keywords: ['brevetti', 'marchi', 'avviamento', 'goodwill', 'patent', 'trademark'], category: 'NON_CURRENT_ASSETS' },
  { keywords: ['software', 'licenze', 'concessioni'],                                 category: 'NON_CURRENT_ASSETS' },
  { keywords: ['partecipazioni', 'investimenti lungo'],                                category: 'NON_CURRENT_ASSETS' },
  { keywords: ['fondo ammortamento', 'ammortamento accumulato', 'accumulated depreciation'], category: 'NON_CURRENT_ASSETS' },

  // ── Current Liabilities ──
  { keywords: ['debiti fornitori', 'fornitore', 'payable', 'accounts payable'], category: 'CURRENT_LIABILITIES' },
  { keywords: ['debiti tributari', 'debiti fiscali', 'tax payable'],            category: 'CURRENT_LIABILITIES' },
  { keywords: ['debiti previdenziali', 'inps', 'inail'],                        category: 'CURRENT_LIABILITIES' },
  { keywords: ['debiti verso dipendenti', 'stipendi da pagare', 'salaries payable'], category: 'CURRENT_LIABILITIES' },
  { keywords: ['iva a debito', 'iva ns debito', 'debito iva'],                 category: 'CURRENT_LIABILITIES' },
  { keywords: ['ratei passivi', 'risconti passivi', 'accrued'],                 category: 'CURRENT_LIABILITIES' },
  { keywords: ['quota corrente mutuo', 'finanziamento breve'],                  category: 'CURRENT_LIABILITIES' },
  { keywords: ['fondo rischi', 'fondo garanzia'],                               category: 'CURRENT_LIABILITIES' },

  // ── Non-Current Liabilities ──
  { keywords: ['mutuo', 'mutui', 'mortgage', 'loan', 'finanziamento lungo'],       category: 'NON_CURRENT_LIABILITIES' },
  { keywords: ['tfr', 'trattamento fine rapporto', 'severance'],                    category: 'NON_CURRENT_LIABILITIES' },
  { keywords: ['obbligazioni', 'bond', 'prestiti obbligazionari'],                  category: 'NON_CURRENT_LIABILITIES' },
  { keywords: ['debiti lungo termine', 'long-term debt', 'long term liabilities'],  category: 'NON_CURRENT_LIABILITIES' },

  // ── Equity ──
  { keywords: ['capitale sociale', 'share capital', 'capital stock'],     category: 'EQUITY' },
  { keywords: ['riserva', 'riserve', 'reserve'],                         category: 'EQUITY' },
  { keywords: ['utile esercizio', 'risultato esercizio', 'net income'],  category: 'EQUITY' },
  { keywords: ['perdita esercizio', 'net loss'],                          category: 'EQUITY' },
  { keywords: ['utili portati', 'retained earnings', 'utili pregressi'], category: 'EQUITY' },
  { keywords: ['patrimonio netto', 'equity', "owner's equity"],          category: 'EQUITY' },

  // ── Revenue ──
  { keywords: ['ricavi', 'vendite', 'fatturato', 'revenue', 'sales'],    category: 'REVENUE' },
  { keywords: ['prestazioni servizi', 'service revenue'],                 category: 'REVENUE' },
  { keywords: ['altri ricavi', 'other revenue', 'proventi diversi'],      category: 'OTHER_INCOME' },

  // ── COGS ──
  { keywords: ['costo del venduto', 'cogs', 'cost of goods', 'cost of sales'], category: 'COGS' },
  { keywords: ['acquisti materie', 'materie prime', 'raw materials'],           category: 'COGS' },
  { keywords: ['acquisti merci', 'merci c/acquisti'],                           category: 'COGS' },
  { keywords: ['variazione rimanenze'],                                         category: 'COGS' },
  { keywords: ['lavorazioni esterne', 'subcontracting'],                        category: 'COGS' },

  // ── Operating Expenses ──
  { keywords: ['costi del personale', 'stipendi', 'salari', 'wages', 'salary', 'payroll'],   category: 'OPERATING_EXPENSES' },
  { keywords: ['affitto', 'canoni', 'locazione', 'rent'],                                     category: 'OPERATING_EXPENSES' },
  { keywords: ['utenze', 'energia', 'gas', 'acqua', 'utilities'],                             category: 'OPERATING_EXPENSES' },
  { keywords: ['assicurazioni', 'insurance'],                                                  category: 'OPERATING_EXPENSES' },
  { keywords: ['spese amministrative', 'administrative'],                                      category: 'OPERATING_EXPENSES' },
  { keywords: ['consulenze', 'professionisti', 'consulting', 'professional fees'],             category: 'OPERATING_EXPENSES' },
  { keywords: ['pubblicità', 'marketing', 'advertising'],                                     category: 'OPERATING_EXPENSES' },
  { keywords: ['manutenzione', 'riparazioni', 'maintenance', 'repair'],                       category: 'OPERATING_EXPENSES' },
  { keywords: ['trasporti', 'spedizioni', 'shipping', 'freight'],                             category: 'OPERATING_EXPENSES' },
  { keywords: ['viaggi', 'trasferte', 'travel'],                                              category: 'OPERATING_EXPENSES' },
  { keywords: ['telefono', 'telecomunicazioni', 'telecom'],                                   category: 'OPERATING_EXPENSES' },
  { keywords: ['cancelleria', 'materiale ufficio', 'office supplies'],                         category: 'OPERATING_EXPENSES' },
  { keywords: ['spese generali', 'general expenses', 'other expenses'],                        category: 'OPERATING_EXPENSES' },

  // ── Depreciation ──
  { keywords: ['ammortamento', 'ammortamenti', 'depreciation', 'amortization'], category: 'DEPRECIATION' },
  { keywords: ['svalutazione', 'svalutazioni', 'impairment', 'write-down'],    category: 'DEPRECIATION' },
  { keywords: ['accantonamento', 'accantonamenti', 'provision'],               category: 'DEPRECIATION' },

  // ── Financial ──
  { keywords: ['interessi attivi', 'interest income', 'proventi finanziari'],  category: 'FINANCIAL_INCOME' },
  { keywords: ['dividendi ricevuti', 'dividend income'],                        category: 'FINANCIAL_INCOME' },
  { keywords: ['utili su cambi', 'foreign exchange gain'],                      category: 'FINANCIAL_INCOME' },
  { keywords: ['interessi passivi', 'interest expense', 'oneri finanziari'],   category: 'FINANCIAL_EXPENSES' },
  { keywords: ['spese bancarie', 'bank charges', 'commissioni bancarie'],      category: 'FINANCIAL_EXPENSES' },
  { keywords: ['perdite su cambi', 'foreign exchange loss'],                    category: 'FINANCIAL_EXPENSES' },

  // ── Taxes ──
  { keywords: ['ires', 'irap', 'imposte', 'tasse', 'tax', 'income tax'],      category: 'TAXES' },
  { keywords: ['imposte sul reddito', 'imposte correnti'],                      category: 'TAXES' },
  { keywords: ['imposte differite', 'deferred tax'],                            category: 'TAXES' },
];

/**
 * Attempt to classify an account name into a category using keyword matching.
 * Returns the category ID or 'UNMAPPED'.
 *
 * @param {string} accountName - The account name to classify
 * @returns {string} Category ID
 */
export function classifyByKeywords(accountName) {
  if (!accountName) return 'UNMAPPED';
  const lower = accountName.toLowerCase().trim();

  for (const { keywords, category } of keywordMap) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        return category;
      }
    }
  }

  return 'UNMAPPED';
}

/**
 * Classify all trial balance entries using keywords (fallback).
 * @param {Array} trialBalance - Array of { glAccount, name, amount }
 * @returns {Object} Mapping of glAccount → categoryId
 */
export function classifyAll(trialBalance) {
  const mapping = {};
  for (const entry of trialBalance) {
    mapping[entry.glAccount || entry.name] = classifyByKeywords(entry.name);
  }
  return mapping;
}
