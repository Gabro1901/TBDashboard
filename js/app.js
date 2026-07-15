// ═══════════════════════════════════════════
// APP.JS — Main Application Controller
// ═══════════════════════════════════════════

import { store, CATEGORIES, getCategoryList } from './data/store.js';
import { formatCurrency, parseItalianNumber } from './utils/formatters.js';
import { showToast } from './utils/toast.js';
import { aggregateByGLAccount } from './utils/accountHelpers.js';
import { parseCSV, readFileAsText } from './utils/csvParser.js';
import { classifyByPrefix, classifyByKeywords } from './data/chartOfAccounts.js';
import * as trialBalanceModule from './modules/trialBalance.js';
import * as balanceSheetModule from './modules/balanceSheet.js';
import * as incomeStatementModule from './modules/incomeStatement.js';
import * as cashFlowModule from './modules/cashFlow.js';
import * as dashboardModule from './modules/dashboard.js';
import * as forecastModule from './modules/forecast.js';
import * as aiLogsModule from './modules/aiLogs.js';
import { updateDOM } from './utils/domHelpers.js';
import { showCSVMappingModal } from './utils/importWizard.js';

// Re-export for any module that imports from app.js
export { showToast };

let currentPage = 'input';
const openingExpandedGroups = new Set();
let eventsBoundDocs = false;
let eventsBoundOpening = false;
let eventsBoundSettings = false;

/**
 * Navigate to a page section.
 */
function navigateTo(page) {
  currentPage = page;

  // Update nav items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });

  // Hide all sections
  document.querySelectorAll('.page-section').forEach(sec => {
    sec.classList.remove('active');
  });

  // Show current section
  const section = document.getElementById(`page-${page}`);
  if (section) {
    section.classList.add('active');
  }

  // Render page content
  switch (page) {
    case 'input':
      // trialBalance auto-renders on state change
      break;
    case 'documents':
      renderDocumentsPage();
      break;
    case 'opening':
      renderOpeningBalancesPage();
      break;
    case 'dashboard':
      dashboardModule.render();
      break;
    case 'forecast':
      forecastModule.render();
      break;
    case 'settings':
      renderSettingsPage();
      break;
    case 'ailogs':
      aiLogsModule.render();
      break;
  }
  
  if (window.lucide) window.lucide.createIcons();
}

window.refreshIcons = () => {
  if (window.lucide) window.lucide.createIcons();
};

/**
 * Render the Documents page with checkbox selection + generated docs.
 */
function renderDocumentsPage() {
  const container = document.querySelector('#page-documents .page-container');
  if (!container) return;

  const sel = store.state.selectedDocuments;
  const tb = store.state.trialBalance;

  const htmlString = `
    <div class="page-header no-print">
      <h1 class="page-title">Documenti Contabili</h1>
      <p class="page-subtitle">Visualizza e stampa i report generati automaticamente dal bilancio di verifica.</p>
    </div>

    <div class="doc-layout-split">
      <div class="doc-sidebar no-print">
        <div class="doc-menu-item ${sel.balanceSheet ? 'active' : ''}" data-doc="balanceSheet">
          <i data-lucide="layout-dashboard"></i>
          <span>Stato Patrimoniale</span>
        </div>
        <div class="doc-menu-item ${sel.incomeStatement ? 'active' : ''}" data-doc="incomeStatement">
          <i data-lucide="file-text"></i>
          <span>Conto Economico</span>
        </div>
        <div class="doc-menu-item ${sel.cashFlow ? 'active' : ''}" data-doc="cashFlow">
          <i data-lucide="dollar-sign"></i>
          <span>Rendiconto Finanziario</span>
        </div>
      </div>
      
      <div class="doc-main">
        ${(sel.balanceSheet || sel.cashFlow) && !store.state.openingBalances.length && tb.length > 0 ? `
        <div class="opening-notice no-print" style="margin-bottom: var(--space-6);">
          <i data-lucide="info" style="width: 16px; height: 16px;"></i>
          <span>Per lo Stato Patrimoniale comparativo e il Rendiconto Finanziario, inserisci i <strong>saldi iniziali</strong> nella sezione dedicata.</span>
        </div>` : ''}
        ${sel.balanceSheet ? `<div id="doc-balance-sheet"></div>` : ''}
        ${sel.incomeStatement ? `<div id="doc-income-statement"></div>` : ''}
        ${sel.cashFlow ? `<div id="doc-cash-flow"></div>` : ''}
        ${!sel.balanceSheet && !sel.incomeStatement && !sel.cashFlow ? `
          <div class="empty-state card">
            <i data-lucide="file-text" class="empty-state-icon"></i>
            <h3 class="empty-state-title">Nessun documento selezionato</h3>
            <p class="empty-state-desc">Seleziona un documento dal menu a sinistra per visualizzarlo.</p>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  updateDOM(container, htmlString);

  if (!eventsBoundDocs) {
    eventsBoundDocs = true;
    container.addEventListener('click', (e) => {
      const item = e.target.closest('.doc-menu-item');
      if (item) {
        const docKey = item.dataset.doc;
        
        const isOnlySelected = store.state.selectedDocuments[docKey] && 
           !Object.keys(store.state.selectedDocuments).some(k => k !== docKey && store.state.selectedDocuments[k]);
           
        if (!isOnlySelected) {
          store.setSingleDocument(docKey);
          renderDocumentsPage();
        }
      }
    });
  }

  // Generate selected documents
  if (tb.length > 0) {
    if (sel.balanceSheet && container.querySelector('#doc-balance-sheet')) {
      balanceSheetModule.init(container.querySelector('#doc-balance-sheet'));
      balanceSheetModule.render();
    }
    if (sel.incomeStatement && container.querySelector('#doc-income-statement')) {
      incomeStatementModule.init(container.querySelector('#doc-income-statement'));
      incomeStatementModule.render();
    }
    if (sel.cashFlow && container.querySelector('#doc-cash-flow')) {
      cashFlowModule.init(container.querySelector('#doc-cash-flow'));
      cashFlowModule.render();
    }
  }
  
  if (window.refreshIcons) window.refreshIcons();
}

/**
 * Render the Opening Balances page with collapsible category groups.
 */
function renderOpeningBalancesPage() {
  const container = document.querySelector('#page-opening .page-container');
  if (!container) return;

  const tb = store.state.trialBalance;
  const mapping = store.state.accountMapping;
  const openBal = store.state.openingBalances;

  // Aggregate by GL Account, then filter BS accounts
  const aggregated = aggregateByGLAccount(tb);
  const bsAccounts = aggregated.filter(e => {
    const key = e.glAccount || e.name;
    const cat = CATEGORIES[mapping[key]];
    return cat && cat.section === 'bs';
  });

  // Group by category
  const bsGroups = {};
  for (const entry of bsAccounts) {
    const key = entry.glAccount || entry.name;
    const catId = mapping[key] || 'UNMAPPED';
    if (!bsGroups[catId]) {
      bsGroups[catId] = { category: CATEGORIES[catId], accounts: [] };
    }
    bsGroups[catId].accounts.push(entry);
  }

  const activeGroups = Object.entries(bsGroups).filter(([_, g]) => g.accounts.length > 0);

  const htmlString = `
    <div class="page-header">
      <h1 class="page-title">Saldi Iniziali</h1>
      <p class="page-subtitle">Inserisci i saldi di apertura dei conti patrimoniali per il confronto comparativo e il rendiconto finanziario.</p>
    </div>

    <div class="opening-notice">
      <i data-lucide="info" style="width: 16px; height: 16px;"></i>
      <span>I saldi iniziali servono per calcolare le <strong>variazioni patrimoniali</strong> necessarie al Rendiconto Finanziario (metodo indiretto) e per il confronto nello Stato Patrimoniale.</span>
    </div>

    ${bsAccounts.length === 0 ? `
    <div class="card">
      <div class="empty-state">
        <i data-lucide="building-2" class="empty-state-icon"></i>
        <h3 class="empty-state-title">Nessun conto patrimoniale</h3>
        <p class="empty-state-desc">Inserisci il bilancio di verifica e classifica i conti prima di inserire i saldi iniziali.</p>
      </div>
    </div>` : `
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Conti Patrimoniali (${bsAccounts.length} conti aggregati)</h3>
        <div style="display: flex; gap: var(--space-2);">
          <input type="file" id="import-opening-input" accept=".csv,.txt" style="display:none;">
          <button class="btn btn-secondary btn-sm" id="btn-import-opening"><i data-lucide="upload" style="width:14px;height:14px;margin-right:6px;"></i> Importa CSV</button>
          <button class="btn btn-secondary btn-sm" id="btn-copy-as-opening"><i data-lucide="copy" style="width:14px;height:14px;margin-right:6px;"></i> Copia saldi attuali</button>
          <button class="btn btn-danger btn-sm" id="btn-reset-opening"><i data-lucide="trash-2" style="width:14px;height:14px;margin-right:6px;"></i> Resetta Saldi</button>
        </div>
      </div>
    </div>
    
    <div class="opening-bento-grid">
      ${(() => {
        const superGroups = {
          asset: { label: 'Attività', categories: [] },
          liability: { label: 'Passività', categories: [] },
          equity: { label: 'Patrimonio Netto', categories: [] }
        };

        for (const [catId, group] of activeGroups) {
          const type = group.category.type;
          if (superGroups[type]) {
            superGroups[type].categories.push({ id: catId, ...group });
          }
        }

        return Object.entries(superGroups).filter(([_, sg]) => sg.categories.length > 0).map(([sgType, sg]) => {
          const sgTotal = sg.categories.reduce((s, g) => s + g.accounts.reduce((ss, a) => ss + a.amount, 0), 0);
          const sgOpenTotal = sg.categories.reduce((s, g) => s + g.accounts.reduce((ss, a) => {
            const ob = openBal.find(o => o.glAccount === a.glAccount);
            return ss + (ob ? ob.amount : 0);
          }, 0), 0);

          return `
          <div class="card opening-supergroup-card" style="margin-bottom: var(--space-6); background: var(--bg-body); border-color: transparent;">
            <div class="opening-supergroup-header" style="display: flex; align-items: center; justify-content: space-between; padding-bottom: var(--space-3); border-bottom: 2px solid var(--border-color); margin-bottom: var(--space-4);">
              <h2 style="font-size: var(--text-lg); margin: 0; color: var(--text-primary);"><i data-lucide="${sgType === 'asset' ? 'pie-chart' : (sgType === 'liability' ? 'briefcase' : 'landmark')}" style="width: 18px; height: 18px; margin-right: 8px; display: inline-block; vertical-align: middle;"></i>${sg.label}</h2>
              <div style="display: flex; gap: var(--space-6); font-family: var(--font-mono); font-size: var(--text-sm);">
                <span style="color: var(--text-secondary);">Finale: <strong style="font-size: var(--text-md);">${formatCurrency(sgTotal)}</strong></span>
                <span style="color: var(--text-muted);">Iniziale: <strong style="font-size: var(--text-md);">${formatCurrency(sgOpenTotal)}</strong></span>
              </div>
            </div>
            
            <div class="opening-supergroup-body">
              ${sg.categories.map(group => {
                const catId = group.id;
                const isExpanded = openingExpandedGroups.has(catId);
                const groupTotal = group.accounts.reduce((s, a) => s + a.amount, 0);
                const groupOpenTotal = group.accounts.reduce((s, a) => {
                  const ob = openBal.find(o => o.glAccount === a.glAccount);
                  return s + (ob ? ob.amount : 0);
                }, 0);
                
                return `
                <div class="card opening-category-card" data-cat-id="${catId}" style="margin-bottom: var(--space-3);">
                  <div class="opening-category-header" style="cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: var(--space-3) var(--space-4); margin-bottom: ${isExpanded ? 'var(--space-3)' : '0'};">
                    <div>
                      <strong style="color: var(--text-primary);">${isExpanded ? '▼' : '▶'} ${group.category.label}</strong>
                      <span class="badge badge-info" style="margin-left: 8px;">${group.accounts.length} conti</span>
                    </div>
                    <div style="display: flex; gap: var(--space-6); font-family: var(--font-mono); font-size: var(--text-sm);">
                      <span style="color: var(--text-secondary);">Finale: <strong>${formatCurrency(groupTotal)}</strong></span>
                      <span style="color: var(--text-muted);">Iniziale: <strong>${formatCurrency(groupOpenTotal)}</strong></span>
                    </div>
                  </div>
                  ${isExpanded ? `
                  <div class="data-table-wrapper" style="border-top: none; border-top-left-radius: 0; border-top-right-radius: 0; margin-bottom: var(--space-3);">
                    <table class="data-table">
                      <thead>
                        <tr>
                          <th>Codice</th>
                          <th>Nome Conto</th>
                          <th style="text-align: right; width: 160px;">Saldo Finale</th>
                          <th style="width: 200px;">Saldo Iniziale (€)</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${group.accounts.map(a => {
                          const ob = openBal.find(o => o.glAccount === a.glAccount);
                          return `
                          <tr>
                            <td><code style="color: var(--text-muted);">${a.glAccount || '—'}</code></td>
                            <td>${a.name}</td>
                            <td class="amount">${formatCurrency(a.amount)}</td>
                            <td>
                              <input type="text" class="form-input opening-balance-input" 
                                data-gl="${a.glAccount}" 
                                data-name="${a.name}"
                                value="${ob ? ob.amount : ''}" 
                                placeholder="0,00"
                                style="text-align: right; font-family: var(--font-mono);">
                            </td>
                          </tr>`;
                        }).join('')}
                      </tbody>
                    </table>
                  </div>
                  ` : ''}
                </div>`;
              }).join('')}
            </div>
          </div>`;
        }).join('');
      })()}
    </div>`}
  `;
  
  updateDOM(container, htmlString);
  if (window.refreshIcons) window.refreshIcons();

  if (!eventsBoundOpening) {
    eventsBoundOpening = true;
    container.addEventListener('click', (e) => {
      const header = e.target.closest('.opening-category-header');
      if (header) {
        const catId = header.closest('.opening-category-card').dataset.catId;
        if (openingExpandedGroups.has(catId)) openingExpandedGroups.delete(catId);
        else openingExpandedGroups.add(catId);
        renderOpeningBalancesPage();
        return;
      }

      if (e.target.closest('#btn-import-opening')) {
        container.querySelector('#import-opening-input')?.click();
        return;
      }

      if (e.target.closest('#btn-copy-as-opening')) {
        const newOB = bsAccounts.map(a => ({ glAccount: a.glAccount, name: a.name, amount: a.amount }));
        store.setOpeningBalances(newOB);
        showToast('Saldi attuali copiati come saldi iniziali', 'success');
        renderOpeningBalancesPage();
        return;
      }

      if (e.target.closest('#btn-reset-opening')) {
        if (confirm('Sei sicuro di voler resettare tutti i saldi iniziali?')) {
          store.setOpeningBalances([]);
          showToast('Saldi iniziali resettati', 'info');
          renderOpeningBalancesPage();
        }
        return;
      }
    });

    container.addEventListener('change', async (e) => {
      if (e.target.classList.contains('opening-balance-input')) {
        const input = e.target;
        const gl = input.dataset.gl;
        const name = input.dataset.name;
        const amount = parseItalianNumber(input.value);
        const ob = store.state.openingBalances;
        const existing = ob.find(o => o.glAccount === gl);
        if (existing) {
          existing.amount = amount;
          existing.name = name;
        } else {
          ob.push({ glAccount: gl, name, amount });
        }
        store.setOpeningBalances([...ob]);
        return;
      }

      if (e.target.id === 'import-opening-input') {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const text = await readFileAsText(file);
          
          showCSVMappingModal(text, (rows, errors) => {
            if (errors.length > 0 && rows.length === 0) {
              showToast(`Errore nell'importazione: ${errors[0]}`, 'error');
              e.target.value = '';
              return;
            }
            
            const ob = [...store.state.openingBalances];
            const tb = [...store.state.trialBalance];
            let importedCount = 0;
            let newTbCount = 0;
            
            rows.forEach(row => {
              const rowGl = (row.glAccount || '').trim();
              const rowName = (row.name || '').trim().toLowerCase();
              if (!rowGl && !rowName) return;

              const bsMatch = bsAccounts.find(a => 
                (rowGl && a.glAccount === rowGl) || 
                (rowName && a.name.toLowerCase() === rowName)
              );

              const gl = bsMatch ? bsMatch.glAccount : rowGl;
              const name = bsMatch ? bsMatch.name : (row.name || 'Conto Importato');

              // Verifica se esiste già nel Trial Balance (movimenti). Se no, lo aggiungiamo con importo 0
              // così può essere classificato (sia a mano che dall'AI o prefissi)
              const existsInTb = tb.find(t => 
                (t.glAccount && t.glAccount === gl) || 
                (t.name && t.name.toLowerCase() === name.toLowerCase())
              );
              
              if (!existsInTb) {
                tb.push({ glAccount: gl, name: name, amount: 0, date: '', documentNumber: '' });
                newTbCount++;
                
                // Auto-classificazione base
                let catId = classifyByPrefix(gl);
                if (catId === 'UNMAPPED') catId = classifyByKeywords(name);
                if (catId !== 'UNMAPPED') {
                  store.setAccountMapping(gl || name, catId);
                }
              }

              const existingOb = ob.find(o => o.glAccount === gl);
              if (existingOb) {
                existingOb.amount = row.amount;
                existingOb.name = name;
              } else {
                ob.push({ glAccount: gl, name, amount: row.amount });
              }
              importedCount++;
            });
            
            if (newTbCount > 0) {
              store.setTrialBalance(tb);
            }
            store.setOpeningBalances(ob);
            
            if (newTbCount > 0) {
              showToast(`Importati ${importedCount} saldi. ${newTbCount} nuovi conti aggiunti, vai nella sezione Input se non sono mappati!`, 'warning');
            } else {
              showToast(`Importati ${importedCount} saldi iniziali.`, 'success');
            }
            renderOpeningBalancesPage();
          });
        } catch (err) {
          showToast(`Errore: ${err.message}`, 'error');
        }
        e.target.value = '';
      }
    });
  }
}

/**
 * Render Settings page with prefix classification rules editor.
 */
function renderSettingsPage() {
  const container = document.querySelector('#page-settings .page-container');
  if (!container) return;

  const settings = store.state.settings;
  const rules = store.state.classificationRules || [];
  const categories = getCategoryList();

  const activeTab = container.dataset.activeTab || 'general';

  const htmlString = `
    <div class="page-header">
      <h1 class="page-title">Impostazioni</h1>
      <p class="page-subtitle">Configura le preferenze dell'applicazione.</p>
    </div>

    <div class="doc-layout-split">
      <div class="doc-sidebar no-print">
        <div class="doc-menu-item ${activeTab === 'general' ? 'active' : ''}" data-tab="general">
          <i data-lucide="settings"></i>
          <span>Generale</span>
        </div>
        <div class="doc-menu-item ${activeTab === 'rules' ? 'active' : ''}" data-tab="rules">
          <i data-lucide="list"></i>
          <span>Regole Classificazione</span>
        </div>
        <div class="doc-menu-item ${activeTab === 'data' ? 'active' : ''}" data-tab="data">
          <i data-lucide="database"></i>
          <span>Dati & Backup</span>
        </div>
      </div>
      
      <div class="doc-main">
        ${activeTab === 'general' ? `
        <div class="card settings-card">
          <h3 class="card-title" style="margin-bottom: var(--space-5);">Generale</h3>

          <div class="settings-row">
            <div class="settings-row-info">
              <div class="settings-row-title">Nome Azienda</div>
              <div class="settings-row-desc">Viene mostrato nei documenti generati</div>
            </div>
            <input type="text" class="form-input" id="setting-company-name" value="${settings.companyName || ''}" placeholder="es. Mario Rossi S.r.l." style="width: 250px;">
          </div>

          <div class="settings-row">
            <div class="settings-row-info">
              <div class="settings-row-title">API Key Gemini</div>
              <div class="settings-row-desc">Necessaria per classificazione AI e generazione KPI</div>
            </div>
            <input type="password" class="form-input api-key-input" id="setting-api-key" value="${settings.geminiApiKey || ''}" placeholder="AIza..." style="width: 300px;">
            <div style="font-size: var(--text-xs); color: var(--text-muted); margin-top: 4px;">
              La chiave è salvata localmente nel browser (localStorage). Non condividerla.
            </div>
          </div>
        </div>

        ` : ''}

        ${activeTab === 'rules' ? `
        <!-- Classification Rules -->
        <div class="card" style="max-width: 800px;">
          <div class="card-header">
            <h3 class="card-title">Regole Classificazione per Prefisso G/L</h3>
            <button class="btn btn-primary btn-sm" id="btn-add-rule"><i data-lucide="plus" style="width:14px;height:14px;margin-right:6px;"></i> Aggiungi Regola</button>
          </div>
          <p style="font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: var(--space-4);">
            Definisci come i conti vengono classificati in base al prefisso del codice G/L Account. 
            Il prefisso più lungo (più specifico) ha la precedenza.
          </p>
          
          <div class="data-table-wrapper">
            <table class="data-table" id="rules-table">
              <thead>
                <tr>
                  <th style="width: 120px;">Prefisso</th>
                  <th style="width: 200px;">Categoria</th>
                  <th>Etichetta</th>
                  <th style="width: 60px;"></th>
                </tr>
              </thead>
              <tbody>
                ${rules.map((rule, idx) => `
                  <tr data-rule-idx="${idx}">
                    <td>
                      <input type="text" class="form-input rule-prefix-input" data-idx="${idx}" value="${rule.prefix}" 
                        style="width: 80px; font-family: var(--font-mono); text-align: center;" placeholder="es. 10">
                    </td>
                    <td>
                      <select class="form-select rule-category-select" data-idx="${idx}" style="font-size: var(--text-xs);">
                        ${categories.map(c => `
                          <option value="${c.id}" ${c.id === rule.categoryId ? 'selected' : ''}>${c.label}</option>
                        `).join('')}
                      </select>
                    </td>
                    <td>
                      <input type="text" class="form-input rule-label-input" data-idx="${idx}" value="${rule.label || ''}" 
                        placeholder="Descrizione..." style="font-size: var(--text-sm);">
                    </td>
                    <td>
                      <button class="btn btn-ghost btn-icon btn-sm btn-delete-rule" data-idx="${idx}" data-tooltip="Elimina"><i data-lucide="x"></i></button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          
          <div style="margin-top: var(--space-4); display: flex; gap: var(--space-3);">
            <button class="btn btn-secondary btn-sm" id="btn-reset-rules"><i data-lucide="rotate-ccw" style="width:14px;height:14px;margin-right:6px;"></i> Ripristina Default</button>
          </div>
        </div>
        ` : ''}

        ${activeTab === 'data' ? `
        <div class="card settings-card">
          <h3 class="card-title" style="margin-bottom: var(--space-5);">Dati</h3>

          <div class="settings-row">
            <div class="settings-row-info">
              <div class="settings-row-title">Esporta dati</div>
              <div class="settings-row-desc">Scarica tutti i dati salvati in formato JSON</div>
            </div>
            <button class="btn btn-secondary btn-sm" id="btn-export-data"><i data-lucide="download" style="width:14px;height:14px;margin-right:6px;"></i> Esporta JSON</button>
          </div>

          <div class="settings-row">
            <div class="settings-row-info">
              <div class="settings-row-title">Importa dati</div>
              <div class="settings-row-desc">Carica un file JSON esportato in precedenza</div>
            </div>
            <div>
              <input type="file" id="import-data-input" accept=".json" style="display:none;">
              <button class="btn btn-secondary btn-sm" id="btn-import-data"><i data-lucide="upload" style="width:14px;height:14px;margin-right:6px;"></i> Importa JSON</button>
            </div>
          </div>

          <div class="settings-row">
            <div class="settings-row-info">
              <div class="settings-row-title" style="color: var(--danger-400);">Reset completo</div>
              <div class="settings-row-desc">Cancella tutti i dati e riporta l'app allo stato iniziale</div>
            </div>
            <button class="btn btn-danger btn-sm" id="btn-reset-all"><i data-lucide="trash-2" style="width:14px;height:14px;margin-right:6px;"></i> Reset</button>
          </div>
        </div>
        ` : ''}
      </div>
    </div>
  `;
  
  updateDOM(container, htmlString);
  if (window.refreshIcons) window.refreshIcons();

  if (!eventsBoundSettings) {
    eventsBoundSettings = true;


    container.addEventListener('click', (e) => {
      const docMenuItem = e.target.closest('.doc-menu-item');
      if (docMenuItem) {
        container.dataset.activeTab = docMenuItem.dataset.tab;
        renderSettingsPage();
        return;
      }

      if (e.target.closest('#btn-add-rule')) {
        const rules = [...store.state.classificationRules];
        rules.push({ prefix: '', categoryId: 'UNMAPPED', label: '' });
        store.setClassificationRules(rules);
        renderSettingsPage();
        setTimeout(() => {
          const inputs = container.querySelectorAll('.rule-prefix-input');
          inputs[inputs.length - 1]?.focus();
        }, 50);
        return;
      }

      const btnDeleteRule = e.target.closest('.btn-delete-rule');
      if (btnDeleteRule) {
        const idx = parseInt(btnDeleteRule.dataset.idx);
        const rules = [...store.state.classificationRules];
        rules.splice(idx, 1);
        store.setClassificationRules(rules);
        showToast('Regola eliminata', 'info');
        renderSettingsPage();
        return;
      }

      if (e.target.closest('#btn-reset-rules')) {
        if (confirm('Ripristinare le regole di classificazione ai valori predefiniti?')) {
          const defaultRules = [
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
          ];
          store.setClassificationRules(defaultRules);
          showToast('Regole ripristinate ai valori predefiniti', 'success');
          renderSettingsPage();
        }
        return;
      }

      if (e.target.closest('#btn-export-data')) {
        const data = JSON.stringify(store.state, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bilancio_automatico_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Dati esportati', 'success');
        return;
      }

      if (e.target.closest('#btn-import-data')) {
        container.querySelector('#import-data-input')?.click();
        return;
      }

      if (e.target.closest('#btn-reset-all')) {
        if (confirm('Sei sicuro di voler cancellare TUTTI i dati? Questa azione non è reversibile.')) {
          store.reset();
          showToast('Tutti i dati sono stati cancellati', 'info');
          navigateTo('input');
        }
        return;
      }
    });

    container.addEventListener('change', async (e) => {
      if (e.target.id === 'setting-company-name') {
        store.set('settings.companyName', e.target.value.trim());
        showToast('Nome azienda salvato', 'success');
        return;
      }

      if (e.target.id === 'setting-api-key') {
        store.set('settings.geminiApiKey', e.target.value.trim());
        showToast('API Key salvata', 'success');
        return;
      }

      if (e.target.classList.contains('rule-prefix-input') || e.target.classList.contains('rule-category-select') || e.target.classList.contains('rule-label-input')) {
        const tr = e.target.closest('tr');
        if (!tr) return;
        const idx = parseInt(tr.dataset.ruleIdx);
        const rules = [...store.state.classificationRules];
        
        rules[idx] = {
          prefix: tr.querySelector('.rule-prefix-input').value.trim(),
          categoryId: tr.querySelector('.rule-category-select').value,
          label: tr.querySelector('.rule-label-input').value.trim()
        };
        
        store.setClassificationRules(rules);
        return;
      }

      if (e.target.id === 'import-data-input') {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          // Merge into store
          if (data.trialBalance) store.setTrialBalance(data.trialBalance);
          if (data.accountMapping) store.setBulkAccountMapping(data.accountMapping);
          if (data.openingBalances) store.setOpeningBalances(data.openingBalances);
          if (data.dashboardKpis) store.set('dashboardKpis', data.dashboardKpis);
          if (data.dashboardCharts) store.setDashboardCharts(data.dashboardCharts);
          if (data.fixedCategories) store.setFixedCategories(data.fixedCategories);
          if (data.customVariables) store.set('customVariables', data.customVariables);
          if (data.classificationRules) store.setClassificationRules(data.classificationRules);
          if (data.settings) {
            for (const [k, v] of Object.entries(data.settings)) {
              store.set(`settings.${k}`, v);
            }
          }
          showToast('Dati importati con successo', 'success');
          navigateTo('input');
        } catch (err) {
          showToast(`Errore nell'importazione: ${err.message}`, 'error');
        }
        e.target.value = '';
      }
    });
  }
}

/**
 * Initialize the application.
 */
function initApp() {
  // Set up navigation
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.page));
  });

  trialBalanceModule.init(document.querySelector('#page-input .page-container'));
  dashboardModule.init(document.querySelector('#page-dashboard .page-container'));
  forecastModule.init(document.querySelector('#page-forecast .page-container'));
  aiLogsModule.init(document.querySelector('#page-ailogs .page-container'));

  // Listen for storage warning
  window.addEventListener('storage-warning', (e) => {
    showToast(`Attenzione: i dati occupano ${e.detail.sizeMB} MB. Esporta un backup JSON dalle Impostazioni.`, 'warning');
  });

  // Start on input page
  navigateTo('input');
}


if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
