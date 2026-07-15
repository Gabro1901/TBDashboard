// ═══════════════════════════════════════════
// NARRATIVE ENGINE — Commenti Analitici
// ═══════════════════════════════════════════

import { formatCurrency } from './formatters.js';

/**
 * Genera un commento analitico basato sul confronto tra due set di aggregati.
 * 
 * @param {Object} aggregatesA - Aggregati del periodo principale (o periodo corrente)
 * @param {Object} aggregatesB - Aggregati del periodo di confronto (o periodo precedente)
 * @returns {string} - Il testo del commento analitico
 */
export function generateNarrativeReport(aggregatesA, aggregatesB) {
  if (!aggregatesA || !aggregatesB) {
    return "Seleziona un Periodo B di confronto per generare il commento analitico.";
  }

  const varRicavi = calculateVariance(aggregatesA.ricavi, aggregatesB.ricavi);
  const varCostiOp = calculateVariance(aggregatesA.costiOperativi, aggregatesB.costiOperativi);
  
  // Calculate EBITDA
  const ebitdaA = (aggregatesA.margineContribuzione || 0) - (aggregatesA.costiOperativi || 0);
  const ebitdaB = (aggregatesB.margineContribuzione || 0) - (aggregatesB.costiOperativi || 0);
  const varEbitda = calculateVariance(ebitdaA, ebitdaB);

  let paragraphs = [];

  // Analisi Ricavi
  if (Math.abs(varRicavi.percent) > 0.5) {
    const dirRicavi = varRicavi.diff > 0 ? "hanno registrato una crescita" : "hanno subito una contrazione";
    paragraphs.push(`I ricavi delle vendite ${dirRicavi} del ${Math.abs(varRicavi.percent).toFixed(1)}% rispetto al periodo precedente, attestandosi a ${formatCurrency(aggregatesA.ricavi)}.`);
  } else {
    paragraphs.push(`I ricavi delle vendite si sono mantenuti stabili rispetto al periodo precedente (${formatCurrency(aggregatesA.ricavi)}).`);
  }

  // Analisi Costi Operativi e marginalità (EBITDA)
  if (varCostiOp.percent > 0 && varEbitda.percent < 0) {
    // Esatto scenario del checkpoint
    paragraphs.push(`L'incremento dei costi operativi del ${varCostiOp.percent.toFixed(1)}% ha compresso il margine operativo lordo (EBITDA) del ${Math.abs(varEbitda.percent).toFixed(1)}% rispetto al periodo precedente.`);
  } else if (varCostiOp.percent < 0 && varEbitda.percent > 0) {
    paragraphs.push(`La riduzione dei costi operativi del ${Math.abs(varCostiOp.percent).toFixed(1)}% ha favorito un'espansione del margine operativo lordo (EBITDA) del ${varEbitda.percent.toFixed(1)}% rispetto al periodo precedente.`);
  } else {
    const dirCosti = varCostiOp.diff > 0 ? "un aumento" : "una diminuzione";
    const dirEbitda = varEbitda.diff > 0 ? "è cresciuto" : "ha registrato una flessione";
    
    paragraphs.push(`I costi operativi hanno mostrato ${dirCosti} del ${Math.abs(varCostiOp.percent).toFixed(1)}%. Di conseguenza, il margine operativo lordo (EBITDA) ${dirEbitda} del ${Math.abs(varEbitda.percent).toFixed(1)}%, raggiungendo il valore di ${formatCurrency(ebitdaA)}.`);
  }

  // Analisi Utile Netto
  const utileA = aggregatesA.utileNetto || 0;
  const utileB = aggregatesB.utileNetto || 0;
  const varUtile = calculateVariance(utileA, utileB);
  
  if (utileA > 0 && utileB > 0) {
    const dirUtile = varUtile.diff > 0 ? "un miglioramento" : "un peggioramento";
    paragraphs.push(`L'utile netto di periodo evidenzia ${dirUtile} del ${Math.abs(varUtile.percent).toFixed(1)}%, portandosi a ${formatCurrency(utileA)}.`);
  } else if (utileA < 0 && utileB >= 0) {
    paragraphs.push(`L'esercizio ha chiuso con una perdita netta di ${formatCurrency(utileA)}, in peggioramento rispetto all'utile del periodo precedente.`);
  } else if (utileA >= 0 && utileB < 0) {
    paragraphs.push(`L'esercizio ha chiuso con un utile netto di ${formatCurrency(utileA)}, riportando la gestione in territorio positivo rispetto alla perdita del periodo precedente.`);
  }

  return paragraphs.join(" ");
}

/**
 * Calcola la variazione assoluta e percentuale tra due valori
 */
function calculateVariance(current, previous) {
  const currentVal = current || 0;
  const previousVal = previous || 0;
  const diff = currentVal - previousVal;
  let percent = 0;
  
  if (previousVal !== 0) {
    percent = (diff / Math.abs(previousVal)) * 100;
  } else if (currentVal !== 0) {
    percent = currentVal > 0 ? 100 : -100;
  }

  return { diff, percent };
}
