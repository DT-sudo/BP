(function() {
  'use strict';

  const ManagerShifts = window.ManagerShifts || {};
  const Config = ManagerShifts.Config || {};
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
    window.requestAnimationFrame(() => ManagerShifts.Layout?.syncLayout?.());
    return;
  }

  if (hasDraft) {
    const draftItem = document.createElement('div');
    draftItem.className = 'position-legend-item position-legend-item-draft';
    draftItem.innerHTML = '<span class="position-swatch position-swatch-draft" aria-hidden="true"></span><span class="position-legend-label">Draft</span>';
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

  window.requestAnimationFrame(() => ManagerShifts.Layout?.syncLayout?.());
}

ManagerShifts.PositionPalette = {
  applyPositionPaletteToElement,
  collectPositionsFromDom,
  renderPositionLegend,
};

})();


(function() {
  'use strict';

  const ManagerShifts = window.ManagerShifts || {};
  const Config = ManagerShifts.Config || {};
  const { getEl, getPositionCbs } = Config;

function selectAllPositions(on) {
  getPositionCbs().forEach((cb) => (cb.checked = on));
  updatePositionMulti();
}

function updatePositionMulti() {
  const cbs = [...getPositionCbs()];
  const checked = cbs.filter((c) => c.checked).map((c) => c.parentElement.textContent.trim());

  const label = getEl('positionMultiLabel');
  if (!label) return;

  if (checked.length === 0 || checked.length === cbs.length) label.textContent = 'All positions';
  else if (checked.length <= 2) label.textContent = checked.join(', ');
  else label.textContent = `${checked.length} positions`;
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

function wireManagerFiltersNativeSubmit() {
  const form = getEl('managerFiltersForm');
  if (!form) return;

  form.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;

    if (target.name === 'positions') {
      updatePositionMulti();
      return;
    }

    if (target.name === 'status' || target.name === 'show') {
      form.requestSubmit();
    }
  });
}

ManagerShifts.Filters = {
  selectAllPositions,
  updatePositionMulti,
  wireManagerFiltersNativeSubmit,
  wireManagerFiltersMultiselectClickThrough,
};

})();


(function() {
  'use strict';

  const ManagerShifts = window.ManagerShifts || {};
  const Config = ManagerShifts.Config || {};
  const { getEl, getEmployeeCbs, createEmptyMessage } = Config;

let employeeBuckets = null;
let lastShiftPositionId = null;

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

  list.replaceChildren();

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
    ph.textContent = getEl('shiftPosition')?.value ? 'Select employees' : 'Select position first';
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

  list?.replaceChildren();

  if (!hasPosition) {
    lastShiftPositionId = null;
    clearAllEmployeeSelections();
    if (empty) {
      empty.textContent = 'Select position first';
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

function syncShiftPositionMenuFromSelect() {
  const select = getEl('shiftPosition');
  if (!select) return;
  const positions = Array.from(select.options)
    .filter((o) => o.value)
    .map((o) => ({ id: o.value, name: o.textContent || '' }));
  rebuildShiftPositionMultiOptions(positions);
  updateShiftPositionMultiLabel();
}

ManagerShifts.EmployeePicker = {
  initEmployeeBuckets,
  clearAllEmployeeSelections,
  selectAllEmployees,
  updateEmployeeMulti,
  wireEmployeeChipRemovals,
  filterEmployeePicker,
  updateShiftPositionMultiLabel,
  syncShiftPositionMenuFromSelect,
};

})();


(function() {
  'use strict';

  const ManagerShifts = window.ManagerShifts || {};
  const Config = ManagerShifts.Config || {};
  const PositionPalette = ManagerShifts.PositionPalette || {};
  const Time = ManagerShifts.Time || {};
  const { getEl, initialsFromName } = Config;
  const { applyPositionPaletteToElement } = PositionPalette;
  const { parseTimeToMinutes } = Time;

let managerEmployees = [];
let managerEmployeePeriodStats = {
  shiftIdsByEmployeeId: new Map(),
  minutesByEmployeeId: new Map(),
};
let activeEmployeeHighlightId = null;
let employeeSidebarControlsWired = false;

function setManagerEmployees(employees) {
  managerEmployees = employees;
}

function computeEmployeePeriodStats(shifts) {
  const shiftIdsByEmployeeId = new Map();
  const minutesByEmployeeId = new Map();

  (Array.isArray(shifts) ? shifts : []).forEach((s) => {
    if (!s) return;
    const shiftId = String(s.id ?? '');
    if (!shiftId) return;

    const duration = Math.max(0, parseTimeToMinutes(s.end_time) - parseTimeToMinutes(s.start_time));
    const assignedIds = Array.isArray(s.assigned_employee_ids) ? s.assigned_employee_ids : [];

    assignedIds.forEach((eid) => {
      const employeeId = String(eid ?? '');
      if (!employeeId) return;

      if (!shiftIdsByEmployeeId.has(employeeId)) shiftIdsByEmployeeId.set(employeeId, new Set());
      shiftIdsByEmployeeId.get(employeeId).add(shiftId);

      minutesByEmployeeId.set(employeeId, (minutesByEmployeeId.get(employeeId) || 0) + duration);
    });
  });

  managerEmployeePeriodStats = { shiftIdsByEmployeeId, minutesByEmployeeId };
  return managerEmployeePeriodStats;
}

function syncEmployeeSidebarActiveState() {
  const list = getEl('employeeSidebarList');
  if (!list) return;

  for (const row of list.querySelectorAll('.employee-sidebar-item')) {
    const id = row.dataset.employeeId || '';
    const active = !!activeEmployeeHighlightId && id === String(activeEmployeeHighlightId);
    row.classList.toggle('active', active);
    row.setAttribute('aria-pressed', String(active));
  }
}

function applyEmployeeShiftHighlight() {
  document.querySelectorAll('.shift-chip.shift-chip-employee-highlight').forEach((el) => {
    el.classList.remove('shift-chip-employee-highlight');
  });

  const activeId = activeEmployeeHighlightId ? String(activeEmployeeHighlightId) : '';
  if (!activeId) return;

  const shiftIds = managerEmployeePeriodStats?.shiftIdsByEmployeeId?.get(activeId);
  if (!shiftIds || !shiftIds.size) return;

  document.querySelectorAll('.shift-chip[data-shift-id]').forEach((chip) => {
    const id = String(chip.dataset.shiftId || '');
    if (!id) return;
    if (shiftIds.has(id)) chip.classList.add('shift-chip-employee-highlight');
  });
}

function toggleEmployeeHighlight(employeeId) {
  const id = String(employeeId || '');
  if (!id) return;
  activeEmployeeHighlightId = activeEmployeeHighlightId === id ? null : id;
  applyEmployeeShiftHighlight();
  syncEmployeeSidebarActiveState();
}

function wireEmployeeSidebarControls() {
  if (employeeSidebarControlsWired) return;
  employeeSidebarControlsWired = true;

  getEl('employeeSidebarPosition')?.addEventListener('change', renderEmployeeSidebar);
}

function renderEmployeeSidebar() {
  const sidebar = getEl('managerEmployeeSidebar');
  const list = getEl('employeeSidebarList');
  if (!sidebar || !list) return;

  const filterPosition = getEl('employeeSidebarPosition')?.value || '';

  const filtered = (Array.isArray(managerEmployees) ? managerEmployees : []).filter((e) => {
    if (!e) return false;
    const positionId = e.position_id ?? null;
    if (!filterPosition) return true;
    if (filterPosition === '__none__') return positionId === null || positionId === undefined || String(positionId) === '';
    return String(positionId) === String(filterPosition);
  });

  const enriched = filtered
    .map((e) => {
      const id = String(e.id ?? '');
      const name = String(e.name || '');
      const minutes = managerEmployeePeriodStats?.minutesByEmployeeId?.get(id) || 0;
      return {
        ...e,
        _id: id,
        _name: name,
        _minutes: minutes,
      };
    })
    .sort((a, b) => a._name.localeCompare(b._name) || String(a._id).localeCompare(String(b._id)));

  list.innerHTML = '';
  if (!enriched.length) {
    const empty = document.createElement('div');
    empty.className = 'employee-sidebar-empty text-sm text-muted';
    empty.textContent = 'No employees found.';
    list.appendChild(empty);
    syncEmployeeSidebarActiveState();
    return;
  }

  const frag = document.createDocumentFragment();
  enriched.forEach((e) => {
    const row = document.createElement('div');
    row.className = 'employee-sidebar-item';
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.setAttribute('aria-label', `Highlight shifts for ${e._name || 'employee'}`);
    row.setAttribute('aria-pressed', 'false');
    row.dataset.employeeId = e._id;
    if (e.position_id !== null && e.position_id !== undefined) row.dataset.positionId = String(e.position_id);
    row.addEventListener('click', () => toggleEmployeeHighlight(e._id));
    row.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggleEmployeeHighlight(e._id); } });

    const avatar = document.createElement('div');
    avatar.className = 'employee-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = initialsFromName(e._name);

    const metaDiv = document.createElement('div');
    metaDiv.className = 'employee-sidebar-meta';

    const name = document.createElement('div');
    name.className = 'employee-sidebar-name';
    name.textContent = e._name || 'Employee';

    const sub = document.createElement('div');
    sub.className = 'employee-sidebar-sub';

    const badge = document.createElement('span');
    badge.className = 'badge badge-outline employee-position-badge';
    const positionLabel = String(e.position || '').trim() || 'Unassigned';
    badge.textContent = positionLabel;
    if (e.position_id) applyPositionPaletteToElement(badge, e.position_id);

    sub.appendChild(badge);
    if (e._minutes > 0) {
      const hours = document.createElement('span');
      hours.className = 'employee-sidebar-hours';
      const rounded = Math.round((e._minutes / 60) * 10) / 10;
      hours.textContent = `${String(rounded).replace(/\.0$/, '')}h`;
      sub.appendChild(hours);
    }
    metaDiv.appendChild(name);
    metaDiv.appendChild(sub);

    row.appendChild(avatar);
    row.appendChild(metaDiv);
    frag.appendChild(row);
  });

  list.appendChild(frag);
  syncEmployeeSidebarActiveState();
}

ManagerShifts.Sidebar = {
  setManagerEmployees,
  computeEmployeePeriodStats,
  applyEmployeeShiftHighlight,
  wireEmployeeSidebarControls,
  renderEmployeeSidebar,
};

})();
