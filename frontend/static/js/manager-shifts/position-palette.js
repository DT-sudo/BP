/**
 * MANAGER SHIFTS - Position Color Palette System
 * Generates consistent colors for positions based on their ID
 */

(function() {
  'use strict';

  const Config = window.ManagerShiftsConfig || {};
const { getEl } = Config;

function computePositionPalette(positionId) {
  const n = parseInt(positionId, 10);
  if (!Number.isFinite(n)) return null;

  const hue = ((n * 47) % 360 + 360) % 360;
  const bg = `hsl(${hue} 80% 92%)`;
  const border = `hsl(${hue} 70% 45%)`;
  const fg = `hsl(${hue} 60% 20%)`;
  return { bg, border, fg };
}

function applyPositionPaletteToElement(el, positionId) {
  const palette = computePositionPalette(positionId);
  if (!el || !palette) return;
  el.classList.add('shift-chip-position');
  el.style.setProperty('--position-bg', palette.bg);
  el.style.setProperty('--position-border', palette.border);
  el.style.setProperty('--position-fg', palette.fg);
}

function collectPositionsFromDom() {
  const menu = document.querySelector('#positionMulti .multiselect-menu');
  if (!menu) return [];
  return Array.from(menu.querySelectorAll('label.multiselect-item input[name="positions"]'))
    .map((cb) => ({
      id: cb.value,
      name: (cb.parentElement?.textContent || '').trim(),
      is_active: true,
    }))
    .filter((p) => p.id && p.name);
}

function renderPositionLegend(positions, shifts) {
  const card = getEl('positionLegendCard');
  const root = getEl('positionLegend');
  if (!root) return;
  root.innerHTML = '';

  const list = Array.isArray(positions) ? positions : [];
  const active = list.filter((p) => p && (p.is_active === undefined || p.is_active));

  const currentShifts = Array.isArray(shifts) ? shifts : [];
  const presentPublishedPositionIds = new Set(
    currentShifts
      .filter((s) => s && String(s.status || '').toLowerCase() !== 'draft')
      .map((s) => (s ? s.position_id : null))
      .filter((v) => v !== null && v !== undefined && v !== '')
      .map((v) => String(v)),
  );

  const hasDraft = currentShifts.some((s) => s && String(s.status || '').toLowerCase() === 'draft');

  const visiblePositions = active
    .filter((p) => presentPublishedPositionIds.has(String(p.id)))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

  if (!visiblePositions.length && !hasDraft) {
    card?.classList.add('hidden');
    window.requestAnimationFrame(() => window.managerSyncStickyOffsets?.());
    return;
  }

  card?.classList.remove('hidden');

  if (hasDraft) {
    const draftItem = document.createElement('div');
    draftItem.className = 'position-legend-item position-legend-item-draft';

    const draftSwatch = document.createElement('span');
    draftSwatch.className = 'position-swatch position-swatch-draft';
    draftSwatch.setAttribute('aria-hidden', 'true');

    const draftLabel = document.createElement('span');
    draftLabel.className = 'position-legend-label';
    draftLabel.textContent = 'Draft';

    draftItem.appendChild(draftSwatch);
    draftItem.appendChild(draftLabel);
    root.appendChild(draftItem);
  }

  visiblePositions.forEach((p) => {
    const item = document.createElement('div');
    item.className = 'position-legend-item';

    const swatch = document.createElement('span');
    swatch.className = 'position-swatch';
    applyPositionPaletteToElement(swatch, p.id);

    const label = document.createElement('span');
    label.className = 'position-legend-label';
    label.textContent = p.name || '';

    item.appendChild(swatch);
    item.appendChild(label);
    root.appendChild(item);
  });

  window.requestAnimationFrame(() => window.managerSyncStickyOffsets?.());
}

window.ManagerShiftsPositionPalette = {
  computePositionPalette,
  applyPositionPaletteToElement,
  collectPositionsFromDom,
  renderPositionLegend,
};

})();
