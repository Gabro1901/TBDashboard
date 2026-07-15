// ═══════════════════════════════════════════
// CSV PARSER — Parse CSV files for trial balance import
// ═══════════════════════════════════════════

import { parseItalianNumber } from './formatters.js';

export function previewCSV(csvText) {
  if (!csvText || !csvText.trim()) return { error: 'Il file CSV è vuoto.' };

  const firstLine = csvText.trim().split('\n')[0];
  const delimiter = firstLine.includes(';') ? ';' : ',';
  const lines = csvText.trim().split('\n');

  let headerIndex = -1;
  const firstCells = parseLine(lines[0], delimiter);
  if (firstCells.length >= 2) {
    const firstCell = firstCells[0].toLowerCase().trim();
    if (
      firstCell.includes('account') ||
      firstCell.includes('conto') ||
      firstCell.includes('g/l') ||
      firstCell.includes('codice') ||
      firstCell.includes('code') ||
      isNaN(parseFloat(firstCells[0].replace(/[^\d.-]/g, '')))
    ) {
      headerIndex = 0;
    }
  }

  const colMap = detectColumns(firstCells, delimiter);
  const headers = headerIndex === 0 ? firstCells : Array(firstCells.length).fill('').map((_, i) => `Colonna ${i + 1}`);
  
  const startIndex = headerIndex === 0 ? 1 : 0;
  const previewLines = lines.slice(startIndex, startIndex + 5).filter(l => l.trim() !== '');
  const previewRows = previewLines.map(line => parseLine(line, delimiter));

  return { delimiter, headerIndex, headers, previewRows, colMap };
}

export function parseCSVWithConfig(csvText, config) {
  const { delimiter, headerIndex, colMap, invertSign, useDareAvere } = config;
  const errors = [];
  const rows = [];
  const lines = csvText.trim().split('\n');

  const startIndex = headerIndex === 0 ? 1 : 0;
  const rawRows = [];
  const rawDateStrings = [];

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cells = parseLine(line, delimiter);
    if (cells.length < 2) {
      errors.push(`Riga ${i + 1}: numero di colonne insufficiente (${cells.length}).`);
      continue;
    }

    const dateStr = colMap.date !== undefined && colMap.date !== -1 ? cells[colMap.date]?.trim() || '' : '';
    if (dateStr) rawDateStrings.push(dateStr);
    
    rawRows.push({ cells, lineIndex: i + 1 });
  }

  const detectedFormat = determineDateFormat(rawDateStrings);

  for (const rawRow of rawRows) {
    const cells = rawRow.cells;
    const glAccount = colMap.account !== -1 ? cells[colMap.account]?.trim() || '' : '';
    const name = colMap.name !== -1 ? cells[colMap.name]?.trim() || '' : '';
    
    let amount = 0;
    if (useDareAvere) {
      const debitStr = colMap.debit !== -1 ? cells[colMap.debit]?.trim() || '0' : '0';
      const creditStr = colMap.credit !== -1 ? cells[colMap.credit]?.trim() || '0' : '0';
      let debit = parseItalianNumber(debitStr);
      let credit = parseItalianNumber(creditStr);
      amount = debit - credit;
    } else {
      const amountStr = colMap.amount !== -1 ? cells[colMap.amount]?.trim() || '0' : '0';
      amount = parseItalianNumber(amountStr);
    }
    
    if (invertSign) amount = amount * -1;

    const documentNumber = colMap.documentNumber !== undefined && colMap.documentNumber !== -1 ? cells[colMap.documentNumber]?.trim() || '' : '';
    const rawDate = colMap.date !== undefined && colMap.date !== -1 ? cells[colMap.date]?.trim() || '' : '';
    
    const date = rawDate ? parseAndFormatDate(rawDate, detectedFormat) : '';

    if (!glAccount && !name) continue;

    rows.push({ glAccount, name, amount, documentNumber, date });
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push('Nessuna riga valida trovata nel file CSV.');
  }

  return { rows, errors };
}

export function parseCSV(csvText) {
  const preview = previewCSV(csvText);
  if (preview.error) return { rows: [], errors: [preview.error] };
  
  return parseCSVWithConfig(csvText, {
    delimiter: preview.delimiter,
    headerIndex: preview.headerIndex,
    colMap: preview.colMap,
    invertSign: false
  });
}

/**
 * Parse a single CSV line, handling quoted fields.
 */
function parseLine(line, delimiter) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

/**
 * Try to detect which column index maps to account, name, amount.
 */
function detectColumns(headerCells, delimiter) {
  // Default: columns 0, 1, 2
  const map = { account: 0, name: 1, amount: 2, documentNumber: -1, date: -1, debit: -1, credit: -1 };

  if (headerCells.length < 3) {
    // If only 2 columns, assume name and amount (no G/L code)
    map.account = 0;
    map.name = 0;
    map.amount = 1;
    return map;
  }

  // Try to detect by header names
  for (let i = 0; i < headerCells.length; i++) {
    const h = headerCells[i].toLowerCase().trim();
    if (h.includes('g/l') || h.includes('codice') || h.includes('account') && h.includes('num') || h === 'code' || h === 'conto') {
      map.account = i;
    } else if (h.includes('nome') || h.includes('name') || h.includes('descrizione') || h.includes('description') || h.includes('denominazione')) {
      map.name = i;
    } else if (h.includes('importo') || h.includes('amount') || h.includes('saldo') || h.includes('balance') || h.includes('valore')) {
      map.amount = i;
    } else if (h.includes('document') || h.includes('documento') || h.includes('doc num') || h.includes('contropartita')) {
      map.documentNumber = i;
    } else if (h.includes('data') || h.includes('date') || h.includes('giorno') || h.includes('periodo')) {
      map.date = i;
    } else if (h === 'dare' || h === 'debit' || h.includes('addebito') || h.includes('debito')) {
      map.debit = i;
    } else if (h === 'avere' || h === 'credit' || h.includes('accredito') || h.includes('credito')) {
      map.credit = i;
    }
  }

  return map;
}

/**
 * Read a File object and return its text content.
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Errore nella lettura del file.'));
    reader.readAsText(file, 'UTF-8');
  });
}

/**
 * Contextual date format analysis.
 * Scans all dates in the CSV to determine whether MM-DD or DD-MM layout is used.
 */
function determineDateFormat(dateStrings) {
  let hasFirstPartGreaterThan12 = false;
  let hasSecondPartGreaterThan12 = false;

  for (const dateStr of dateStrings) {
    if (!dateStr) continue;
    const parts = dateStr.trim().split(/[.\/\s-]+/).map(p => p.trim());
    if (parts.length < 3) continue;

    // Skip if first part is YYYY (e.g. YYYY-MM-DD)
    if (parts[0].length === 4) {
      const p1 = parseInt(parts[1], 10);
      const p2 = parseInt(parts[2], 10);
      if (!isNaN(p1) && p1 > 12) hasFirstPartGreaterThan12 = true; // YYYY-DD-MM
      if (!isNaN(p2) && p2 > 12) hasSecondPartGreaterThan12 = true; // YYYY-MM-DD
      continue;
    }

    const p0 = parseInt(parts[0], 10);
    const p1 = parseInt(parts[1], 10);

    if (!isNaN(p0) && p0 > 12 && p0 <= 31) {
      hasFirstPartGreaterThan12 = true; // First part must be day (DD-MM-YYYY)
    }
    if (!isNaN(p1) && p1 > 12 && p1 <= 31) {
      hasSecondPartGreaterThan12 = true; // Second part must be day (MM-DD-YYYY)
    }
  }

  // If there's an index > 12 in the second part, it's MM-DD-YYYY
  if (hasSecondPartGreaterThan12 && !hasFirstPartGreaterThan12) {
    return 'MM-DD';
  }
  // Otherwise, default to DD-MM (standard Italian/European format)
  return 'DD-MM';
}

/**
 * Robust date parser and formatter to DD-MM-YYYY.
 */
export function parseAndFormatDate(dateStr, format) {
  if (!dateStr) return '';
  const cleaned = dateStr.trim();
  if (!cleaned) return '';

  // Try standard ISO-like matching (YYYY-MM-DD)
  const isoMatch = cleaned.match(/^(\d{4})[./\s-]([01]?\d)[./\s-]([0-3]?\d)$/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    return `${d}-${m}-${y}`;
  }

  // Split by common separators
  const parts = cleaned.split(/[.\/\s-]+/).map(p => p.trim());
  if (parts.length < 3) return cleaned; // Fallback to raw

  let day, month, year;

  if (parts[0].length === 4) {
    // YYYY-MM-DD or YYYY-DD-MM
    year = parts[0];
    if (format === 'MM-DD') {
      month = parts[1];
      day = parts[2];
    } else {
      day = parts[1];
      month = parts[2];
    }
  } else if (parts[2].length === 4 || parts[2].length === 2) {
    // DD-MM-YYYY or MM-DD-YYYY
    year = parts[2].length === 2 ? '20' + parts[2] : parts[2];
    if (format === 'MM-DD') {
      month = parts[0];
      day = parts[1];
    } else {
      day = parts[0];
      month = parts[1];
    }
  } else {
    return cleaned;
  }

  day = day.padStart(2, '0');
  month = month.padStart(2, '0');

  const dNum = parseInt(day, 10);
  const mNum = parseInt(month, 10);
  if (dNum < 1 || dNum > 31 || mNum < 1 || mNum > 12) {
    return cleaned; // Invalid date numbers, fallback to raw
  }

  return `${day}-${month}-${year}`;
}
