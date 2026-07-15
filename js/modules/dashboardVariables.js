import { store } from '../data/store.js';
import { showToast } from '../utils/toast.js';
import { createModal } from '../utils/uiComponents.js';
import { initFormulaBuilder } from '../utils/formulaAutocomplete.js';

/**
 * Open Variables Manager Modal
 */
export function openVariablesModal() {
  const customVariables = store.state.customVariables || [];
  const tbAccounts = (store.state.trialBalance || []).map(entry => ({
    key: entry.glAccount || entry.name,
    name: entry.name,
    glAccount: entry.glAccount || '',
    amount: entry.amount
  }));

  const contentHTML = `
    <!-- List of existing variables -->
    <div style="margin-bottom: var(--space-6);">
      <h3 style="font-size: var(--text-base); font-weight: 600; margin-bottom: var(--space-3);">Variabili Esistenti</h3>
      ${customVariables.length === 0 ? '<p class="text-muted">Nessuna variabile personalizzata.</p>' : `
        <div class="kpi-preset-grid">
          ${customVariables.map(cv => `
            <div class="kpi-preset-item" style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 600; font-family: var(--font-mono);">${cv.name}</div>
                <div class="text-muted" style="font-size: var(--text-xs);">${cv.type === 'accounts' ? cv.accounts.length + ' conti selezionati' : 'Formula: ' + cv.formula}</div>
              </div>
              <button class="btn btn-ghost btn-sm btn-icon btn-delete-var" data-id="${cv.id}"><i data-lucide="trash-2" style="width:14px;height:14px;color:var(--danger-500);"></i></button>
            </div>
          `).join('')}
        </div>
      `}
    </div>

    <div class="divider"></div>

    <!-- Create new variable form -->
    <h3 style="font-size: var(--text-base); font-weight: 600; margin-bottom: var(--space-3);">Crea Nuova Variabile</h3>

    <div class="form-group" style="margin-bottom: var(--space-4);">
      <label class="form-label">Nome Variabile (usa camelCase, no spazi. es: ricaviEsteri)</label>
      <input type="text" id="new-var-name" class="form-input" placeholder="es. ricaviEsteri" pattern="[a-zA-Z0-9_]+">
    </div>

    <div class="tabs" style="margin-bottom: var(--space-4);">
      <div class="tab active" id="tab-var-accounts" data-target="panel-var-accounts">Da Selezione Conti</div>
      <div class="tab" id="tab-var-formula" data-target="panel-var-formula">Da Formula</div>
    </div>

    <!-- Accounts panel -->
    <div id="panel-var-accounts">
      <div class="form-group">
        <label class="form-label">Seleziona i conti dal bilancio di verifica</label>
        <input type="text" id="search-tb-accounts" class="form-input" placeholder="Cerca conto..." style="margin-bottom: var(--space-2);">
        <div id="tb-accounts-list" style="max-height: 250px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: var(--space-2);">
          <p class="text-muted" style="padding: var(--space-2);">Digita per cercare un conto...</p>
        </div>
      </div>
    </div>

    <div id="panel-var-formula" style="display: none;">
      <div class="form-group">
        <label class="form-label">Formula (usa altre variabili esistenti)</label>
        <input type="text" id="new-var-formula" class="form-input" placeholder="es. totaleAttivo - cassa">
      </div>
    </div>
  `;

  const footerHTML = `
    <button class="btn btn-primary" id="btn-save-var">Salva Variabile</button>
  `;

  const { overlay, close } = createModal({
    title: 'Gestione Variabili Personalizzate',
    contentHTML,
    footerHTML,
    modalClass: 'modal-lg',
    contentStyle: 'max-height: 90vh;',
    bodyStyle: 'display: flex; flex-direction: column;'
  });

  const tbListEl = overlay.querySelector('#tb-accounts-list');
  const checkedKeys = new Set();

  const renderAccountList = (query = '') => {
    const q = query.toLowerCase().trim();
    const filtered = q
      ? tbAccounts.filter(a => a.name.toLowerCase().includes(q) || a.glAccount.toLowerCase().includes(q))
      : tbAccounts;

    const LIMIT = 200;
    const slice = filtered.slice(0, LIMIT);
    const frag = document.createDocumentFragment();

    if (slice.length === 0) {
      const msg = document.createElement('p');
      msg.className = 'text-muted';
      msg.style.padding = 'var(--space-2)';
      msg.textContent = 'Nessun conto trovato.';
      frag.appendChild(msg);
    } else {
      slice.forEach(a => {
        const lbl = document.createElement('label');
        lbl.style.cssText = 'display:flex;align-items:center;gap:var(--space-2);padding:var(--space-2);cursor:pointer;border-bottom:1px solid var(--border-color);';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'var-account-checkbox';
        cb.value = a.key;
        cb.checked = checkedKeys.has(a.key);
        cb.addEventListener('change', () => {
          if (cb.checked) checkedKeys.add(a.key);
          else checkedKeys.delete(a.key);
        });

        const info = document.createElement('div');
        info.style.flex = '1';
        info.innerHTML = `<div style="font-weight:500;">${a.name}</div>${a.glAccount ? `<div class="text-muted" style="font-size:var(--text-xs);">${a.glAccount}</div>` : ''}`;

        const amt = document.createElement('div');
        amt.style.fontWeight = '600';
        amt.textContent = '€ ' + a.amount.toLocaleString('it-IT', { minimumFractionDigits: 2 });

        lbl.appendChild(cb);
        lbl.appendChild(info);
        lbl.appendChild(amt);
        frag.appendChild(lbl);
      });

      if (filtered.length > LIMIT) {
        const note = document.createElement('p');
        note.className = 'text-muted';
        note.style.cssText = 'text-align:center;padding:var(--space-2);font-size:var(--text-xs);';
        note.textContent = `Mostrati ${LIMIT} di ${filtered.length} conti. Affina la ricerca per vedere gli altri.`;
        frag.appendChild(note);
      }
    }

    tbListEl.replaceChildren(frag);
  };

  let searchTimer = null;
  const searchInput = overlay.querySelector('#search-tb-accounts');
  searchInput?.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderAccountList(e.target.value), 120);
  });

  let accountsListLoaded = false;
  const tabs = overlay.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const panelAccounts = overlay.querySelector('#panel-var-accounts');
      const panelFormula  = overlay.querySelector('#panel-var-formula');
      if (tab.dataset.target === 'panel-var-accounts') {
        panelAccounts.style.display = 'block';
        panelFormula.style.display  = 'none';
        if (!accountsListLoaded) {
          accountsListLoaded = true;
          renderAccountList('');
        }
      } else {
        panelAccounts.style.display = 'none';
        panelFormula.style.display  = 'block';
      }
    });
  });

  overlay.querySelectorAll('.btn-delete-var').forEach(btn => {
    btn.addEventListener('click', () => {
      store.removeCustomVariable(btn.dataset.id);
      close();
      openVariablesModal();
    });
  });

  overlay.querySelector('#btn-save-var').addEventListener('click', () => {
    const nameInput = overlay.querySelector('#new-var-name').value.trim();
    if (!nameInput) {
      showToast('Inserisci un nome per la variabile', 'warning');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(nameInput)) {
      showToast('Il nome della variabile non può contenere spazi o caratteri speciali.', 'warning');
      return;
    }

    const isAccounts = overlay.querySelector('#tab-var-accounts').classList.contains('active');
    const variableData = {
      id: 'var_' + Math.random().toString(36).substr(2, 9),
      name: nameInput
    };

    if (isAccounts) {
      if (checkedKeys.size === 0) {
         showToast('Seleziona almeno un conto', 'warning');
         return;
      }
      variableData.type = 'accounts';
      variableData.accounts = Array.from(checkedKeys);
    } else {
      const formula = overlay.querySelector('#new-var-formula').value.trim();
      if (!formula) {
        showToast('Inserisci una formula valida', 'warning');
        return;
      }
      variableData.type = 'formula';
      variableData.formula = formula;
    }

    store.addCustomVariable(variableData);
    showToast('Variabile creata con successo', 'success');
    close();
    openVariablesModal();
  });

  const formulaInput = overlay.querySelector('#new-var-formula');
  if (formulaInput) initFormulaBuilder(formulaInput);
}
