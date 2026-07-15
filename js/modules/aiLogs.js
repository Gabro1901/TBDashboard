import { store } from '../data/store.js';
import { showToast } from '../utils/toast.js';
import { updateDOM } from '../utils/domHelpers.js';

let container;
let eventsBound = false;

export function init(el) {
  container = el;
  render();
  store.on('aiLogs', render);
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function render() {
  if (!container) return;

  const logs = store.state.aiLogs || [];

  let htmlString = '';

  if (logs.length === 0) {
    htmlString = `
      <div class="page-header" style="display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-4);">
        <div>
          <h1 class="page-title">Log Interrogazioni IA</h1>
          <p class="page-subtitle">Qui puoi consultare gli input (prompt) e gli output (risposte) dell'IA durante la classificazione.</p>
        </div>
        <button class="btn btn-outline btn-sm" id="btn-start-ailogs-tour">
          <i data-lucide="help-circle" style="width:14px;height:14px;margin-right:6px;"></i> Tutorial
        </button>
      </div>
      <div class="card">
        <div class="empty-state">
          <i data-lucide="bot" class="empty-state-icon" style="width:48px;height:48px;border:none;background:transparent;"></i>
          <h3 class="empty-state-title">Nessun log registrato</h3>
          <p class="empty-state-desc">Avvia la classificazione con IA nella pagina "Bilancio di Verifica" per registrare i primi log.</p>
        </div>
      </div>
    `;
  } else {
    htmlString = `
      <div class="page-header" style="display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-4);">
      <div>
        <h1 class="page-title">Log Interrogazioni IA</h1>
        <p class="page-subtitle">Visualizza in tempo reale le richieste inviate a Gemini e le relative risposte.</p>
      </div>
      <div style="display: flex; gap: var(--space-2);">
        <button class="btn btn-outline btn-sm" id="btn-start-ailogs-tour">
          <i data-lucide="help-circle" style="width:14px;height:14px;margin-right:6px;"></i> Tutorial
        </button>
        <button class="btn btn-danger btn-sm" id="btn-clear-ailogs">
          <i data-lucide="trash-2" style="width:14px;height:14px;margin-right:6px;"></i> Cancella Log
        </button>
      </div>
    </div>

    <div class="logs-list">
      ${logs.map((log, idx) => `
        <div class="card" style="margin-bottom: var(--space-4);">
          <div class="card-header" style="padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--glass-border); display: flex; justify-content: space-between; align-items: center;">
            <h3 class="card-title" style="font-size: var(--text-base); color: var(--primary-300);">
              Richiesta #${idx + 1} — ${log.timestamp}
            </h3>
          </div>
          <div class="card-body" style="padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-4);">
            <details class="log-details">
              <summary style="font-weight: 600; cursor: pointer; color: var(--primary-400); margin-bottom: var(--space-2); outline: none;">
                <i data-lucide="download" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> Visualizza Prompt Inviato (${log.prompt.length} caratteri)
              </summary>
              <pre style="background: var(--bg-deepest); border: 1px solid var(--glass-border); padding: var(--space-3); border-radius: var(--radius-md); overflow-x: auto; font-size: var(--text-xs); white-space: pre-wrap; font-family: var(--font-mono); color: var(--text-secondary); max-height: 400px; overflow-y: auto; margin-top: var(--space-2);">${escapeHtml(log.prompt)}</pre>
            </details>
            
            <details class="log-details" open>
              <summary style="font-weight: 600; cursor: pointer; color: var(--success-400); margin-bottom: var(--space-2); outline: none;">
                <i data-lucide="upload" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> Visualizza Risposta IA (${log.response.length} caratteri)
              </summary>
              <pre style="background: var(--bg-deepest); border: 1px solid var(--glass-border); padding: var(--space-3); border-radius: var(--radius-md); overflow-x: auto; font-size: var(--text-xs); white-space: pre-wrap; font-family: var(--font-mono); color: var(--success-400); max-height: 400px; overflow-y: auto; margin-top: var(--space-2);">${escapeHtml(log.response)}</pre>
            </details>
          </div>
        </div>
      `).reverse().join('')}
    </div>
  `;
  }

  updateDOM(container, htmlString);
  bindEvents();

  if (window.refreshIcons) window.refreshIcons();
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  container.addEventListener('click', (e) => {
    if (e.target.closest('#btn-start-ailogs-tour')) {
      startTour();
      return;
    }

    if (e.target.closest('#btn-clear-ailogs')) {
      if (confirm('Sei sicuro di voler cancellare tutta la cronologia dei log dell\'IA?')) {
        store.clearAiLogs();
        showToast('Logs dell\'IA cancellati', 'info');
      }
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
          title: 'Log dell\'Intelligenza Artificiale', 
          description: 'Questo tab è una "scatola di vetro" che ti permette di vedere esattamente cosa fa l\'intelligenza artificiale dietro le quinte.' 
        } 
      },
      { 
        element: '.logs-list', 
        popover: { 
          title: 'Storico Richieste', 
          description: 'Ogni volta che chiedi all\'AI di classificare un conto o generare un KPI, qui troverai una scheda con i dettagli. (Se la pagina è vuota, vedrai le richieste non appena ne farai una!).' 
        } 
      },
      { 
        element: '#btn-clear-ailogs', 
        popover: { 
          title: 'Pulizia Log', 
          description: 'I log sono salvati localmente. Se la cronologia diventa troppo lunga, puoi cancellare tutto premendo qui.' 
        } 
      }
    ]
  });
  driverObj.drive();
}
