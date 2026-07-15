import { store } from '../data/store.js';
import { computeKpi } from '../utils/kpiEngine.js';
import { formatCurrency } from '../utils/formatters.js';
import { showToast } from '../utils/toast.js';
import { initFormulaBuilder } from '../utils/formulaAutocomplete.js';
import { createModal } from '../utils/uiComponents.js';

export let charts = {};

export function destroyAllCharts() {
  Object.keys(charts).forEach(id => {
    charts[id].destroy();
    delete charts[id];
  });
  charts = {};
}

export function renderCharts(aggA, aggB) {
  if (!window.Chart) {
    console.warn('Chart.js non caricato');
    return;
  }

  // Common chart styling to match our UI
  Chart.defaults.color = '#94a3b8'; // text-muted
  Chart.defaults.font.family = "'Inter', -apple-system, sans-serif";
  Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15, 23, 42, 0.9)';
  Chart.defaults.plugins.tooltip.padding = 12;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
  Chart.defaults.plugins.tooltip.titleFont = { size: 14, weight: 600 };
  Chart.defaults.plugins.tooltip.bodyFont = { size: 13 };

  const dashboardCharts = store.state.dashboardCharts || [];
  const activeIds = new Set(dashboardCharts.map(c => c.id));

  // 1. Destroy charts that are no longer in dashboardCharts
  Object.keys(charts).forEach(id => {
    if (!activeIds.has(id)) {
      charts[id].destroy();
      delete charts[id];
    }
  });

  // Ensure charts is an object (in case it was initialized as array somewhere or not reset)
  if (Array.isArray(charts)) {
    charts = {};
  }
  
  const hasComparison = !!aggB;

  dashboardCharts.forEach(chartDef => {
    const canvas = document.getElementById(`canvas-${chartDef.id}`);
    if (!canvas) return;

    const labels = [];
    const dataValuesA = [];
    const dataValuesB = hasComparison ? [] : null;
    
    chartDef.dataPoints.forEach(dp => {
      labels.push(dp.label);
      dataValuesA.push(computeKpi({ formula: dp.formula }, aggA));
      if (hasComparison) {
         dataValuesB.push(computeKpi({ formula: dp.formula }, aggB));
      }
    });

    const isWaterfall = chartDef.type === 'bar' && chartDef.name.toLowerCase().includes('waterfall');
    
    let backgroundColorsA, backgroundColorsB;
    if (chartDef.type === 'doughnut' || chartDef.type === 'pie') {
      backgroundColorsA = ['#f59e0b', '#f43f5e', '#8b5cf6', '#64748b', '#10b981', '#3b82f6', '#ec4899', '#14b8a6'];
      backgroundColorsB = backgroundColorsA.map(c => c + '80'); // slightly transparent for B
    } else {
      if (isWaterfall) {
         backgroundColorsA = dataValuesA.map(v => v >= 0 ? 'rgba(16, 185, 129, 0.8)' : 'rgba(244, 63, 94, 0.8)');
         if (hasComparison) backgroundColorsB = dataValuesB.map(v => v >= 0 ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)');
      } else {
         backgroundColorsA = 'rgba(99, 102, 241, 0.8)';
         backgroundColorsB = 'rgba(244, 63, 94, 0.8)'; // Different color for period B in normal bar charts
      }
    }
    
    const datasets = [{
      label: hasComparison ? 'Periodo A' : 'Valore',
      data: dataValuesA,
      backgroundColor: backgroundColorsA,
      borderWidth: chartDef.type === 'bar' ? 0 : 1,
      borderRadius: chartDef.type === 'bar' ? 4 : 0,
    }];
    
    // Only add comparison dataset for Bar charts for clarity, or doughnut if it supports it (it usually renders as an outer ring).
    if (hasComparison && chartDef.type === 'bar') {
      datasets.push({
        label: 'Periodo B',
        data: dataValuesB,
        backgroundColor: backgroundColorsB,
        borderWidth: 0,
        borderRadius: 4,
      });
    }

    const existingChart = charts[chartDef.id];

    // If chart exists and type hasn't changed, update its data and options
    if (existingChart && existingChart.config.type === chartDef.type) {
      existingChart.data.labels = labels;
      existingChart.data.datasets = datasets;
      
      existingChart.options.plugins.legend.display = chartDef.type !== 'bar' || hasComparison;
      
      // Update scales configuration
      if (chartDef.type === 'bar') {
        existingChart.options.scales = {
          y: { beginAtZero: true, grid: { color: 'rgba(255, 255, 255, 0.05)' } },
          x: { grid: { display: false } }
        };
      } else {
        existingChart.options.scales = {
          y: { display: false },
          x: { display: false }
        };
      }
      
      existingChart.update();
    } else {
      // If chart exists but type changed, destroy it first
      if (existingChart) {
        existingChart.destroy();
      }

      // Create new chart instance
      charts[chartDef.id] = new Chart(canvas, {
        type: chartDef.type,
        data: {
          labels: labels,
          datasets: datasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: chartDef.type === 'doughnut' ? '65%' : undefined,
          plugins: {
            legend: { 
              display: chartDef.type !== 'bar' || hasComparison,
              position: 'right' 
            },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${formatCurrency(ctx.raw)}`
              }
            }
          },
          scales: chartDef.type === 'bar' ? {
            y: { beginAtZero: true, grid: { color: 'rgba(255, 255, 255, 0.05)' } },
            x: { grid: { display: false } }
          } : {
            y: { display: false },
            x: { display: false }
          }
        }
      });
    }
  });
}

export function openChartModal(id, onSaved) {
  const isEditing = !!id;
  const chart = isEditing 
    ? store.state.dashboardCharts.find(c => c.id === id)
    : { name: '', type: 'bar', dataPoints: [{ label: '', formula: '' }] };

  if (!chart && isEditing) return;

  const contentHTML = `
    <div style="display: grid; grid-template-columns: 2fr 1fr; gap: var(--space-3); margin-bottom: var(--space-4);">
      <div class="form-group">
        <label class="form-label">Nome Grafico</label>
        <input type="text" id="chart-name" class="form-input" value="${chart.name.replace(/"/g, '&quot;')}" placeholder="es. Margine vs Costi">
      </div>
      <div class="form-group">
        <label class="form-label">Tipo di Grafico</label>
        <select id="chart-type" class="form-select">
          <option value="bar" ${chart.type === 'bar' ? 'selected' : ''}>Barre (Bar)</option>
          <option value="doughnut" ${chart.type === 'doughnut' ? 'selected' : ''}>Ciambella (Doughnut)</option>
          <option value="pie" ${chart.type === 'pie' ? 'selected' : ''}>Torta (Pie)</option>
        </select>
      </div>
    </div>
    
    <h4 style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); margin-bottom: var(--space-3);">Serie Dati</h4>
    <div id="chart-datapoints-container" style="padding-right: var(--space-2); margin-bottom: var(--space-3);">
    </div>
    
    <button class="btn btn-ghost btn-sm" id="btn-add-datapoint" style="width: 100%; border: 1px dashed var(--glass-border);">
      <i data-lucide="plus" style="width:14px;height:14px;margin-right:6px;"></i> Aggiungi Serie
    </button>
  `;

  const footerHTML = `
    <button class="btn btn-primary" id="btn-save-chart">Salva Grafico</button>
  `;

  const { overlay, close } = createModal({
    title: isEditing ? 'Modifica Grafico' : 'Nuovo Grafico',
    contentHTML,
    footerHTML,
    contentStyle: 'max-width: 600px;'
  });

  let currentDataPoints = [...chart.dataPoints];
  const dpContainer = overlay.querySelector('#chart-datapoints-container');

  const renderDataPoints = () => {
    dpContainer.innerHTML = currentDataPoints.map((dp, i) => `
      <div class="datapoint-row" data-index="${i}" style="display: flex; gap: var(--space-2); margin-bottom: var(--space-2); align-items: center;">
        <input type="text" class="form-input dp-label" value="${dp.label.replace(/"/g, '&quot;')}" placeholder="Etichetta (es. Ricavi)">
        <input type="text" class="form-input dp-formula" value="${dp.formula.replace(/"/g, '&quot;')}" placeholder="Formula (es. ricavi + altriRicavi)">
        <button class="btn btn-ghost btn-icon btn-sm btn-remove-dp" ${currentDataPoints.length === 1 ? 'disabled' : ''}><i data-lucide="trash-2" style="width: 14px; height: 14px; color: var(--danger-500);"></i></button>
      </div>
    `).join('');
    if (window.lucide) window.lucide.createIcons({ root: dpContainer });

    dpContainer.querySelectorAll('.btn-remove-dp').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        saveCurrentValues();
        currentDataPoints.splice(i, 1);
        renderDataPoints();
      });
    });

    dpContainer.querySelectorAll('.dp-formula').forEach(input => {
      initFormulaBuilder(input);
    });
  };

  const saveCurrentValues = () => {
    const rows = dpContainer.querySelectorAll('.datapoint-row');
    rows.forEach((row, i) => {
      currentDataPoints[i] = {
        label: row.querySelector('.dp-label').value,
        formula: row.querySelector('.dp-formula').value
      };
    });
  };

  renderDataPoints();

  overlay.querySelector('#btn-add-datapoint').addEventListener('click', () => {
    saveCurrentValues();
    currentDataPoints.push({ label: '', formula: '' });
    renderDataPoints();
  });

  overlay.querySelector('#btn-save-chart').addEventListener('click', () => {
    const name = overlay.querySelector('#chart-name').value.trim();
    const type = overlay.querySelector('#chart-type').value;
    saveCurrentValues();
    
    // Filter out empty data points
    const validDataPoints = currentDataPoints.filter(dp => dp.label.trim() && dp.formula.trim());
    
    if (!name) {
      showToast('Il nome del grafico è obbligatorio', 'warning');
      return;
    }
    
    if (validDataPoints.length === 0) {
      showToast('Aggiungi almeno una serie di dati valida', 'warning');
      return;
    }

    if (isEditing) {
      store.updateChart(id, { name, type, dataPoints: validDataPoints });
      showToast('Grafico modificato con successo', 'success');
    } else {
      store.addChart({
        id: 'chart_' + Math.random().toString(36).substr(2, 9),
        name,
        type,
        dataPoints: validDataPoints
      });
      showToast('Grafico aggiunto', 'success');
    }
    close();
    if (onSaved) onSaved();
  });
}
