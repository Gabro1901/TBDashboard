// ═══════════════════════════════════════════
// FORMATTERS — Currency, numbers, percentages
// ═══════════════════════════════════════════

const euroFormatter = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const intFormatter = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const pctFormatter = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  style: 'percent',
});

/**
 * Format a number as Euro currency (€ 1.234,56)
 */
export function formatCurrency(value) {
  if (value == null || isNaN(value)) return '€ 0,00';
  return euroFormatter.format(value);
}

/**
 * Format a number with Italian thousands separator (1.234,56)
 */
export function formatNumber(value, decimals = 2) {
  if (value == null || isNaN(value)) return '0,00';
  if (decimals === 0) return intFormatter.format(value);
  return numberFormatter.format(value);
}

/**
 * Format a number as percentage (12,34%)
 */
export function formatPercent(value) {
  if (value == null || isNaN(value)) return '0,00%';
  // value is already a ratio (e.g., 0.1234 = 12.34%)
  return pctFormatter.format(value);
}

/**
 * Format percentage from a raw value that is already in percentage terms
 * e.g. 12.34 → "12,34%"
 */
export function formatPct(value) {
  if (value == null || isNaN(value)) return '0,00%';
  return numberFormatter.format(value) + '%';
}

/**
 * Format a number as a ratio (e.g. 1,50x)
 */
export function formatRatio(value) {
  if (value == null || isNaN(value)) return '0,00x';
  return numberFormatter.format(value) + 'x';
}

/**
 * Parse an Italian-formatted number string back to a float.
 * Handles: "1.234,56" → 1234.56, "1234.56" → 1234.56
 */
export function parseItalianNumber(str) {
  if (typeof str === 'number') return str;
  if (!str || typeof str !== 'string') return 0;
  str = str.trim().replace(/[€\s]/g, '');
  // If it has both . and , — Italian format
  if (str.includes('.') && str.includes(',')) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (str.includes(',') && !str.includes('.')) {
    str = str.replace(',', '.');
  }
  const val = parseFloat(str);
  return isNaN(val) ? 0 : val;
}

/**
 * Get CSS class for amount display
 */
export function amountClass(value) {
  if (value > 0) return 'amount positive';
  if (value < 0) return 'amount negative';
  return 'amount';
}

/**
 * Format a date
 */
export function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
