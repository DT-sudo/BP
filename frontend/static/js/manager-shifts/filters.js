(function() {
  'use strict';

  const Config = window.ManagerShiftsConfig || {};
const { getEl, getPositionCbs, createEmptyMessage } = Config;

let managerMultiselectHooksWired = false;

function buildManagerFiltersUrl() {
  const form = getEl('managerFiltersForm');
  if (!form) return null;

  const url = new URL(form.action || window.location.pathname, window.location.origin);
  const params = new URLSearchParams();

  const data = new FormData(form);
  for (const [key, value] of data.entries()) {
    params.append(key, String(value));
  }

  const positionBoxes = Array.from(form.querySelectorAll('#positionMulti input[type="checkbox"][name="positions"]'));
  if (positionBoxes.length) {
    const checkedCount = positionBoxes.filter((cb) => cb.checked).length;
    if (checkedCount === positionBoxes.length) params.delete('positions');
  }

  if ((params.get('status') || '') === '') params.delete('status');
  if ((params.get('show') || '') === '') params.delete('show');

  url.search = params.toString();
  return url.toString();
}

function submitManagerFiltersForm() {
  const url = buildManagerFiltersUrl();
  if (!url) return;
  window.location.assign(url);
}

function submitFilters() {
  window.closeAllMultiselects?.('programmatic');
  submitManagerFiltersForm();
}

function markPositionMultiDirty() {
  const ms = getEl('positionMulti');
  if (!ms) return;
  ms.dataset.dirty = '1';
}

function wireManagerMultiselectHooks() {
  if (managerMultiselectHooksWired) return;
  managerMultiselectHooksWired = true;

  const { filterEmployeePicker, refreshPositionsFromServer } = window.ManagerShiftsEmployeePicker || {};

  document.addEventListener('multiselect:willopen', (e) => {
    const id = e.detail?.id || '';
    if (id === 'employeeMulti') filterEmployeePicker?.();
    if (id === 'positionMulti') refreshPositionsFromServer?.();
  });

  document.addEventListener('multiselect:didclose', (e) => {
    const id = e.detail?.id || '';
    const el = e.detail?.el;
    const reason = e.detail?.reason || '';

    if (id !== 'positionMulti') return;
    if (!['toggle', 'auto-close', 'escape'].includes(reason)) return;
    if (!el || el.dataset.dirty !== '1') return;
    el.dataset.dirty = '0';
    submitManagerFiltersForm();
  });
}

function selectAllPositions(on) {
  getPositionCbs().forEach((cb) => (cb.checked = on));
  updatePositionMulti();
}

function updatePositionMulti() {
  const cbs = [...getPositionCbs()];
  const checked = cbs.filter((c) => c.checked).map((c) => c.parentElement.textContent.trim());

  const label = getEl('positionMultiLabel');
  if (!label) return;

  if (checked.length === 0) label.textContent = 'All positions';
  else if (checked.length === cbs.length) label.textContent = 'All positions';
  else if (checked.length <= 2) label.textContent = checked.join(', ');
  else label.textContent = `${checked.length} positions`;
}

function rebuildPositionFilterOptions(positions) {
  const menu = document.querySelector('#positionMulti .multiselect-menu');
  if (!menu) return;
  menu.innerHTML = '';

  if (!positions.length) {
    menu.appendChild(createEmptyMessage('No positions yet. Add positions in Employees → Manage positions.'));
    return;
  }

  const params = new URL(window.location.href).searchParams;
  const selectedFromUrl = params.getAll('positions').map((x) => String(x));
  const selectAll = selectedFromUrl.length === 0;
  const selectedSet = new Set(selectedFromUrl);

  positions.forEach((p) => {
    const label = document.createElement('label');
    label.className = 'multiselect-item';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.name = 'positions';
    cb.value = String(p.id);
    cb.checked = selectAll || selectedSet.has(String(p.id));
    cb.addEventListener('change', () => {
      updatePositionMulti();
      markPositionMultiDirty();
    });

    label.appendChild(cb);
    label.appendChild(document.createTextNode(` ${p.name}`));
    menu.appendChild(label);
  });

  const actions = document.createElement('div');
  actions.className = 'multiselect-actions multiselect-actions-right';

  const clearBtn = document.createElement('button');
  clearBtn.className = 'btn btn-ghost btn-sm';
  clearBtn.type = 'button';
  clearBtn.textContent = 'Clear';
  clearBtn.addEventListener('click', () => {
    getPositionCbs().forEach((cb) => (cb.checked = false));
    updatePositionMulti();
    markPositionMultiDirty();
  });

  const allBtn = document.createElement('button');
  allBtn.className = 'btn btn-ghost btn-sm';
  allBtn.type = 'button';
  allBtn.textContent = 'All';
  allBtn.addEventListener('click', () => {
    getPositionCbs().forEach((cb) => (cb.checked = true));
    updatePositionMulti();
    markPositionMultiDirty();
  });

  const applyBtn = document.createElement('button');
  applyBtn.className = 'btn btn-primary btn-sm';
  applyBtn.type = 'button';
  applyBtn.textContent = 'Apply';
  applyBtn.addEventListener('click', () => {
    const ms = getEl('positionMulti');
    if (ms) ms.dataset.dirty = '0';
    submitManagerFiltersForm();
  });

  actions.appendChild(clearBtn);
  actions.appendChild(allBtn);
  actions.appendChild(applyBtn);
  menu.appendChild(actions);
}

function wireManagerFiltersMultiselectClickThrough() {
  const form = getEl('managerFiltersForm');
  if (!form) return;

  for (const btn of form.querySelectorAll('.multiselect-trigger')) {
    btn.addEventListener('click', (e) => e.stopPropagation());
  }
  for (const menu of form.querySelectorAll('.multiselect-menu')) {
    menu.addEventListener('click', (e) => e.stopPropagation());
  }
}

window.submitFilters = submitFilters;
window.selectAllPositions = selectAllPositions;
window.markPositionMultiDirty = markPositionMultiDirty;
window.updatePositionMulti = updatePositionMulti;

window.ManagerShiftsFilters = {
  updatePositionMulti,
  rebuildPositionFilterOptions,
  wireManagerMultiselectHooks,
  wireManagerFiltersMultiselectClickThrough,
};

})();
