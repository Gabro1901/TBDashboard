import { getVariableDescriptions } from './kpiEngine.js';

/**
 * Initializes the formula builder UI on a given input element.
 * @param {HTMLInputElement} inputElement 
 */
export function initFormulaBuilder(inputElement) {
  if (inputElement.dataset.formulaBuilderInit) return;
  inputElement.dataset.formulaBuilderInit = 'true';

  const variables = getVariableDescriptions();
  const operators = ['+', '-', '*', '/', '(', ')'];

  // Wrap the input if it's not already in a wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'formula-builder-wrapper';
  inputElement.parentNode.insertBefore(wrapper, inputElement);
  wrapper.appendChild(inputElement);

  // Dropdown element
  const dropdown = document.createElement('div');
  dropdown.className = 'autocomplete-dropdown';
  wrapper.appendChild(dropdown);

  // Toolbar element
  const toolbar = document.createElement('div');
  toolbar.className = 'formula-toolbar';
  wrapper.appendChild(toolbar);

  // Populate Toolbar
  operators.forEach(op => {
    const chip = document.createElement('div');
    chip.className = 'formula-chip operator';
    chip.textContent = op;
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      insertTextAtCursor(inputElement, ` ${op} `);
    });
    toolbar.appendChild(chip);
  });

  variables.forEach(v => {
    const chip = document.createElement('div');
    chip.className = 'formula-chip variable';
    chip.textContent = v.name;
    chip.title = v.description;
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      insertTextAtCursor(inputElement, v.name);
    });
    toolbar.appendChild(chip);
  });

  // Autocomplete Logic
  let selectedIndex = -1;
  let currentMatches = [];
  let currentMatchStart = -1;
  let currentMatchEnd = -1;

  const closeDropdown = () => {
    dropdown.classList.remove('active');
    selectedIndex = -1;
  };

  const renderDropdown = () => {
    if (currentMatches.length === 0) {
      closeDropdown();
      return;
    }
    
    dropdown.innerHTML = currentMatches.map((v, i) => `
      <div class="autocomplete-item ${i === selectedIndex ? 'selected' : ''}" data-index="${i}">
        <span style="font-family: var(--font-mono); font-weight: 500;">${v.name}</span>
        <span class="autocomplete-item-desc">${v.description}</span>
      </div>
    `).join('');
    
    dropdown.classList.add('active');

    dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        // use mousedown to prevent input blur before insertion
        e.preventDefault();
        insertMatch(parseInt(item.dataset.index, 10));
      });
    });
  };

  const insertMatch = (index) => {
    if (index >= 0 && index < currentMatches.length) {
      const match = currentMatches[index].name;
      const val = inputElement.value;
      const before = val.substring(0, currentMatchStart);
      const after = val.substring(currentMatchEnd);
      
      inputElement.value = before + match + after;
      inputElement.focus();
      
      // Move cursor after the inserted text
      const newPos = currentMatchStart + match.length;
      inputElement.setSelectionRange(newPos, newPos);
      
      // Trigger input event to update any two-way bindings
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    }
    closeDropdown();
  };

  inputElement.addEventListener('input', (e) => {
    const val = inputElement.value;
    const cursorPos = inputElement.selectionStart;
    
    // Find the word currently being typed
    const textBeforeCursor = val.substring(0, cursorPos);
    const match = textBeforeCursor.match(/[a-zA-Z0-9_]+$/);
    
    if (match) {
      const typed = match[0].toLowerCase();
      currentMatchStart = match.index;
      currentMatchEnd = cursorPos;
      
      currentMatches = variables.filter(v => v.name.toLowerCase().includes(typed));
      selectedIndex = currentMatches.length > 0 ? 0 : -1;
      renderDropdown();
    } else {
      closeDropdown();
    }
  });

  inputElement.addEventListener('keydown', (e) => {
    if (!dropdown.classList.contains('active')) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % currentMatches.length;
      renderDropdown();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + currentMatches.length) % currentMatches.length;
      renderDropdown();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (selectedIndex >= 0) {
        insertMatch(selectedIndex);
      }
    } else if (e.key === 'Escape') {
      closeDropdown();
    }
  });

  inputElement.addEventListener('blur', () => {
    // Small timeout to allow mousedown on dropdown items to fire
    setTimeout(closeDropdown, 150);
  });
}

function insertTextAtCursor(input, text) {
  const startPos = input.selectionStart;
  const endPos = input.selectionEnd;
  const val = input.value;
  
  input.value = val.substring(0, startPos) + text + val.substring(endPos);
  input.focus();
  
  const newPos = startPos + text.length;
  input.setSelectionRange(newPos, newPos);
  
  // Trigger input event
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
