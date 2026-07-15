// ═══════════════════════════════════════════
// ACCOUNT HELPERS — Aggregation & grouping utilities
// ═══════════════════════════════════════════

import { store, CATEGORIES } from '../data/store.js';

/**
 * Aggregate trial balance rows by G/L Account.
 * Multiple rows sharing the same glAccount are merged into one,
 * summing their amounts. The "name" is taken from the first occurrence.
 *
 * @param {Array<{glAccount: string, name: string, amount: number}>} trialBalance
 * @returns {Array<{glAccount: string, name: string, amount: number, rowCount: number, rows: Array}>}
 */
export function aggregateByGLAccount(trialBalance) {
  const accountMap = new Map();

  for (const entry of trialBalance) {
    const key = entry.glAccount || entry.name;

    if (accountMap.has(key)) {
      const existing = accountMap.get(key);
      existing.amount += entry.amount;
      existing.rowCount++;
      existing.rows.push(entry);
    } else {
      accountMap.set(key, {
        glAccount: entry.glAccount,
        name: entry.name,
        amount: entry.amount,
        rowCount: 1,
        rows: [entry],
        date: entry.date,
      });
    }
  }

  return Array.from(accountMap.values());
}

/**
 * Aggregate trial balance rows by G/L Account and group them by category.
 * Returns an object keyed by categoryId, each containing aggregated accounts.
 *
 * @param {Array} trialBalance
 * @param {Object} accountMapping - glAccount → categoryId
 * @returns {Object} { [categoryId]: { category, accounts: AggregatedAccount[], total } }
 */
export function groupAggregatedByCategory(trialBalance, accountMapping) {
  const aggregated = aggregateByGLAccount(trialBalance);

  const groups = {};
  for (const catId of Object.keys(CATEGORIES)) {
    groups[catId] = {
      category: CATEGORIES[catId],
      accounts: [],
      total: 0,
    };
  }

  for (const account of aggregated) {
    const key = account.glAccount || account.name;
    const catId = accountMapping[key] || 'UNMAPPED';
    const group = groups[catId] || groups.UNMAPPED;

    group.accounts.push(account);
    group.total += account.amount;
  }

  return groups;
}

/**
 * Get aggregated accounts filtered by a specific section (bs/is).
 *
 * @param {Array} trialBalance
 * @param {Object} accountMapping
 * @param {string} section - 'bs' or 'is'
 * @returns {Object} { [categoryId]: { category, accounts, total } }
 */
export function getAggregatedBySection(trialBalance, accountMapping, section) {
  const groups = groupAggregatedByCategory(trialBalance, accountMapping);

  const filtered = {};
  for (const [catId, group] of Object.entries(groups)) {
    if (group.category.section === section) {
      filtered[catId] = group;
    }
  }

  return filtered;
}
