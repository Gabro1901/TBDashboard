// ═══════════════════════════════════════════
// STORE — Centralized State Management + localStorage
// ═══════════════════════════════════════════

const STORAGE_KEY = 'bilancio_automatico_state';

const defaultState = {
  // Trial balance entries
  trialBalance: [],
  // Opening balances for balance sheet accounts
  openingBalances: [],
  // Account → category mapping (auto + user overrides)
  accountMapping: {},
  // Which documents to generate
  selectedDocuments: {
    balanceSheet: true,
    incomeStatement: true,
    cashFlow: true,
  },
  // Dashboard KPIs
  dashboardKpis: [],
  // Dashboard Charts
  dashboardCharts: [
    {
      id: 'chart_default_1',
      name: 'Composizione Ricavi e Costi',
      type: 'doughnut',
      dataPoints: [
        { label: 'Costo del Venduto', formula: 'costoVenduto' },
        { label: 'Costi Struttura', formula: 'costiOperativi + altriOneri' },
        { label: 'Ammortamenti', formula: 'ammortamenti' },
        { label: 'Oneri Fin. & Imposte', formula: 'oneriFinanziari + imposte' },
        { label: 'Utile Netto', formula: 'utileNetto' }
      ]
    },
    {
      id: 'chart_default_2',
      name: 'Marginalità (Waterfall)',
      type: 'bar',
      dataPoints: [
        { label: 'Ricavi', formula: 'ricavi + altriRicavi' },
        { label: 'Margine Contribuzione', formula: 'margineContribuzione' },
        { label: 'EBITDA', formula: 'ebitda' },
        { label: 'EBIT', formula: 'ebit' },
        { label: 'Risultato Netto', formula: 'utileNetto' }
      ]
    }
  ],
  // G/L Account prefix → category classification rules
  classificationRules: [
    { prefix: '10', categoryId: 'CURRENT_ASSETS',         label: 'Cassa e Banche' },
    { prefix: '11', categoryId: 'CURRENT_ASSETS',         label: 'Crediti' },
    { prefix: '12', categoryId: 'CURRENT_ASSETS',         label: 'Rimanenze' },
    { prefix: '15', categoryId: 'NON_CURRENT_ASSETS',     label: 'Immobilizzazioni Materiali' },
    { prefix: '16', categoryId: 'NON_CURRENT_ASSETS',     label: 'Immobilizzazioni Immateriali' },
    { prefix: '17', categoryId: 'NON_CURRENT_ASSETS',     label: 'Partecipazioni' },
    { prefix: '18', categoryId: 'NON_CURRENT_ASSETS',     label: 'Fondi Ammortamento' },
    { prefix: '20', categoryId: 'CURRENT_LIABILITIES',    label: 'Debiti a breve' },
    { prefix: '21', categoryId: 'CURRENT_LIABILITIES',    label: 'Debiti Fornitori' },
    { prefix: '22', categoryId: 'CURRENT_LIABILITIES',    label: 'Debiti Tributari/Previd.' },
    { prefix: '25', categoryId: 'NON_CURRENT_LIABILITIES',label: 'Mutui e Fin. Lungo Termine' },
    { prefix: '26', categoryId: 'NON_CURRENT_LIABILITIES',label: 'TFR' },
    { prefix: '30', categoryId: 'EQUITY',                 label: 'Capitale e Riserve' },
    { prefix: '40', categoryId: 'REVENUE',                label: 'Ricavi Vendite' },
    { prefix: '41', categoryId: 'OTHER_INCOME',           label: 'Altri Ricavi' },
    { prefix: '50', categoryId: 'COGS',                   label: 'Costo del Venduto' },
    { prefix: '51', categoryId: 'OPERATING_EXPENSES',     label: 'Costi del Personale' },
    { prefix: '52', categoryId: 'OPERATING_EXPENSES',     label: 'Servizi' },
    { prefix: '53', categoryId: 'OPERATING_EXPENSES',     label: 'Godim. Beni di Terzi' },
    { prefix: '54', categoryId: 'OPERATING_EXPENSES',     label: 'Costi Diversi' },
    { prefix: '55', categoryId: 'DEPRECIATION',           label: 'Ammortamenti' },
    { prefix: '60', categoryId: 'FINANCIAL_INCOME',       label: 'Proventi Finanziari' },
    { prefix: '61', categoryId: 'FINANCIAL_EXPENSES',     label: 'Oneri Finanziari' },
    { prefix: '70', categoryId: 'TAXES',                  label: 'Imposte' },
  ],
  // AI classification reasonings { glAccount → reasoning string }
  aiReasonings: {},
  // AI query logs Array<{ timestamp: string, prompt: string, response: string }>
  aiLogs: [],
  // Settings
  settings: {
    currency: 'EUR',
    decimalPlaces: 2,
    geminiApiKey: '',
    companyName: '',
  },
  // Custom Variables defined by user
  customVariables: [],
  // Categories marked as "Fixed Costs"
  fixedCategories: [],
  forecastAssumptions: {
    // 1. Growth Mechanics
    revenueGrowthYoY: 10,   // 10% Annual Growth
    
    // 2. Cost Structure
    cogsMarginBase: 40,     // % on Revenue (can be auto-calculated)
    opexVariablePct: 0,     // % on Revenue
    opexFixedInflation: 2,  // 2% Annual Inflation on Fixed Opex
    
    // 3. NWC Targets (null means use historical auto-calculated)
    targetDso: null,
    targetDpo: null,
    targetDio: null,
    
    // 4. CapEx & D&A
    capexMonthly: 0,
    usefulLifeYears: 5,     // For new CapEx D&A
    
    // 5. Debt & Taxes
    monthlyPrincipal: 0,
    monthlyInterest: 0,
    taxRate: 24,
    
    // Scenarios (Absolute modifiers)
    optRevenueMod: 5,       // +5% to YoY growth
    optMarginMod: -2,       // -2% to COGS margin
    pesRevenueMod: -5,      // -5% to YoY growth
    pesMarginMod: 5,        // +5% to COGS margin
  },
  forecastMonths: 6,
};

/**
 * Account categories used throughout the app.
 */
export const CATEGORIES = {
  // Balance Sheet - Assets
  CURRENT_ASSETS:      { id: 'CURRENT_ASSETS',      label: 'Attività Correnti',       type: 'asset',     section: 'bs' },
  NON_CURRENT_ASSETS:  { id: 'NON_CURRENT_ASSETS',  label: 'Attività Non Correnti',   type: 'asset',     section: 'bs' },
  // Balance Sheet - Liabilities
  CURRENT_LIABILITIES: { id: 'CURRENT_LIABILITIES', label: 'Passività Correnti',      type: 'liability', section: 'bs' },
  NON_CURRENT_LIABILITIES: { id: 'NON_CURRENT_LIABILITIES', label: 'Passività Non Correnti', type: 'liability', section: 'bs' },
  // Balance Sheet - Equity
  EQUITY:              { id: 'EQUITY',              label: 'Patrimonio Netto',        type: 'equity',    section: 'bs' },
  // Income Statement
  REVENUE:             { id: 'REVENUE',             label: 'Ricavi',                  type: 'revenue',   section: 'is' },
  COGS:                { id: 'COGS',                label: 'Costo del Venduto',       type: 'expense',   section: 'is' },
  OPERATING_EXPENSES:  { id: 'OPERATING_EXPENSES',  label: 'Costi Operativi',         type: 'expense',   section: 'is' },
  DEPRECIATION:        { id: 'DEPRECIATION',        label: 'Ammortamenti e Svalutazioni', type: 'expense', section: 'is' },
  FINANCIAL_INCOME:    { id: 'FINANCIAL_INCOME',    label: 'Proventi Finanziari',     type: 'revenue',   section: 'is' },
  FINANCIAL_EXPENSES:  { id: 'FINANCIAL_EXPENSES',  label: 'Oneri Finanziari',        type: 'expense',   section: 'is' },
  TAXES:               { id: 'TAXES',               label: 'Imposte',                 type: 'expense',   section: 'is' },
  OTHER_INCOME:        { id: 'OTHER_INCOME',        label: 'Proventi Straordinari',   type: 'revenue',   section: 'is' },
  OTHER_EXPENSES:      { id: 'OTHER_EXPENSES',      label: 'Oneri Straordinari',      type: 'expense',   section: 'is' },
  // Unmapped
  UNMAPPED:            { id: 'UNMAPPED',            label: 'Non Classificato',        type: 'unknown',   section: 'none' },
};

/**
 * Get all categories as an array.
 */
export function getCategoryList() {
  return Object.values(CATEGORIES).filter(c => c.id !== 'UNMAPPED');
}

/**
 * Get balance sheet categories.
 */
export function getBSCategories() {
  return Object.values(CATEGORIES).filter(c => c.section === 'bs');
}

/**
 * Get income statement categories.
 */
export function getISCategories() {
  return Object.values(CATEGORIES).filter(c => c.section === 'is');
}

class Store {
  constructor() {
    this._state = this._load();
    this._listeners = new Map();
  }

  /** Get the full state (read-only reference) */
  get state() {
    return this._state;
  }

  /** Get a specific path from the state */
  get(path) {
    return path.split('.').reduce((obj, key) => obj?.[key], this._state);
  }

  /** Set a value at a specific path and persist */
  set(path, value) {
    const keys = path.split('.');
    let obj = this._state;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in obj)) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    this._save();
    this._notify(path);
  }

  /** Update the trial balance */
  setTrialBalance(rows) {
    this._state.trialBalance = rows;
    this._save();
    this._notify('trialBalance');
  }

  /** Update a single trial balance row */
  updateTrialBalanceRow(index, row) {
    if (this._state.trialBalance[index]) {
      this._state.trialBalance[index] = { ...this._state.trialBalance[index], ...row };
      this._save();
      this._notify('trialBalance');
    }
  }

  /** Add a trial balance row */
  addTrialBalanceRow(row) {
    this._state.trialBalance.push(row);
    this._save();
    this._notify('trialBalance');
  }

  /** Remove a trial balance row */
  removeTrialBalanceRow(index) {
    this._state.trialBalance.splice(index, 1);
    this._save();
    this._notify('trialBalance');
  }

  /** Set account mapping */
  setAccountMapping(glAccount, categoryId) {
    this._state.accountMapping[glAccount] = categoryId;
    this._save();
    this._notify('accountMapping');
  }

  /** Set bulk account mappings */
  setBulkAccountMapping(mappings) {
    this._state.accountMapping = { ...this._state.accountMapping, ...mappings };
    this._save();
    this._notify('accountMapping');
  }

  /** Set opening balances */
  setOpeningBalances(balances) {
    this._state.openingBalances = balances;
    this._save();
    this._notify('openingBalances');
  }

  /** Update opening balance for a specific account */
  setOpeningBalance(glAccount, amount) {
    const existing = this._state.openingBalances.find(b => b.glAccount === glAccount);
    if (existing) {
      existing.amount = amount;
    } else {
      this._state.openingBalances.push({ glAccount, name: '', amount });
    }
    this._save();
    this._notify('openingBalances');
  }

  /** Toggle document selection */
  toggleDocument(docKey) {
    this._state.selectedDocuments[docKey] = !this._state.selectedDocuments[docKey];
    this._save();
    this._notify('selectedDocuments');
  }

  /** Imposta un singolo documento come attivo, disattivando gli altri */
  setSingleDocument(docKey) {
    Object.keys(this._state.selectedDocuments).forEach(k => {
      this._state.selectedDocuments[k] = (k === docKey);
    });
    this._save();
    this._notify('selectedDocuments');
  }

  /** Add a KPI to dashboard */
  addKpi(kpi) {
    this._state.dashboardKpis.push(kpi);
    this._save();
    this._notify('dashboardKpis');
  }

  /** Update a KPI */
  updateKpi(id, updates) {
    const idx = this._state.dashboardKpis.findIndex(k => k.id === id);
    if (idx >= 0) {
      this._state.dashboardKpis[idx] = { ...this._state.dashboardKpis[idx], ...updates };
      this._save();
      this._notify('dashboardKpis');
    }
  }

  /** Remove a KPI */
  removeKpi(id) {
    this._state.dashboardKpis = this._state.dashboardKpis.filter(k => k.id !== id);
    this._save();
    this._notify('dashboardKpis');
  }

  /** Add a Chart to dashboard */
  addChart(chart) {
    this._state.dashboardCharts.push(chart);
    this._save();
    this._notify('dashboardCharts');
  }

  /** Update a Chart */
  updateChart(id, updates) {
    const idx = this._state.dashboardCharts.findIndex(c => c.id === id);
    if (idx >= 0) {
      this._state.dashboardCharts[idx] = { ...this._state.dashboardCharts[idx], ...updates };
      this._save();
      this._notify('dashboardCharts');
    }
  }

  /** Remove a Chart */
  removeChart(id) {
    this._state.dashboardCharts = this._state.dashboardCharts.filter(c => c.id !== id);
    this._save();
    this._notify('dashboardCharts');
  }

  setDashboardCharts(charts) {
    this._state.dashboardCharts = charts;
    this._save();
    this._notify('dashboardCharts');
  }

  setFixedCategories(categories) {
    this._state.fixedCategories = categories;
    this._save();
    this._notify('fixedCategories');
  }

  /** Add a Custom Variable */
  addCustomVariable(variable) {
    if (!this._state.customVariables) this._state.customVariables = [];
    this._state.customVariables.push(variable);
    this._save();
    this._notify('customVariables');
  }

  /** Update a Custom Variable */
  updateCustomVariable(id, updates) {
    if (!this._state.customVariables) this._state.customVariables = [];
    const idx = this._state.customVariables.findIndex(v => v.id === id);
    if (idx >= 0) {
      this._state.customVariables[idx] = { ...this._state.customVariables[idx], ...updates };
      this._save();
      this._notify('customVariables');
    }
  }

  /** Remove a Custom Variable */
  removeCustomVariable(id) {
    if (!this._state.customVariables) this._state.customVariables = [];
    this._state.customVariables = this._state.customVariables.filter(v => v.id !== id);
    this._save();
    this._notify('customVariables');
  }

  /** Set classification rules */
  setClassificationRules(rules) {
    this._state.classificationRules = rules;
    this._save();
    this._notify('classificationRules');
  }

  /** Add a classification rule */
  addClassificationRule(rule) {
    this._state.classificationRules.push(rule);
    this._save();
    this._notify('classificationRules');
  }

  /** Remove a classification rule by index */
  removeClassificationRule(index) {
    this._state.classificationRules.splice(index, 1);
    this._save();
    this._notify('classificationRules');
  }

  /** Update a classification rule */
  updateClassificationRule(index, rule) {
    if (this._state.classificationRules[index]) {
      this._state.classificationRules[index] = { ...this._state.classificationRules[index], ...rule };
      this._save();
      this._notify('classificationRules');
    }
  }

  /** Set AI reasonings */
  setAiReasonings(reasonings) {
    this._state.aiReasonings = { ...this._state.aiReasonings, ...reasonings };
    this._save();
    this._notify('aiReasonings');
  }

  /** Clear AI reasonings */
  clearAiReasonings() {
    this._state.aiReasonings = {};
    this._save();
    this._notify('aiReasonings');
  }

  /** Add an AI query log */
  addAiLog(log) {
    if (!this._state.aiLogs) this._state.aiLogs = [];
    this._state.aiLogs.push(log);
    // Limit log size to last 30 queries to avoid bloated localStorage
    if (this._state.aiLogs.length > 30) {
      this._state.aiLogs.shift();
    }
    this._save();
    this._notify('aiLogs');
  }

  /** Clear AI logs */
  clearAiLogs() {
    this._state.aiLogs = [];
    this._save();
    this._notify('aiLogs');
  }

  /** Subscribe to state changes */
  on(path, callback) {
    if (!this._listeners.has(path)) {
      this._listeners.set(path, new Set());
    }
    this._listeners.get(path).add(callback);
    return () => this._listeners.get(path)?.delete(callback);
  }

  /** Reset all state */
  reset() {
    this._state = JSON.parse(JSON.stringify(defaultState));
    this._save();
    this._notify('*');
  }

  ensureKpiIds() {
    let needsSave = false;
    this._state.dashboardKpis.forEach(k => {
      if (!k.id) {
        k.id = 'kpi_' + Math.random().toString(36).substr(2, 9);
        needsSave = true;
      }
    });
    if (needsSave) {
      this._save();
    }
  }

  setForecastMonths(months) {
    this._state.forecastMonths = months;
    this._save();
    this._notify('forecastMonths');
  }

  setForecastAssumption(key, value) {
    this._state.forecastAssumptions[key] = value;
    this._save();
    this._notify('forecastAssumptions');
  }

  reorderKpis(orderedIds) {
    const kpis = [...this._state.dashboardKpis];
    kpis.sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id));
    this._state.dashboardKpis = kpis;
    this._save();
  }

  // ── Private ──
  _load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return this._merge(JSON.parse(JSON.stringify(defaultState)), parsed);
      }
    } catch (e) {
      console.warn('Store: failed to load state', e);
    }
    return JSON.parse(JSON.stringify(defaultState));
  }

  _save() {
    try {
      const serialized = JSON.stringify(this._state);
      localStorage.setItem(STORAGE_KEY, serialized);
      this._checkStorageSize(serialized);
    } catch (e) {
      console.warn('Store: failed to save state', e);
    }
  }

  _checkStorageSize(serialized) {
    try {
      const sizeMB = (serialized.length / (1024 * 1024)).toFixed(2);
      if (serialized.length > 4 * 1024 * 1024) {
        console.warn(`[Store] localStorage usage: ${sizeMB} MB — approaching limit`);
        window.dispatchEvent(new CustomEvent('storage-warning', {
          detail: { sizeMB }
        }));
      }
    } catch (e) { /* ignore */ }
  }


  _notify(path) {
    // Notify specific listeners
    this._listeners.get(path)?.forEach(cb => cb(this._state));
    // Notify wildcard listeners
    this._listeners.get('*')?.forEach(cb => cb(this._state));
  }

  _merge(defaults, saved) {
    const result = { ...defaults };
    for (const key of Object.keys(saved)) {
      if (key in defaults) {
        if (typeof defaults[key] === 'object' && !Array.isArray(defaults[key]) && defaults[key] !== null) {
          result[key] = this._merge(defaults[key], saved[key]);
        } else {
          result[key] = saved[key];
        }
      } else {
        result[key] = saved[key];
      }
    }
    return result;
  }
}

// Singleton
export const store = new Store();
