import { createModal } from './uiComponents.js';
import { previewCSV, parseCSVWithConfig } from './csvParser.js';

/**
 * Mostra un modale per mappare le colonne di un CSV prima dell'importazione.
 * 
 * @param {string} csvText Il testo grezzo del CSV
 * @param {Function} onConfirm Callback chiamata con (rows, errors) una volta confermata e processata la mappatura
 */
export function showCSVMappingModal(csvText, onConfirm) {
  const preview = previewCSV(csvText);
  if (preview.error) {
    onConfirm([], [preview.error]);
    return;
  }

  const { delimiter, headerIndex, headers, previewRows, colMap } = preview;
  
  const isDareAvereDetected = colMap.debit !== -1 || colMap.credit !== -1;

  // Costruisce le opzioni per la select, pre-selezionando l'indice corretto
  const buildOptions = (selectedIdx) => {
    let html = `<option value="-1">-- Non mappare --</option>`;
    headers.forEach((h, i) => {
      html += `<option value="${i}" ${i === selectedIdx ? 'selected' : ''}>${h}</option>`;
    });
    return html;
  };

  const contentHTML = `
    <div style="margin-bottom: var(--space-4); font-size: var(--text-sm); color: var(--text-secondary);">
      Il sistema ha letto le prime righe del file e provato ad associare le colonne.
      Verifica che ogni dato corrisponda alla colonna corretta.
    </div>

    <!-- Scegli la modalità di importo -->
    <div style="margin-bottom: var(--space-4); padding: var(--space-3); background: var(--surface-color); border: 1px solid var(--border-color); border-radius: var(--radius-md);">
      <h5 style="margin-top: 0; margin-bottom: var(--space-2); font-size: var(--text-sm);">Formato Importi</h5>
      <div style="display: flex; gap: var(--space-4);">
        <label style="cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: var(--text-sm);">
          <input type="radio" name="amount-type" value="single" ${!isDareAvereDetected ? 'checked' : ''}> Importo Singolo (con segni)
        </label>
        <label style="cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: var(--text-sm);">
          <input type="radio" name="amount-type" value="split" ${isDareAvereDetected ? 'checked' : ''}> Colonne Dare e Avere separate
        </label>
      </div>
    </div>
    
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-4); margin-bottom: var(--space-4);">
      <div class="form-group">
        <label class="form-label">Codice Conto</label>
        <select class="form-select" id="mapping-account">
          ${buildOptions(colMap.account)}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Nome Conto</label>
        <select class="form-select" id="mapping-name">
          ${buildOptions(colMap.name)}
        </select>
      </div>
      
      <div class="form-group amount-single-group" style="${isDareAvereDetected ? 'display: none;' : ''}">
        <label class="form-label">Importo</label>
        <select class="form-select" id="mapping-amount">
          ${buildOptions(colMap.amount)}
        </select>
      </div>
      
      <div class="form-group amount-split-group" style="${isDareAvereDetected ? '' : 'display: none;'}">
        <label class="form-label">Dare (Debit)</label>
        <select class="form-select" id="mapping-debit">
          ${buildOptions(colMap.debit)}
        </select>
      </div>
      <div class="form-group amount-split-group" style="${isDareAvereDetected ? '' : 'display: none;'}">
        <label class="form-label">Avere (Credit)</label>
        <select class="form-select" id="mapping-credit">
          ${buildOptions(colMap.credit)}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Data (Opzionale)</label>
        <select class="form-select" id="mapping-date">
          ${buildOptions(colMap.date)}
        </select>
      </div>
      
      <div class="form-group">
        <label class="form-label">Numero Documento (Opzionale)</label>
        <select class="form-select" id="mapping-doc">
          ${buildOptions(colMap.documentNumber)}
        </select>
      </div>
    </div>

    <div style="margin-bottom: var(--space-6); background: var(--surface-color); border: 1px solid var(--border-color); padding: var(--space-3); border-radius: var(--radius-md);">
      <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 500;">
        <input type="checkbox" id="mapping-invert-sign"> Inverti il segno degli importi
      </label>
      <div style="font-size: var(--text-xs); color: var(--text-muted); margin-top: 4px; padding-left: 24px;">
        Spunta questa opzione se i tuoi conti passivi/ricavi sono esportati come positivi (o viceversa) e vuoi ripristinare il segno corretto.<br>
        Nel caso di Dare/Avere, la formula passerà da (Dare - Avere) a (Avere - Dare).
      </div>
    </div>

    <h4 style="margin-top: 0; margin-bottom: var(--space-2); font-size: var(--text-sm);">Anteprima (prime 5 righe)</h4>
    <div style="overflow-x: auto; border: 1px solid var(--border-color); border-radius: var(--radius-md);">
      <table class="data-table" style="margin: 0; font-size: var(--text-xs);">
        <thead>
          <tr>
            ${headers.map(h => `<th>${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${previewRows.map(row => `
            <tr>
              ${row.map(cell => `<td>${cell}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  const footerHTML = `
    <button class="btn btn-primary" id="mapping-confirm-btn">
      <i data-lucide="check" style="width:14px;height:14px;margin-right:6px;"></i> Importa Dati
    </button>
  `;

  const { overlay, close } = createModal({
    title: 'Mappatura Colonne CSV',
    icon: 'columns',
    contentHTML,
    footerHTML,
    modalClass: 'modal-lg'
  });

  // Toggle display of amount vs dare/avere fields
  overlay.querySelectorAll('input[name="amount-type"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const isSplit = e.target.value === 'split';
      overlay.querySelectorAll('.amount-single-group').forEach(el => el.style.display = isSplit ? 'none' : 'block');
      overlay.querySelectorAll('.amount-split-group').forEach(el => el.style.display = isSplit ? 'block' : 'none');
    });
  });

  overlay.querySelector('#mapping-confirm-btn').addEventListener('click', () => {
    const isSplit = overlay.querySelector('input[name="amount-type"]:checked').value === 'split';

    const finalConfig = {
      delimiter,
      headerIndex,
      useDareAvere: isSplit,
      colMap: {
        account: parseInt(overlay.querySelector('#mapping-account').value, 10),
        name: parseInt(overlay.querySelector('#mapping-name').value, 10),
        amount: parseInt(overlay.querySelector('#mapping-amount')?.value || "-1", 10),
        debit: parseInt(overlay.querySelector('#mapping-debit')?.value || "-1", 10),
        credit: parseInt(overlay.querySelector('#mapping-credit')?.value || "-1", 10),
        date: parseInt(overlay.querySelector('#mapping-date').value, 10),
        documentNumber: parseInt(overlay.querySelector('#mapping-doc').value, 10)
      },
      invertSign: overlay.querySelector('#mapping-invert-sign').checked
    };

    const { rows, errors } = parseCSVWithConfig(csvText, finalConfig);
    close();
    onConfirm(rows, errors);
  });
}
