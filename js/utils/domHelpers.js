import morphdom from 'https://unpkg.com/morphdom@2.7.4/dist/morphdom-esm.js';

/**
 * Aggiorna il DOM in modo efficiente usando morphdom.
 * Preserva lo stato del browser (focus, cursore, selezione) diffando 
 * l'HTML generato con il DOM esistente.
 * 
 * @param {HTMLElement} container Il nodo contenitore da aggiornare
 * @param {string} newHTML La stringa HTML con il nuovo contenuto
 */
export function updateDOM(container, newHTML) {
  // Creiamo un nodo temporaneo identico al container
  const tempNode = container.cloneNode(false);
  tempNode.innerHTML = newHTML;

  morphdom(container, tempNode, {
    childrenOnly: true,
    onBeforeElUpdated: function(fromEl, toEl) {
      // Preserva il focus e il valore per gli input attivi 
      // se l'utente ci sta digitando attivamente
      if (fromEl === document.activeElement && 
         (fromEl.tagName === 'INPUT' || fromEl.tagName === 'TEXTAREA')) {
        toEl.value = fromEl.value; // non sovrascrivere ciò che l'utente sta digitando in tempo reale
      }
      
      // Evita aggiornamenti inutili se l'elemento è identico
      if (fromEl.isEqualNode(toEl)) {
        return false;
      }
      return true;
    }
  });
}
