/**
 * MANAGER SHIFTS - Employee Picker
 * Manages employee selection in shift create/edit modal
 */

(function() {
  'use strict';

  const Config = window.ManagerShiftsConfig || {};
const RolePalette = window.ManagerShiftsRolePalette || {};
const Filters = window.ManagerShiftsFilters || {};
const { getEl, getPageData, getEmployeeCbs, createEmptyMessage } = Config;
const { renderRoleLegend, collectPositionsFromDom } = RolePalette;
const { rebuildPositionFilterOptions, updatePositionMulti } = Filters;

// State
let employeeBuckets = null;
let lastShiftPositionId = null;
let managerCurrentShifts = [];

function setManagerCurrentShifts(shifts) {
  managerCurrentShifts = shifts;
}

function initEmployeeBuckets() {
  if (employeeBuckets) return employeeBuckets;

  const list = getEl('employeeMultiList');
  employeeBuckets = new Map();
  if (!list) return employeeBuckets;

  for (const row of list.querySelectorAll('.employee-item')) {
    const pos = row.dataset.positionId || '';
    if (!employeeBuckets.has(pos)) employeeBuckets.set(pos, []);
    employeeBuckets.get(pos).push(row);
  }

  for (const c of [...list.children]) c.remove();

  return employeeBuckets;
}

function clearAllEmployeeSelections() {
  initEmployeeBuckets();
  employeeBuckets.forEach((rows) => {
    rows.forEach((row) => {
      const cb = row.querySelector('input[type="checkbox"]');
      if (cb) cb.checked = false;
    });
  });
}

function updateEmployeeMulti() {
  const boxes = getEmployeeCbs();
  const checked = boxes.filter((b) => b.checked);
  const chips = getEl('employeeMultiChips');
  if (!chips) return;

  chips.innerHTML = '';

  if (!checked.length) {
    const ph = document.createElement('span');
    ph.className = 'multiselect-placeholder';
    ph.id = 'employeeMultiPlaceholder';
    ph.textContent = getEl('shiftPosition')?.value ? 'Select employees' : 'Select role first';
    chips.appendChild(ph);
    return;
  }

  checked.forEach((cb) => {
    const label = cb.closest('label');
    const name = label?.dataset.employeeName || label?.textContent?.trim() || 'Employee';

    const chip = document.createElement('span');
    chip.className = 'employee-chip';

    const remove = document.createElement('span');
    remove.className = 'chip-remove';
    remove.setAttribute('role', 'button');
    remove.setAttribute('tabindex', '0');
    remove.setAttribute('aria-label', `Remove ${name}`);
    remove.dataset.employeeId = String(cb.value);
    remove.textContent = 'x';

    const text = document.createElement('span');
    text.className = 'chip-text';
    text.textContent = name;

    chip.appendChild(remove);
    chip.appendChild(text);
    chips.appendChild(chip);
  });
}

function selectAllEmployees(on) {
  document.querySelectorAll('#employeeMulti .employee-item input[type="checkbox"]').forEach((cb) => {
    if (cb.closest('.employee-item')?.classList.contains('hidden')) return;
    cb.checked = on;
  });
  updateEmployeeMulti();
}

function wireEmployeeChipRemovals() {
  const chips = getEl('employeeMultiChips');
  if (!chips) return;

  const removeById = (employeeId) => {
    const cb = getEmployeeCbs().find((b) => String(b.value) === String(employeeId));
    if (cb) {
      cb.checked = false;
      updateEmployeeMulti();
    }
  };

  chips.addEventListener('click', (e) => {
    const target = e.target.closest('.chip-remove');
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    removeById(target.dataset.employeeId);
  });

  chips.addEventListener('keydown', (e) => {
    const target = e.target.closest('.chip-remove');
    if (!target) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    removeById(target.dataset.employeeId);
  });
}

function filterEmployeePicker() {
  initEmployeeBuckets();
  const positionId = getEl('shiftPosition')?.value;
  const trigger = getEl('employeeMultiTrigger');
  const empty = getEl('employeeMultiEmpty');
  const list = getEl('employeeMultiList');

  const hasPosition = !!positionId;
  if (trigger) trigger.disabled = false;

  if (list) Array.from(list.children).forEach((c) => c.remove());

  if (!hasPosition) {
    lastShiftPositionId = null;
    clearAllEmployeeSelections();
    if (empty) {
      empty.textContent = 'Select role first';
      empty.classList.remove('hidden');
    }
    getEl('employeeMulti')?.classList.remove('open');
    updateEmployeeMulti();
    return;
  }

  const posKey = String(positionId);
  if (lastShiftPositionId !== posKey) {
    clearAllEmployeeSelections();
    lastShiftPositionId = posKey;
  }

  const rows = employeeBuckets.get(posKey) || [];
  rows.forEach((row) => {
    row.classList.remove('hidden');
    const cb = row.querySelector('input[type="checkbox"]');
    if (cb) cb.disabled = false;
    list?.appendChild(row);
  });

  if (empty) {
    if (rows.length === 0) {
      empty.textContent = 'No employees for this position';
      empty.classList.remove('hidden');
    } else {
      empty.classList.add('hidden');
    }
  }

  updateEmployeeMulti();
}

function rebuildShiftPositionOptions(positions) {
  const select = getEl('shiftPosition');
  if (!select) return;

  const prev = select.value;
  select.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select position...';
  select.appendChild(placeholder);

  positions.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = String(p.id);
    opt.textContent = p.name;
    select.appendChild(opt);
  });

  if (positions.some((p) => String(p.id) === String(prev))) select.value = String(prev);
}

function updateShiftPositionMultiLabel() {
  const label = getEl('shiftPositionMultiLabel');
  if (!label) return;
  const select = getEl('shiftPosition');
  const opt = select?.selectedOptions?.[0];
  label.textContent = opt?.value ? opt.textContent?.trim() || 'Select position...' : 'Select position...';
}

function setShiftPosition(value) {
  const select = getEl('shiftPosition');
  if (select) select.value = String(value || '');
  updateShiftPositionMultiLabel();
  select?.dispatchEvent(new Event('change', { bubbles: true }));
  window.closeAllMultiselects?.();
}

function rebuildShiftPositionMultiOptions(positions) {
  const menu = getEl('shiftPositionMultiMenu');
  if (!menu) return;
  menu.innerHTML = '';

  if (!positions.length) {
    menu.appendChild(createEmptyMessage('No positions yet.'));
    return;
  }

  positions.forEach((p) => {
    const item = document.createElement('label');
    item.className = 'multiselect-item';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'shiftPositionChoice';
    radio.value = String(p.id);
    radio.checked = String(getEl('shiftPosition')?.value || '') === String(p.id);
    radio.addEventListener('change', () => setShiftPosition(radio.value));

    item.appendChild(radio);
    item.appendChild(document.createTextNode(` ${p.name}`));
    menu.appendChild(item);
  });
}

async function refreshPositionsFromServer() {
  const url = getPageData()?.positionsListUrl;
  if (!url) return;

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return;
    const { positions: raw = [] } = await res.json().catch(() => ({}));
    const positions = raw
      .filter((p) => p?.is_active)
      .map(({ id, name, is_active }) => ({ id, name, is_active }))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

    rebuildPositionFilterOptions(positions);
    rebuildShiftPositionOptions(positions);
    rebuildShiftPositionMultiOptions(positions);
    updatePositionMulti();
    updateShiftPositionMultiLabel();
    renderRoleLegend(positions, managerCurrentShifts);
  } catch (e) {
    // ignore
  }
}

// Global exports for HTML onchange/onclick handlers
window.selectAllEmployees = selectAllEmployees;
window.filterEmployeePicker = filterEmployeePicker;
window.updateEmployeeMulti = updateEmployeeMulti;

window.ManagerShiftsEmployeePicker = {
  setManagerCurrentShifts,
  initEmployeeBuckets,
  clearAllEmployeeSelections,
  updateEmployeeMulti,
  selectAllEmployees,
  wireEmployeeChipRemovals,
  filterEmployeePicker,
  rebuildShiftPositionOptions,
  updateShiftPositionMultiLabel,
  setShiftPosition,
  rebuildShiftPositionMultiOptions,
  refreshPositionsFromServer,
};

})();
