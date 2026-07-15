// ═══════════════════════════════════════════
// AI SERVICE — Gemini API Integration
// ═══════════════════════════════════════════

import { store, CATEGORIES, getCategoryList } from '../data/store.js';
import { GoogleGenerativeAI } from 'https://esm.run/@google/generative-ai';

/**
 * Call Gemini API with a prompt.
 * @param {string} prompt
 * @param {number} [maxRetries=3]
 * @param {number} [initialDelay=2000]
 * @returns {Promise<string>} The text response
 */
async function callGemini(prompt, maxRetries = 3, initialDelay = 2000) {
  const apiKey = store.get('settings.geminiApiKey');
  if (!apiKey) {
    throw new Error('API Key Gemini non configurata. Vai nelle Impostazioni per inserirla.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

  let retries = 0;
  let delay = initialDelay;

  while (true) {
    try {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 8192,
        }
      });

      return result.response.text();
    } catch (err) {
      const isRateLimit = err.status === 429 || err.message.includes('429') || err.message.toLowerCase().includes('quota') || err.message.toLowerCase().includes('rate');
      
      if (isRateLimit && retries < maxRetries) {
        console.warn(`Rate limit raggiunto (429). Ritento tra ${delay}ms... (Tentativo ${retries + 1} di ${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        retries++;
        delay *= 2; // Exponential backoff
      } else {
        throw new Error(`Errore API Gemini: ${err.message}`);
      }
    }
  }
}

/**
 * Use AI to classify trial balance accounts into categories.
 * Returns a mapping of accountKey → categoryId AND reasoning for each.
 *
 * @param {Array<{glAccount: string, name: string, amount: number}>} trialBalance
 * @returns {Promise<{mapping: Object, reasonings: Object}>} mapping + AI reasoning per account
 */
export async function aiClassifyAccounts(trialBalance) {
  const categories = getCategoryList();
  const categoryList = categories.map(c => `- ${c.id}: ${c.label}`).join('\n');

  // 1. Group raw rows by document number to find counterparties
  const docGroups = new Map();
  for (const a of trialBalance) {
    if (a.documentNumber) {
      if (!docGroups.has(a.documentNumber)) {
        docGroups.set(a.documentNumber, []);
      }
      docGroups.get(a.documentNumber).push(a);
    }
  }

  // 2. Map account key -> Set of counterparty names
  const counterpartiesMap = new Map();
  for (const [docNum, entries] of docGroups.entries()) {
    if (entries.length < 2) continue;
    for (const entry of entries) {
      const entryKey = entry.glAccount || entry.name;
      if (!counterpartiesMap.has(entryKey)) {
        counterpartiesMap.set(entryKey, new Set());
      }
      for (const other of entries) {
        const otherKey = other.glAccount || other.name;
        if (otherKey !== entryKey) {
          counterpartiesMap.get(entryKey).add(other.name);
        }
      }
    }
  }

  // Deduplicate accounts to save tokens and avoid redundant classification
  const uniqueAccountsMap = new Map();
  for (const a of trialBalance) {
    const key = a.glAccount || a.name;
    if (!uniqueAccountsMap.has(key)) {
      uniqueAccountsMap.set(key, { glAccount: a.glAccount, name: a.name });
    }
  }

  const uniqueAccounts = Array.from(uniqueAccountsMap.values());
  const mapping = {};
  const reasonings = {};
  
  // Pre-fill mapping so the UI always knows the total number of accounts sent
  for (const acc of uniqueAccounts) {
    const k = acc.glAccount || acc.name;
    mapping[k] = 'UNMAPPED';
  }
  
  // Process in chunks to ensure all accounts are classified without hitting token limits
  const CHUNK_SIZE = 40;
  for (let i = 0; i < uniqueAccounts.length; i += CHUNK_SIZE) {
    const chunk = uniqueAccounts.slice(i, i + CHUNK_SIZE);
    
    const accounts = chunk.map((a, idx) => {
      const key = a.glAccount || a.name;
      const counterpartiesSet = counterpartiesMap.get(key);
      const counterparties = counterpartiesSet && counterpartiesSet.size > 0 
        ? Array.from(counterpartiesSet).slice(0, 3).join(', ') 
        : '';
      const docInfo = counterparties ? `, Contropartite rilevate: [${counterparties}]` : '';
      const dateInfo = a.date ? `, Data: ${a.date}` : '';
      
      return `[ID: ${idx + 1}] Codice: "${a.glAccount || ''}", Nome: "${a.name}"${dateInfo}${docInfo}`;
    }).join('\n');

    const prompt = `Sei un esperto contabile italiano. Devi classificare ciascun conto del bilancio di verifica nelle seguenti categorie:

${categoryList}

Ecco i conti da classificare:
${accounts}

ISTRUZIONI:
- Per ogni conto, rispondi con il formato esatto: ID|CATEGORY_ID|MOTIVAZIONE
- L'ID deve essere ESATTAMENTE il numero indicato tra [ID: X] (es. 1, 2, 3...)
- La MOTIVAZIONE deve essere brevissima (massimo 3-5 parole, es. "conto corrente", "debito fornitori", "ricavo vendite")
- Se un importo del fondo ammortamento è nel conto, classificalo come NON_CURRENT_ASSETS (è un contro-conto dell'attivo)
- Se il conto ti è sconosciuto, usa le informazioni (Data, Contropartite) per dedurne la natura. Applica questo schema investigativo:
  * Analizza la contropartita: il conto opposto (la contropartita) rivela quasi sempre la natura di quello sconosciuto.
  * Costo Operativo (OPEX): se tra le contropartite rilevate ci sono voci come "Debiti verso fornitori" (Accounts Payable), "Banca" (Cash/Bank) o simili, si tratta quasi certamente di un costo d'esercizio di competenza dell'anno (es. bollette/energia). Va in OPERATING_EXPENSES o categorie di costo simili.
  * Immobilizzazione (CAPEX): se la contropartita riguarda "Fornitori per cespiti", "Immobilizzazioni" o l'acquisto di asset a lungo termine, si tratta di una spesa capitalizzabile. Va in NON_CURRENT_ASSETS.
- Se non riesci a classificare un conto, usa UNMAPPED
- Rispondi SOLO con le righe nel formato richiesto, una per riga. Assicurati di classificare rigorosamente TUTTI i conti forniti in questo elenco.`;

    console.groupCollapsed('🤖 AI Classification Chunk');
    console.log('INPUT PROMPT:\n', prompt);
    
    const response = await callGemini(prompt);
    
    console.log('OUTPUT RESPONSE:\n', response);
    console.groupEnd();

    // Save to global logs for the UI page
    store.addAiLog({
      timestamp: new Date().toLocaleTimeString() + ' ' + new Date().toLocaleDateString(),
      prompt,
      response
    });

    const lines = response.trim().split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.includes('|')) continue;

      const parts = trimmed.split('|');
      if (parts.length >= 2) {
        // Extract digits from the first part to get the ID
        const idMatch = parts[0].replace(/[^\d]/g, '');
        const lineNum = parseInt(idMatch);
        const categoryId = parts[1].trim();
        const reasoning = parts.length >= 3 ? parts.slice(2).join('|').trim() : '';

        // Validate category
        if (CATEGORIES[categoryId]) {
          if (!isNaN(lineNum) && lineNum >= 1 && lineNum <= chunk.length) {
            const acc = chunk[lineNum - 1];
            const accountKey = acc.glAccount || acc.name;
            mapping[accountKey] = categoryId;
            if (reasoning) reasonings[accountKey] = reasoning;
          }
        }
      }
    }
  }

  return { mapping, reasonings };
}

/**
 * Use AI to generate a KPI formula from a natural language description.
 *
 * @param {string} description - User's description of the desired KPI
 * @returns {Promise<{name: string, formula: string, description: string, type: string}>}
 */
export async function aiGenerateKpi(description) {
  const prompt = `Sei un esperto analista finanziario. L'utente vuole creare un KPI personalizzato per la sua dashboard finanziaria.

Descrizione dell'utente: "${description}"

Le variabili disponibili per le formule sono:
- totaleAttivo: Totale attività
- totaleAttivoCorrente: Attività correnti
- totaleAttivoNonCorrente: Attività non correnti
- totalePassivo: Totale passività
- totalePassivoCorrente: Passività correnti
- totalePassivoNonCorrente: Passività non correnti
- patrimonioNetto: Patrimonio netto
- ricavi: Ricavi totali
- costoVenduto: Costo del venduto
- costiOperativi: Costi operativi totali
- ammortamenti: Ammortamenti e svalutazioni
- proventiFinanziari: Proventi finanziari
- oneriFinanziari: Oneri finanziari
- imposte: Imposte
- utileNetto: Utile (o perdita) netto
- ebitda: EBITDA
- ebit: EBIT (Risultato operativo)
- margineContribuzione: Ricavi - Costo del venduto
- crediti: Crediti commerciali
- debiti: Debiti commerciali
- rimanenze: Rimanenze
- cassa: Disponibilità liquide

Operatori disponibili: +, -, *, /, (, ), abs()
Per le percentuali, moltiplica per 100.

Rispondi SOLO con un JSON valido nel seguente formato (senza markdown, senza backticks):
{
  "name": "Nome del KPI in italiano",
  "formula": "espressione matematica usando le variabili sopra",
  "description": "Breve spiegazione del KPI e della sua utilità",
  "type": "percentage|currency|ratio|days"
}

Esempio per "margine di profitto netto":
{"name":"Margine di Profitto Netto","formula":"(utileNetto / ricavi) * 100","description":"Misura la percentuale di utile netto rispetto ai ricavi totali.","type":"percentage"}`;

  const response = await callGemini(prompt);

  // Extract JSON from response (handle possible markdown wrapping)
  let jsonStr = response.trim();
  // Remove markdown code fences if present
  jsonStr = jsonStr.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
  jsonStr = jsonStr.trim();

  try {
    const result = JSON.parse(jsonStr);
    return {
      name: result.name || 'KPI Custom',
      formula: result.formula || '',
      description: result.description || '',
      type: result.type || 'ratio',
    };
  } catch (e) {
    return { name: 'KPI Custom', formula: '', description: '', type: 'ratio' };
  }
}

/**
 * Use AI to deduce classification rules (e.g. prefix rules) from successfully mapped accounts.
 *
 * @param {Array<{glAccount: string, name: string, categoryId: string}>} mappedAccounts
 * @returns {Promise<Array<{prefix: string, categoryId: string, label: string}>>}
 */
export async function aiDeduceRules(mappedAccounts) {
  if (!mappedAccounts || mappedAccounts.length === 0) return [];

  const categories = getCategoryList();
  const categoryList = categories.map(c => `- ${c.id}: ${c.label}`).join('\n');

  const accountsList = mappedAccounts
    .filter(a => a.glAccount && a.categoryId && a.categoryId !== 'UNMAPPED')
    .map(a => `${a.glAccount} -> ${a.categoryId} (${a.name})`)
    .join('\n');

  if (!accountsList) {
    return [];
  }

  const prompt = `Analizza i conti e deduci le regole dei prefissi dei codici GL.
Categorie:
${categoryList}

Conti:
${accountsList}

Istruzioni:
- Cerca prefissi numerici (2-3 cifre). Evita regole da 1 cifra.
- Restituisci SOLO testo, una regola per riga nel formato: PREFISSO|CATEGORY_ID|Descrizione in italiano
Esempio:
10|CURRENT_ASSETS|Cassa
11|CURRENT_ASSETS|Crediti`;

  let response;
  try {
    response = await callGemini(prompt);
  } catch (err) {
    console.error(`Errore deduzione regole: ${err.message}`);
    return [];
  }
  
  store.addAiLog({
    timestamp: new Date().toLocaleTimeString() + ' ' + new Date().toLocaleDateString(),
    prompt: "[RULE DEDUCTION PROMPT]\n" + prompt,
    response: response
  });

  const rules = [];
  const lines = response.trim().split('\n');
  for (const line of lines) {
    const parts = line.split('|').map(p => p.trim());
    if (parts.length >= 3) {
      const prefix = String(parts[0]).replace(/[^0-9]/g, '');
      const categoryId = parts[1];
      const label = parts.slice(2).join(' ');
      
      if (prefix && CATEGORIES[categoryId]) {
        rules.push({ prefix, categoryId, label });
      }
    }
  }

  console.log(`Regole dedotte:\\n${JSON.stringify(rules, null, 2)}`);
  return rules;
}

/**
 * Check if the Gemini API key is configured.
 */
export function isAiConfigured() {
  const key = store.get('settings.geminiApiKey');
  return !!(key && key.trim());
}

/**
 * Use AI to automatically fix account mappings to resolve cash flow discrepancies.
 */
export async function aiFixCashFlow(diagnosticData, trialBalance, currentMapping) {
  const categories = getCategoryList();
  const categoryList = categories.map(c => `- ${c.id}: ${c.label} (Tipo: ${c.type}, Sezione: ${c.section})`).join('\n');

  const uniqueAccountsMap = new Map();
  for (const a of trialBalance) {
    const key = a.glAccount || a.name;
    if (!uniqueAccountsMap.has(key)) {
      uniqueAccountsMap.set(key, { glAccount: a.glAccount, name: a.name, amount: Math.abs(a.amount), currentCat: currentMapping[key] || 'UNMAPPED' });
    }
  }
  const uniqueAccounts = Array.from(uniqueAccountsMap.values());

  const prompt = `Sei un revisore contabile esperto. Il rendiconto finanziario presenta una squadratura.
Il diagnostico segnala:
- Sbilancio patrimoniale/errori di mappatura: €${diagnosticData.closingGap}
- Conti non mappati: ${diagnosticData.unmappedAccounts.length}
- Variazioni omesse: ${diagnosticData.omittedVariations.length}

Ecco l'elenco dei conti presenti a bilancio con la loro mappatura attuale:
${uniqueAccounts.map((a, i) => `[ID: ${i+1}] "${a.glAccount || ''} - ${a.name}": ${a.currentCat}`).join('\n')}

Categorie disponibili per la mappatura:
${categoryList}

Il tuo compito:
Trova gli errori di mappatura (es. conti patrimoniali mappati a conto economico, crediti mappati come debiti, o conti UNMAPPED) e correggili per risolvere la squadratura.

Rispondi SOLO con le correzioni, una per riga, nel formato esatto:
ID|NUOVA_CATEGORIA|MOTIVAZIONE_DELLA_CORREZIONE

Se un conto è già mappato correttamente, NON includerlo nella risposta. Restituisci solo le modifiche necessarie.`;

  console.groupCollapsed('🤖 AI Cash Flow Fix');
  console.log('INPUT PROMPT:\n', prompt);
  
  const response = await callGemini(prompt);
  
  console.log('OUTPUT RESPONSE:\n', response);
  console.groupEnd();

  store.addAiLog({
    timestamp: new Date().toLocaleTimeString() + ' ' + new Date().toLocaleDateString(),
    prompt,
    response
  });

  const lines = response.trim().split('\n');
  const newMapping = { ...currentMapping };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes('|')) continue;

    const parts = trimmed.split('|');
    if (parts.length >= 2) {
      const idMatch = parts[0].replace(/[^\\d]/g, '');
      const lineNum = parseInt(idMatch);
      const categoryId = parts[1].trim();

      if (CATEGORIES[categoryId]) {
        if (!isNaN(lineNum) && lineNum >= 1 && lineNum <= uniqueAccounts.length) {
          const acc = uniqueAccounts[lineNum - 1];
          const accountKey = acc.glAccount || acc.name;
          newMapping[accountKey] = categoryId;
        }
      }
    }
  }

  return { mapping: newMapping };
}
