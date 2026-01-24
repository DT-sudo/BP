function buildManagerFiltersUrl() {
  const form = document.getElementById('managerFiltersForm');
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
    if (checkedCount === 0 || checkedCount === positionBoxes.length) params.delete('positions');
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
  closeAllMultiselects();
  submitManagerFiltersForm();
}

// ---------- Multi-select ----------
function updateStatusMulti() {
  const label = document.getElementById('statusMultiLabel');
  if (!label) return;
  const checked = document.querySelector('#statusMulti input[type="radio"][name="status"]:checked');
  if (!checked || !checked.value) label.textContent = 'All';
  else label.textContent = String(checked.value).charAt(0).toUpperCase() + String(checked.value).slice(1);
}

function updateShowMulti() {
  const label = document.getElementById('showMultiLabel');
  if (!label) return;
  const checked = document.querySelector('#showMulti input[type="radio"][name="show"]:checked');
  if (!checked || !checked.value) label.textContent = 'All';
  else label.textContent = checked.value === 'understaffed' ? 'Understaffed only' : String(checked.value);
}

function markPositionMultiDirty() {
  const ms = document.getElementById('positionMulti');
  if (!ms) return;
  ms.dataset.dirty = '1';
}

function setMultiOpen(el, open) {
  if (!el) return;
  el.classList.toggle('open', open);
  const trigger = el.querySelector('.multiselect-trigger');
  trigger?.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function closeAllMultiselects() {
  document.querySelectorAll('.multiselect.open').forEach((ms) => setMultiOpen(ms, false));
}

function closestByClass(node, className) {
  let cur = node;
  while (cur) {
    if (cur.classList && cur.classList.contains(className)) return cur;
    cur = cur.parentNode;
  }
  return null;
}

function toggleMulti(id) {
  const el = document.getElementById(id);
  if (!el) return;
  if (id === 'employeeMulti') filterEmployeePicker();
  if (id === 'positionMulti') refreshPositionsFromServer();
  const willOpen = !el.classList.contains('open');
  closeAllMultiselects();
  setMultiOpen(el, willOpen);

  if (id === 'positionMulti' && !willOpen && el.dataset.dirty === '1') {
    el.dataset.dirty = '0';
    submitManagerFiltersForm();
  }
}

function selectAllPositions(on) {
  document.querySelectorAll('#positionMulti input[type="checkbox"]').forEach((cb) => (cb.checked = on));
  updatePositionMulti();
}

function updatePositionMulti() {
  const cbs = Array.from(document.querySelectorAll('#positionMulti input[type="checkbox"]'));
  const checked = cbs.filter((c) => c.checked).map((c) => c.parentElement.textContent.trim());

  const label = document.getElementById('positionMultiLabel');
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
    const empty = document.createElement('div');
    empty.className = 'text-sm text-muted';
    empty.style.padding = '.5rem .75rem';
    empty.textContent = 'No positions yet. Add roles in Employees → Manage roles.';
    menu.appendChild(empty);
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
    document.querySelectorAll('#positionMulti input[type="checkbox"]').forEach((cb) => (cb.checked = false));
    updatePositionMulti();
    markPositionMultiDirty();
  });

  const allBtn = document.createElement('button');
  allBtn.className = 'btn btn-ghost btn-sm';
  allBtn.type = 'button';
  allBtn.textContent = 'All';
  allBtn.addEventListener('click', () => {
    document.querySelectorAll('#positionMulti input[type="checkbox"]').forEach((cb) => (cb.checked = true));
    updatePositionMulti();
    markPositionMultiDirty();
  });

  const applyBtn = document.createElement('button');
  applyBtn.className = 'btn btn-primary btn-sm';
  applyBtn.type = 'button';
  applyBtn.textContent = 'Apply';
  applyBtn.addEventListener('click', () => {
    const ms = document.getElementById('positionMulti');
    if (ms) ms.dataset.dirty = '0';
    submitManagerFiltersForm();
  });

  actions.appendChild(clearBtn);
  actions.appendChild(allBtn);
  actions.appendChild(applyBtn);
  menu.appendChild(actions);
}

function rebuildShiftPositionOptions(positions) {
  const select = document.getElementById('shiftPosition');
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
  const label = document.getElementById('shiftPositionMultiLabel');
  if (!label) return;
  const select = document.getElementById('shiftPosition');
  const selectedValue = select?.value || '';
  if (!selectedValue) {
    label.textContent = 'Select position...';
    return;
  }
  const opt = Array.from(select.options).find((o) => String(o.value) === String(selectedValue));
  label.textContent = opt?.textContent?.trim() || 'Select position...';
}

function setShiftPosition(value) {
  const select = document.getElementById('shiftPosition');
  if (select) select.value = String(value || '');
  updateShiftPositionMultiLabel();
  select?.dispatchEvent(new Event('change', { bubbles: true }));
  window.closeAllMultiselects?.();
}

function rebuildShiftPositionMultiOptions(positions) {
  const menu = document.getElementById('shiftPositionMultiMenu');
  if (!menu) return;
  menu.innerHTML = '';

  if (!positions.length) {
    const empty = document.createElement('div');
    empty.className = 'text-sm text-muted';
    empty.style.padding = '.5rem .75rem';
    empty.textContent = 'No positions yet.';
    menu.appendChild(empty);
    return;
  }

  positions.forEach((p) => {
    const item = document.createElement('label');
    item.className = 'multiselect-item';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'shiftPositionChoice';
    radio.value = String(p.id);
    radio.checked = String(document.getElementById('shiftPosition')?.value || '') === String(p.id);
    radio.addEventListener('change', () => setShiftPosition(radio.value));

    item.appendChild(radio);
    item.appendChild(document.createTextNode(` ${p.name}`));
    menu.appendChild(item);
  });
}

async function refreshPositionsFromServer() {
  const page = document.getElementById('managerShiftPage');
  const url = page?.dataset.positionsListUrl;
  if (!url) return;

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return;
    const payload = await res.json().catch(() => ({}));
    const positions = (payload.positions || [])
      .filter((p) => p && p.is_active)
      .map((p) => ({ id: p.id, name: p.name, is_active: p.is_active }))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

    rebuildPositionFilterOptions(positions);
    rebuildShiftPositionOptions(positions);
    rebuildShiftPositionMultiOptions(positions);
    updatePositionMulti();
    updateStatusMulti();
    updateShowMulti();
    updateShiftPositionMultiLabel();
    renderRoleLegend(positions, managerCurrentShifts);
  } catch (e) {
    // ignore
  }
}

function updateEmployeeMulti() {
  const boxes = Array.from(document.querySelectorAll('#employeeMulti input[type="checkbox"]'));
  const checked = boxes.filter((b) => b.checked);
  const chips = document.getElementById('employeeMultiChips');
  if (!chips) return;

  chips.innerHTML = '';

  if (checked.length === 0) {
    const ph = document.createElement('span');
    ph.className = 'multiselect-placeholder';
    ph.id = 'employeeMultiPlaceholder';
    ph.textContent = document.getElementById('shiftPosition')?.value ? 'Select employees' : 'Select role first';
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
    remove.textContent = '×';

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

let employeeBuckets = null;
let lastShiftPositionId = null;

function initEmployeeBuckets() {
  if (employeeBuckets) return employeeBuckets;

  const list = document.getElementById('employeeMultiList');
  employeeBuckets = new Map();
  if (!list) return employeeBuckets;

  Array.from(list.querySelectorAll('.employee-item')).forEach((row) => {
    const pos = row.dataset.positionId || '';
    if (!employeeBuckets.has(pos)) employeeBuckets.set(pos, []);
    employeeBuckets.get(pos).push(row);
  });

  // Remove all items from DOM; only append matching position when selected.
  Array.from(list.children).forEach((c) => c.remove());

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

function wireEmployeeChipRemovals() {
  const chips = document.getElementById('employeeMultiChips');
  if (!chips) return;

  const removeById = (employeeId) => {
    const boxes = Array.from(document.querySelectorAll('#employeeMulti input[type="checkbox"]'));
    const cb = boxes.find((b) => String(b.value) === String(employeeId));
    if (!cb) return;
    cb.checked = false;
    updateEmployeeMulti();
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

function wireMultiSelectAutoClose() {
  document.addEventListener('click', (e) => {
    const clickedInside = closestByClass(e.target, 'multiselect');
    document.querySelectorAll('.multiselect.open').forEach((ms) => {
      if (clickedInside && ms === clickedInside) return;
      const shouldSubmitPosition = ms.id === 'positionMulti' && ms.dataset.dirty === '1';
      setMultiOpen(ms, false);
      if (shouldSubmitPosition) {
        ms.dataset.dirty = '0';
        submitManagerFiltersForm();
      }
    });
  });
}

function wireManagerFiltersMultiselectClickThrough() {
  const form = document.getElementById('managerFiltersForm');
  if (!form) return;

  form.querySelectorAll('.multiselect-trigger').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  });

  form.querySelectorAll('.multiselect-menu').forEach((menu) => {
    menu.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  });
}

// ---------- Create Shift Modal ----------
function resetCreateShiftModal() {
  document.getElementById('createShiftTitle').textContent = 'Create Shift';
  document.getElementById('createShiftSubmit').textContent = 'Create Shift';

  const form = document.getElementById('createShiftForm');
  if (form?.dataset.createAction) form.action = form.dataset.createAction;

  const dateInput = document.getElementById('shiftDate');
  if (dateInput) dateInput.value = '';
  const startInput = document.getElementById('shiftStart');
  if (startInput) startInput.value = '09:00';
  const endInput = document.getElementById('shiftEnd');
  if (endInput) endInput.value = '17:00';
  const capInput = document.getElementById('shiftCapacity');
  if (capInput) capInput.value = '1';
  const positionSelect = document.getElementById('shiftPosition');
  if (positionSelect) positionSelect.value = '';
  updateShiftPositionMultiLabel();

  const publish = document.getElementById('publishImmediatelyCustom');
  if (publish) publish.checked = false;

  clearAllEmployeeSelections();
  updateEmployeeMulti();
}

function openCreateShiftModal(dateStr, startTime, endTime) {
  refreshPositionsFromServer();
  resetCreateShiftModal();
  const dateInput = document.getElementById('shiftDate');
  if (dateInput && dateStr) dateInput.value = dateStr;

  const startInput = document.getElementById('shiftStart');
  if (startInput && startTime) startInput.value = startTime;

  const endInput = document.getElementById('shiftEnd');
  if (endInput) {
    if (endTime) endInput.value = endTime;
    else if (startTime) {
      const [h, m] = String(startTime).split(':').map((x) => parseInt(x, 10));
      const nextH = Number.isFinite(h) ? (h + 1) % 24 : 0;
      const mm = Number.isFinite(m) ? m : 0;
      endInput.value = `${String(nextH).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
  }

  filterEmployeePicker();
  updateEmployeeMulti();
  openModal('createShiftModal');
}

function filterEmployeePicker() {
  initEmployeeBuckets();
  const positionId = document.getElementById('shiftPosition')?.value;
  const trigger = document.getElementById('employeeMultiTrigger');
  const empty = document.getElementById('employeeMultiEmpty');
  const list = document.getElementById('employeeMultiList');

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
    document.getElementById('employeeMulti')?.classList.remove('open');
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

function clearCreateShiftErrors() {
  document.getElementById('shiftCapacity')?.classList.remove('form-error');
  document.getElementById('employeeMulti')?.classList.remove('form-error');
  const capErr = document.getElementById('capacityError');
  const empErr = document.getElementById('employeeAssignError');
  if (capErr) {
    capErr.classList.add('hidden');
    capErr.textContent = '';
  }
  if (empErr) {
    empErr.classList.add('hidden');
    empErr.textContent = '';
  }
}

function wireCreateShiftValidation() {
  const form = document.getElementById('createShiftForm');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    clearCreateShiftErrors();

    const start = document.getElementById('shiftStart')?.value;
    const end = document.getElementById('shiftEnd')?.value;
    if (start && end && start >= end) {
      e.preventDefault();
      showToast('error', 'Invalid time range', 'End time must be after start time.');
      return;
    }

    const capEl = document.getElementById('shiftCapacity');
    const capacity = parseInt(capEl?.value || '0', 10);
    const selected = Array.from(document.querySelectorAll('#employeeMulti input[type="checkbox"]')).filter(
      (cb) => cb.checked
    ).length;
    if (Number.isFinite(capacity) && capacity > 0 && selected > capacity) {
      e.preventDefault();

      capEl?.classList.add('form-error');
      document.getElementById('employeeMulti')?.classList.add('form-error');

      const msg = 'Cannot assign more employees than shift capacity.';
      const capErr = document.getElementById('capacityError');
      const empErr = document.getElementById('employeeAssignError');
      if (capErr) {
        capErr.textContent = msg;
        capErr.classList.remove('hidden');
      }
      if (empErr) {
        empErr.textContent = msg;
        empErr.classList.remove('hidden');
      }
    }
  });

  document.getElementById('shiftCapacity')?.addEventListener('input', clearCreateShiftErrors);
  document.getElementById('shiftPosition')?.addEventListener('change', clearCreateShiftErrors);
  document.getElementById('employeeMulti')?.addEventListener('change', clearCreateShiftErrors);
}

// ---------- Navigation ----------
function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(isoDate, delta) {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

function addMonths(isoDate, delta) {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setMonth(d.getMonth() + delta);
  return toISODate(d);
}

function parseTimeToMinutes(value) {
  const [h, m] = String(value || '00:00')
    .split(':')
    .slice(0, 2)
    .map((x) => parseInt(x, 10));
  const hh = Number.isFinite(h) ? h : 0;
  const mm = Number.isFinite(m) ? m : 0;
  return hh * 60 + mm;
}

const TIME_GRID_HOUR_HEIGHT_PX = 72;
const TIME_GRID_HOUR_WIDTH_PX = 72;
const SHIFT_LANE_MIN_WIDTH_PX = 120;
const SHIFT_LANE_HEIGHT_PX = 60;
const SHIFT_LANE_GAP_PX = 4;

function computeRolePalette(positionId) {
  const n = parseInt(positionId, 10);
  if (!Number.isFinite(n)) return null;

  const hue = ((n * 47) % 360 + 360) % 360;
  const bg = `hsl(${hue} 80% 92%)`;
  const border = `hsl(${hue} 70% 45%)`;
  const fg = `hsl(${hue} 60% 20%)`;
  return { bg, border, fg };
}

function applyRolePaletteToElement(el, positionId) {
  const palette = computeRolePalette(positionId);
  if (!el || !palette) return;
  el.classList.add('shift-chip-role');
  el.style.setProperty('--role-bg', palette.bg);
  el.style.setProperty('--role-border', palette.border);
  el.style.setProperty('--role-fg', palette.fg);
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

function renderRoleLegend(positions, shifts) {
  const card = document.getElementById('roleLegendCard');
  const root = document.getElementById('roleLegend');
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

  const visibleRoles = active
    .filter((p) => presentPublishedPositionIds.has(String(p.id)))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

  if (!visibleRoles.length && !hasDraft) {
    card?.classList.add('hidden');
    window.requestAnimationFrame(() => window.managerSyncStickyOffsets?.());
    return;
  }

  card?.classList.remove('hidden');

  if (hasDraft) {
    const draftItem = document.createElement('div');
    draftItem.className = 'role-legend-item role-legend-item-draft';

    const draftSwatch = document.createElement('span');
    draftSwatch.className = 'role-swatch role-swatch-draft';
    draftSwatch.setAttribute('aria-hidden', 'true');

    const draftLabel = document.createElement('span');
    draftLabel.className = 'role-legend-label';
    draftLabel.textContent = 'Draft';

    draftItem.appendChild(draftSwatch);
    draftItem.appendChild(draftLabel);
    root.appendChild(draftItem);
  }

  visibleRoles.forEach((p) => {
    const item = document.createElement('div');
    item.className = 'role-legend-item';

    const swatch = document.createElement('span');
    swatch.className = 'role-swatch';
    applyRolePaletteToElement(swatch, p.id);

    const label = document.createElement('span');
    label.className = 'role-legend-label';
    label.textContent = p.name || '';

    item.appendChild(swatch);
    item.appendChild(label);
    root.appendChild(item);
  });

  window.requestAnimationFrame(() => window.managerSyncStickyOffsets?.());
}

function computeShiftLaneLayout(shifts) {
  const items = (shifts || [])
    .map((s) => ({
      id: String(s.id),
      start: parseTimeToMinutes(s.start_time),
      end: parseTimeToMinutes(s.end_time),
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id));

  const laneEnds = [];
  const laneById = new Map();

  items.forEach((it) => {
    let laneIndex = -1;
    for (let i = 0; i < laneEnds.length; i++) {
      if (it.start >= laneEnds[i]) {
        laneIndex = i;
        break;
      }
    }
    if (laneIndex === -1) {
      laneIndex = laneEnds.length;
      laneEnds.push(it.end);
    } else {
      laneEnds[laneIndex] = it.end;
    }
    laneById.set(it.id, laneIndex);
  });

  return { laneById, laneCount: Math.max(1, laneEnds.length) };
}

function applyTimedShiftChip(chip, shift, hourStartMinutes, laneIndex, laneCount) {
  if (!chip || !shift) return;

  const start = parseTimeToMinutes(shift.start_time);
  const end = parseTimeToMinutes(shift.end_time);
  const offsetMinutes = Math.max(0, start - (hourStartMinutes || 0));
  const durationMinutes = Math.max(0, end - start);

  chip.classList.add('shift-chip-timed');
  chip.style.top = `${(offsetMinutes / 60) * TIME_GRID_HOUR_HEIGHT_PX}px`;
  chip.style.height = `${Math.max(18, (durationMinutes / 60) * TIME_GRID_HOUR_HEIGHT_PX)}px`;

  const lanes = Math.max(1, laneCount || 1);
  const lane = Math.min(Math.max(0, laneIndex || 0), lanes - 1);
  const laneWidth = 100 / lanes;
  const padPx = 2;
  chip.style.left = `calc(${lane * laneWidth}% + ${padPx}px)`;
  chip.style.width = `calc(${laneWidth}% - ${padPx * 2}px)`;
}

function shiftLaneRowHeightPx(laneCount) {
  const lanes = Math.max(1, laneCount || 1);
  return lanes * SHIFT_LANE_HEIGHT_PX + (lanes + 1) * SHIFT_LANE_GAP_PX;
}

function applyTimedShiftChipHorizontal(chip, shift, hourStartMinutes, laneIndex, laneCount, hourWidthPx) {
  if (!chip || !shift) return;

  const start = parseTimeToMinutes(shift.start_time);
  const end = parseTimeToMinutes(shift.end_time);
  const offsetMinutes = Math.max(0, start - (hourStartMinutes || 0));
  const durationMinutes = Math.max(0, end - start);
  const hourWidth = Number.isFinite(hourWidthPx) && hourWidthPx > 0 ? hourWidthPx : TIME_GRID_HOUR_WIDTH_PX;

  chip.classList.add('shift-chip-timed');
  chip.style.left = `${(offsetMinutes / 60) * hourWidth}px`;
  chip.style.width = `${Math.max(18, (durationMinutes / 60) * hourWidth)}px`;

  const lanes = Math.max(1, laneCount || 1);
  const lane = Math.min(Math.max(0, laneIndex || 0), lanes - 1);
  chip.style.top = `${SHIFT_LANE_GAP_PX + lane * (SHIFT_LANE_HEIGHT_PX + SHIFT_LANE_GAP_PX)}px`;
  chip.style.height = `${SHIFT_LANE_HEIGHT_PX}px`;
}

function applyTimedShiftChipHorizontalDynamic(
  chip,
  shift,
  hourStartMinutes,
  laneIndex,
  laneCount,
  hourWidthPx,
  laneHeightPx,
  laneGapPx,
) {
  if (!chip || !shift) return;
  const hourWidth = Number.isFinite(hourWidthPx) && hourWidthPx > 0 ? hourWidthPx : TIME_GRID_HOUR_WIDTH_PX;
  const laneHeight = Number.isFinite(laneHeightPx) && laneHeightPx > 0 ? laneHeightPx : SHIFT_LANE_HEIGHT_PX;
  const laneGap = Number.isFinite(laneGapPx) && laneGapPx >= 0 ? laneGapPx : SHIFT_LANE_GAP_PX;

  const start = parseTimeToMinutes(shift.start_time);
  const end = parseTimeToMinutes(shift.end_time);
  const offsetMinutes = Math.max(0, start - (hourStartMinutes || 0));
  const durationMinutes = Math.max(0, end - start);

  chip.classList.add('shift-chip-timed');
  chip.style.left = `${(offsetMinutes / 60) * hourWidth}px`;
  chip.style.width = `${Math.max(18, (durationMinutes / 60) * hourWidth)}px`;

  const lanes = Math.max(1, laneCount || 1);
  const lane = Math.min(Math.max(0, laneIndex || 0), lanes - 1);
  chip.style.top = `${laneGap + lane * (laneHeight + laneGap)}px`;
  chip.style.height = `${laneHeight}px`;
}

function navigateWith(params) {
  const url = new URL(window.location.href);
  const search = url.searchParams;
  Object.entries(params).forEach(([k, v]) => {
    if (v === null || v === undefined || v === '') search.delete(k);
    else search.set(k, v);
  });
  window.location.assign(`${url.pathname}?${search.toString()}`);
}

function switchView(view) {
  const page = document.getElementById('managerShiftPage');
  const anchor = page?.dataset.anchor || '';
  navigateWith({ view, date: anchor });
}

function prevPeriod() {
  const page = document.getElementById('managerShiftPage');
  if (!page) return;
  const view = page.dataset.view;
  const anchor = page.dataset.anchor;
  if (!anchor) return;

  if (view === 'day') navigateWith({ view, date: addDays(anchor, -1) });
  else if (view === 'month') navigateWith({ view, date: addMonths(anchor, -1) });
  else navigateWith({ view: 'week', date: addDays(anchor, -7) });
}

function nextPeriod() {
  const page = document.getElementById('managerShiftPage');
  if (!page) return;
  const view = page.dataset.view;
  const anchor = page.dataset.anchor;
  if (!anchor) return;

  if (view === 'day') navigateWith({ view, date: addDays(anchor, 1) });
  else if (view === 'month') navigateWith({ view, date: addMonths(anchor, 1) });
  else navigateWith({ view: 'week', date: addDays(anchor, 7) });
}

function goToToday() {
  const page = document.getElementById('managerShiftPage');
  if (!page) return;
  const view = page.dataset.view || 'week';
  const today = page.dataset.today;
  if (!today) return;
  navigateWith({ view, date: today });
}

let managerMonthPickerYear = null;
let managerMonthPickerAnchorYear = null;
let managerMonthPickerAnchorMonth = null;

function renderManagerMonthPicker() {
  const yearLabel = document.getElementById('managerMonthPickerYearLabel');
  const grid = document.getElementById('managerMonthPickerGrid');
  if (!yearLabel || !grid) return;

  yearLabel.textContent = String(managerMonthPickerYear || '');
  grid.innerHTML = '';

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  months.forEach((m, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'month-picker-btn';
    btn.textContent = m;
    if (
      managerMonthPickerYear === managerMonthPickerAnchorYear &&
      managerMonthPickerAnchorMonth != null &&
      idx === managerMonthPickerAnchorMonth
    ) {
      btn.classList.add('active');
    }
    btn.addEventListener('click', () => {
      const mm = String(idx + 1).padStart(2, '0');
      const iso = `${managerMonthPickerYear}-${mm}-01`;
      window.closeAllMultiselects?.();
      navigateWith({ view: 'month', date: iso });
    });
    grid.appendChild(btn);
  });
}

function managerMonthPickerPrevYear() {
  managerMonthPickerYear = (managerMonthPickerYear || new Date().getFullYear()) - 1;
  renderManagerMonthPicker();
}

function managerMonthPickerNextYear() {
  managerMonthPickerYear = (managerMonthPickerYear || new Date().getFullYear()) + 1;
  renderManagerMonthPicker();
}

function initManagerMonthPicker(config) {
  const anchor = new Date(`${config.anchor}T00:00:00`);
  if (Number.isNaN(anchor.getTime())) {
    const now = new Date();
    managerMonthPickerYear = now.getFullYear();
    managerMonthPickerAnchorYear = now.getFullYear();
    managerMonthPickerAnchorMonth = now.getMonth();
  } else {
    managerMonthPickerYear = anchor.getFullYear();
    managerMonthPickerAnchorYear = anchor.getFullYear();
    managerMonthPickerAnchorMonth = anchor.getMonth();
  }
  renderManagerMonthPicker();
}

function wireStickyOffsets() {
  const root = document.documentElement;
  const header = document.querySelector('.header');
  if (!root || !header) return;

  const sync = () => {
    const headerHeight = header.getBoundingClientRect().height;
    root.style.setProperty('--header-sticky-height', `${headerHeight}px`);

    const toolbar = document.querySelector('.card.page-toolbar-card');
    const toolbarHeight = toolbar ? toolbar.getBoundingClientRect().height : 0;
    root.style.setProperty('--toolbar-sticky-height', `${toolbarHeight}px`);

    const legend = document.getElementById('roleLegendCard');
    const legendHeight = legend ? legend.getBoundingClientRect().height : 0;
    root.style.setProperty('--bottom-legend-height', `${legendHeight}px`);

    const activeView =
      document.querySelector('#weekView.card:not(.hidden)') ||
      document.querySelector('#monthView.card:not(.hidden)') ||
      document.querySelector('#dayView.card:not(.hidden)');
    const viewMarginTop = activeView ? parseFloat(window.getComputedStyle(activeView).marginTop) || 0 : 0;
    const viewMarginBottom = viewMarginTop;

    const available =
      window.innerHeight - headerHeight - toolbarHeight - legendHeight - viewMarginTop - viewMarginBottom;
    root.style.setProperty('--manager-calendar-fill-height', `${Math.max(320, Math.floor(available))}px`);
  };

  sync();
  window.managerSyncStickyOffsets = sync;

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (resizeTimer) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(sync, 50);
  });
}

// ---------- Calendar rendering ----------
function parseJsonScript(id, fallback) {
  const el = document.getElementById(id);
  if (!el) return fallback;
  try {
    return JSON.parse(el.textContent || '');
  } catch (e) {
    return fallback;
  }
}

function weekdayLabel(d) {
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

function dayNumber(d) {
  return d.getDate();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return ch;
    }
  });
}

function formatChipDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
}

function formatDurationMinutes(minutes) {
  const total = Math.max(0, parseInt(minutes, 10) || 0);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function formatDateDMY(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

// ---------- Shift selection (bulk publish/delete) ----------
let selectionMode = false;
const selectedShiftIds = new Set();
let selectionHistory = [];
let serverCanUndo = false;

function setSelectMode(on) {
  selectionMode = !!on;
  if (!selectionMode) {
    selectedShiftIds.clear();
    selectionHistory = [];
  }
  updateSelectionUI();
}

function updateSelectionUI() {
  const btn = document.getElementById('selectModeBtn');
  if (btn) {
    btn.textContent = selectionMode ? 'Cancel' : 'Select';
    btn.classList.toggle('btn-primary', selectionMode);
    btn.classList.toggle('btn-outline', !selectionMode);
  }

  document.body?.classList?.toggle('selection-mode', selectionMode);

  const undoBtn = document.getElementById('undoSelectBtn');
  if (undoBtn) {
    const canUndoNow = selectionMode ? selectionHistory.length > 0 || serverCanUndo : serverCanUndo;
    undoBtn.disabled = !canUndoNow;
  }

  if (!selectionMode) {
    document.querySelectorAll('.shift-chip-selected').forEach((chip) => chip.classList.remove('shift-chip-selected'));
    return;
  }

  const esc = window.CSS?.escape ? window.CSS.escape : (s) => String(s).replace(/["\\]/g, '\\$&');

  document.querySelectorAll('.shift-chip-selected').forEach((chip) => {
    const id = chip.dataset.shiftId;
    if (!id || !selectedShiftIds.has(String(id))) chip.classList.remove('shift-chip-selected');
  });

  selectedShiftIds.forEach((id) => {
    document.querySelectorAll(`.shift-chip[data-shift-id="${esc(id)}"]`).forEach((chip) => {
      chip.classList.add('shift-chip-selected');
    });
  });
}

function toggleChipSelected(chipEl) {
  const id = chipEl?.dataset?.shiftId;
  if (!id) return;
  selectionHistory.push(Array.from(selectedShiftIds));
  const key = String(id);
  if (selectedShiftIds.has(key)) selectedShiftIds.delete(key);
  else selectedShiftIds.add(key);
  chipEl.classList.toggle('shift-chip-selected', selectedShiftIds.has(key));
  updateSelectionUI();
}

function selectedIdsCsv() {
  return Array.from(selectedShiftIds).join(',');
}

window.toggleSelectMode = function toggleSelectMode() {
  setSelectMode(!selectionMode);
};

window.undoSelection = function undoSelection() {
  if (!selectionMode) return;
  const prev = selectionHistory.pop();
  if (!prev) {
    updateSelectionUI();
    return;
  }
  selectedShiftIds.clear();
  prev.forEach((id) => selectedShiftIds.add(String(id)));
  updateSelectionUI();
};

window.undoToolbar = function undoToolbar() {
  if (selectionMode && selectionHistory.length > 0) {
    window.undoSelection?.();
    return;
  }
  document.getElementById('undoLastActionForm')?.submit();
};

window.toolbarPublish = function toolbarPublish() {
  if (selectionMode) {
    if (!selectedShiftIds.size) {
      showToast('error', 'Select shifts', 'Select one or more shifts first.');
      return;
    }
    const input = document.getElementById('publishSelectedIds');
    const form = document.getElementById('publishSelectedForm');
    if (!input || !form) return;
    input.value = selectedIdsCsv();
    form.submit();
    return;
  }
  document.getElementById('publishAllDraftsForm')?.submit();
};

window.toolbarDelete = function toolbarDelete() {
  if (selectionMode) {
    if (!selectedShiftIds.size) {
      showToast('error', 'Select shifts', 'Select one or more shifts first.');
      return;
    }
    const input = document.getElementById('deleteSelectedIds');
    if (input) input.value = selectedIdsCsv();
    openModal('deleteSelectedModal');
    return;
  }
  openModal('deleteDraftsModal');
};

function wireSelectionEscapeCancel() {
  if (window._managerShiftsSelectionEscapeBound) return;
  window._managerShiftsSelectionEscapeBound = true;

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!selectionMode) return;
    setSelectMode(false);
  });
}

function wireDayViewResizeReflow(config) {
  if (window._managerDayViewResizeBound) return;
  window._managerDayViewResizeBound = true;
  let timer = null;
  window.addEventListener('resize', () => {
    if (config?.view !== 'day') return;
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      renderDayGrid(config, managerCurrentShifts);
      updateSelectionUI();
    }, 60);
  });
}

function renderShiftChip(shift) {
  const chip = document.createElement('div');
  chip.className = `shift-chip ${shift.is_past ? 'shift-chip-past' : 'shift-chip-future'} ${
    shift.status === 'draft' ? 'shift-chip-draft' : 'shift-chip-published'
  }`;
  chip.dataset.shiftId = String(shift.id);
  if (shift.status !== 'draft') applyRolePaletteToElement(chip, shift.position_id);
  if (selectedShiftIds.has(String(shift.id))) chip.classList.add('shift-chip-selected');

  const time = `${shift.start_time}–${shift.end_time}`;
  const duration = formatDurationMinutes(parseTimeToMinutes(shift.end_time) - parseTimeToMinutes(shift.start_time));
  chip.innerHTML = `
    <div class="shift-chip-header">
      <span class="shift-chip-role-name" title="${escapeHtml(shift.position)}">${escapeHtml(shift.position)}</span>
      <span class="shift-chip-qty">${shift.assigned_count}/${shift.capacity}</span>
    </div>
    <div class="shift-chip-time">${time}</div>
    <div class="shift-chip-duration-row">${duration}</div>
  `;

  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    if (selectionMode) {
      toggleChipSelected(chip);
      return;
    }
    openShiftDetails(shift.id);
  });
  return chip;
}

function renderMonthShiftChip(shift) {
  const chip = document.createElement('div');
  chip.className = `shift-chip manager-month-shift-chip ${shift.is_past ? 'shift-chip-past' : 'shift-chip-future'} ${
    shift.status === 'draft' ? 'shift-chip-draft' : 'shift-chip-published'
  }`;
  chip.dataset.shiftId = String(shift.id);
  if (shift.status !== 'draft') applyRolePaletteToElement(chip, shift.position_id);
  if (selectedShiftIds.has(String(shift.id))) chip.classList.add('shift-chip-selected');

  chip.innerHTML = `
    <div class="manager-month-shift-row">
      <span class="manager-month-shift-main" title="${escapeHtml(shift.position)} ${escapeHtml(
        shift.start_time,
      )}–${escapeHtml(shift.end_time)}">
        <span class="manager-month-shift-name">${escapeHtml(shift.position)}</span>
        <span class="manager-month-shift-sep">•</span>
        <span class="manager-month-shift-time">${escapeHtml(shift.start_time)}–${escapeHtml(shift.end_time)}</span>
      </span>
      <span class="manager-month-shift-qty">${shift.assigned_count}/${shift.capacity}</span>
    </div>
  `;

  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    if (selectionMode) {
      toggleChipSelected(chip);
      return;
    }
    openShiftDetails(shift.id);
  });

  return chip;
}

function openShiftDetails(shiftId) {
  const page = document.getElementById('managerShiftPage');
  const template = page?.dataset.shiftDetailsUrlTemplate;
  if (!template) return;
  const url = urlFromTemplate(template, shiftId);

  fetch(url, { headers: { Accept: 'application/json' } })
    .then(async (r) => {
      if (!r.ok) throw new Error(`Failed to load shift (${r.status})`);
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      if (!ct.includes('application/json')) {
        throw new Error('Could not load shift details. Please refresh the page.');
      }
      return r.json();
    })
    .then((data) => {
      activeShiftId = shiftId;
      activeShiftData = data;

      const detailsDate = document.getElementById('detailsDate');
      if (detailsDate) detailsDate.textContent = formatDateDMY(data.date || '');
      const detailsTime = document.getElementById('detailsTime');
      if (detailsTime) detailsTime.textContent = `${data.start_time || ''}–${data.end_time || ''}`;
      const durationMinutes = parseTimeToMinutes(data.end_time) - parseTimeToMinutes(data.start_time);
      const detailsDuration = document.getElementById('detailsDuration');
      if (detailsDuration) detailsDuration.textContent = `Duration: ${formatDurationMinutes(durationMinutes)}`;
      const detailsPosition = document.getElementById('detailsPosition');
      if (detailsPosition) detailsPosition.textContent = data.position || '';
      const detailsCapacity = document.getElementById('detailsCapacity');
      if (detailsCapacity) {
        detailsCapacity.textContent = `Capacity: ${data.assigned_count ?? 0}/${data.capacity ?? 0} filled`;
      }

      const statusEl = document.getElementById('detailsStatus');
      if (statusEl) {
        statusEl.textContent = data.status === 'draft' ? 'Draft' : 'Published';
        statusEl.className = 'badge ' + (data.status === 'draft' ? 'badge-outline' : 'badge-success');
      }

      const publishBtn = document.getElementById('publishShiftBtn');
      if (publishBtn) {
        if (data.status === 'draft') publishBtn.classList.remove('hidden');
        else publishBtn.classList.add('hidden');
      }

      const list = document.getElementById('detailsEmployees');
      if (list) {
        const assignedEmployees = Array.isArray(data.assigned_employees) ? data.assigned_employees : [];
        list.innerHTML = '';
        if (!assignedEmployees.length) {
          const empty = document.createElement('div');
          empty.className = 'text-sm text-muted';
          empty.textContent = 'No employees assigned.';
          list.appendChild(empty);
        } else {
          assignedEmployees.forEach((e) => {
            const row = document.createElement('div');
            row.className = 'flex items-center gap-2';
            const initials = (e.name || 'E')
              .split(' ')
              .filter(Boolean)
              .slice(0, 2)
              .map((p) => p[0])
              .join('')
              .toUpperCase();
            row.innerHTML = `<div class="header-avatar" style="width: 1.5rem; height: 1.5rem; font-size: 0.625rem;">${initials}</div><span class="text-sm">${e.name}</span>`;
            list.appendChild(row);
          });
        }
      }

      openModal('shiftDetailsModal');
    })
    .catch((err) => {
      showToast('error', 'Error', err.message || 'Could not load shift details.');
    });
}

function wireCalendarClicks(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.addEventListener('click', (e) => {
    if (e.target.closest('.shift-chip')) return;
    const cell = e.target.closest('[data-date]');
    if (!cell) return;
    if (cell.classList.contains('calendar-cell-other-month')) {
      navigateWith({ view: 'month', date: cell.dataset.date });
      return;
    }
    const start = cell.dataset.hour || '';
    openCreateShiftModal(cell.dataset.date, start || undefined);
  });
}

function publishShift() {
  if (!activeShiftId) return;
  const page = document.getElementById('managerShiftPage');
  const tpl = page?.dataset.shiftPublishUrlTemplate;
  const form = document.getElementById('publishShiftForm');
  if (!tpl || !form) return;
  form.action = urlFromTemplate(tpl, activeShiftId);
  form.submit();
}

function renderWeekGrid(config, shifts) {
  const grid = document.getElementById('weekGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const start = new Date(`${config.start}T00:00:00`);
  const byDate = new Map();
  shifts.forEach((s) => {
    const dateKey = s.date;
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey).push(s);
  });

  const laneLayoutByDate = new Map();
  byDate.forEach((dayShifts, dateKey) => {
    laneLayoutByDate.set(dateKey, computeShiftLaneLayout(dayShifts));
  });

  const corner = document.createElement('div');
  corner.className = 'week-corner-header';
  corner.textContent = '';
  corner.style.gridColumn = '1';
  corner.style.gridRow = '1';
  grid.appendChild(corner);

  for (let hour = 0; hour < 24; hour++) {
    const hourStr = `${String(hour).padStart(2, '0')}:00`;
    const header = document.createElement('div');
    header.className = 'week-hour-header';
    header.textContent = hourStr;
    header.dataset.hour = hourStr;
    header.style.gridRow = '1';
    header.style.gridColumn = String(hour + 2);
    grid.appendChild(header);
  }

  let maxLanesInWeek = 1;
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = toISODate(d);
    const laneCount = laneLayoutByDate.get(iso)?.laneCount || 1;
    maxLanesInWeek = Math.max(maxLanesInWeek, laneCount);
  }

  grid.style.setProperty('--week-row-height', `${shiftLaneRowHeightPx(maxLanesInWeek)}px`);
  grid.style.setProperty('--week-hour-width', `${TIME_GRID_HOUR_WIDTH_PX}px`);

  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = toISODate(d);

    const dayLabel = document.createElement('div');
    dayLabel.className = 'week-day-label';
    dayLabel.textContent = `${weekdayLabel(d)} ${dayNumber(d)}`;
    dayLabel.dataset.date = iso;
    dayLabel.style.gridColumn = '1';
    dayLabel.style.gridRow = String(i + 2);
    dayLabel.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      navigateWith({ view: 'day', date: iso });
    });
    grid.appendChild(dayLabel);

    for (let hour = 0; hour < 24; hour++) {
      const hourStr = `${String(hour).padStart(2, '0')}:00`;
      const slot = document.createElement('div');
      slot.className = 'week-hour-cell';
      slot.dataset.date = iso;
      slot.dataset.hour = hourStr;
      if (iso === config.today) slot.classList.add('calendar-cell-today');
      slot.style.gridRow = String(i + 2);
      slot.style.gridColumn = String(hour + 2);
      grid.appendChild(slot);
    }

    const layer = document.createElement('div');
    layer.className = 'week-shifts-layer week-shifts-layer-horizontal';
    layer.dataset.date = iso;
    layer.style.gridColumn = '2 / -1';
    layer.style.gridRow = String(i + 2);

    const laneInfo = laneLayoutByDate.get(iso) || { laneById: new Map(), laneCount: 1 };
    (byDate.get(iso) || []).forEach((s) => {
      const chip = renderShiftChip(s);
      const laneIndex = laneInfo.laneById.get(String(s.id)) ?? 0;
      applyTimedShiftChipHorizontal(chip, s, 0, laneIndex, laneInfo.laneCount);
      layer.appendChild(chip);
    });
    grid.appendChild(layer);
  }
}

function renderMonthGrid(config, shifts) {
  const grid = document.getElementById('monthGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const anchor = new Date(`${config.anchor}T00:00:00`);
  const startFallback = new Date(`${config.start}T00:00:00`);
  const anchorDate = Number.isNaN(anchor.getTime()) ? startFallback : anchor;

  const anchorMonth = anchorDate.getMonth();
  const anchorYear = anchorDate.getFullYear();
  const firstOfMonth = new Date(anchorYear, anchorMonth, 1);
  const startDow = firstOfMonth.getDay(); // 0=Sun
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - startDow);

  const byDate = new Map();
  shifts.forEach((s) => {
    const dateKey = s.date;
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey).push(s);
  });

  byDate.forEach((list) => {
    list.sort(
      (a, b) =>
        parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time) ||
        parseTimeToMinutes(a.end_time) - parseTimeToMinutes(b.end_time) ||
        String(a.id).localeCompare(String(b.id)),
    );
  });

  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((label) => {
    const header = document.createElement('div');
    header.className = 'calendar-header-cell';
    header.textContent = label;
    grid.appendChild(header);
  });

  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const iso = toISODate(d);

    const cell = document.createElement('div');
    cell.className = 'calendar-cell';
    cell.dataset.date = iso;
    if (iso === config.today) cell.classList.add('calendar-cell-today');
    if (d.getMonth() !== anchorMonth) cell.classList.add('calendar-cell-other-month');

    const dateEl = document.createElement('div');
    dateEl.className = 'calendar-date';
    dateEl.textContent = String(d.getDate());
    cell.appendChild(dateEl);

    const list = document.createElement('div');
    list.className = 'manager-month-shift-list';

    (byDate.get(iso) || []).forEach((s) => {
      list.appendChild(renderMonthShiftChip(s));
    });

    cell.appendChild(list);
    grid.appendChild(cell);
  }
}

function renderDayGrid(config, shifts) {
  const grid = document.getElementById('dayGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const dayShifts = shifts.filter((s) => s.date === config.anchor);
  const laneInfo = computeShiftLaneLayout(dayShifts);

  const rect = grid.getBoundingClientRect();
  const hourWidthPx = rect.width > 0 ? rect.width / 24 : TIME_GRID_HOUR_WIDTH_PX;
  grid.style.setProperty('--day-hour-width', `${hourWidthPx}px`);

  const headerHeight = 32;
  const availableBodyHeight = Math.max(120, Math.floor((grid.clientHeight || rect.height || 0) - headerHeight));
  const lanes = Math.max(1, laneInfo.laneCount || 1);
  const laneGapPx = SHIFT_LANE_GAP_PX;
  const maxHeightPerLane = Math.floor((availableBodyHeight - (lanes + 1) * laneGapPx) / lanes);
  const laneHeightPx = Math.max(14, maxHeightPerLane);

  for (let hour = 0; hour < 24; hour++) {
    const hourStr = `${String(hour).padStart(2, '0')}:00`;

    const header = document.createElement('div');
    header.className = 'day-hour-header';
    header.textContent = hourStr;
    header.dataset.hour = hourStr;
    header.style.gridRow = '1';
    header.style.gridColumn = String(hour + 1);
    header.addEventListener('click', (e) => {
      e.stopPropagation();
      openCreateShiftModal(config.anchor, hourStr);
    });
    grid.appendChild(header);

    const cell = document.createElement('div');
    cell.className = 'day-hour-cell';
    cell.dataset.date = config.anchor;
    cell.dataset.hour = hourStr;
    cell.style.gridRow = '2';
    cell.style.gridColumn = String(hour + 1);
    cell.addEventListener('click', (e) => {
      if (e.target.closest('.shift-chip')) return;
      openCreateShiftModal(config.anchor, hourStr);
    });
    grid.appendChild(cell);
  }

  if (!dayShifts.length) {
    const empty = document.createElement('div');
    empty.className = 'day-empty-state';
    empty.textContent = 'There is no shifts for today';
    empty.style.gridColumn = '1 / -1';
    empty.style.gridRow = '2';
    grid.appendChild(empty);
  }

  const layer = document.createElement('div');
  layer.className = 'day-shifts-layer day-shifts-layer-horizontal';
  layer.dataset.date = config.anchor;
  layer.style.gridColumn = '1 / -1';
  layer.style.gridRow = '2';

  dayShifts.forEach((s) => {
    const chip = renderShiftChip(s);
    chip.classList.add('shift-chip-compact');
    const laneIndex = laneInfo.laneById.get(String(s.id)) ?? 0;
    applyTimedShiftChipHorizontalDynamic(chip, s, 0, laneIndex, laneInfo.laneCount, hourWidthPx, laneHeightPx, laneGapPx);
    layer.appendChild(chip);
  });

  grid.appendChild(layer);
}

let activeShiftId = null;
let activeShiftData = null;
let managerCurrentShifts = [];

function urlFromTemplate(template, id) {
  return template.replace(/\/0\//, `/${id}/`);
}

function editShift() {
  if (!activeShiftData || !activeShiftId) return;

  closeModal('shiftDetailsModal');
  document.getElementById('createShiftTitle').textContent = 'Edit Shift';
  document.getElementById('createShiftSubmit').textContent = 'Save';

  const form = document.getElementById('createShiftForm');
  const page = document.getElementById('managerShiftPage');
  const updateTpl = page?.dataset.shiftUpdateUrlTemplate;
  if (form && updateTpl) form.action = urlFromTemplate(updateTpl, activeShiftId);

  document.getElementById('shiftDate').value = activeShiftData.date;
  document.getElementById('shiftStart').value = activeShiftData.start_time;
  document.getElementById('shiftEnd').value = activeShiftData.end_time;
  document.getElementById('shiftCapacity').value = String(activeShiftData.capacity);

  const positionSelect = document.getElementById('shiftPosition');
  if (positionSelect) {
    const positionId = activeShiftData.position_id ?? activeShiftData.positionId ?? '';
    Array.from(positionSelect.options).forEach((o) => {
      o.selected = String(o.value) === String(positionId);
    });
  }
  updateShiftPositionMultiLabel();

  document.getElementById('publishImmediatelyCustom').checked = activeShiftData.status === 'published';

  filterEmployeePicker();
  // set employees (after list is filtered to the selected position)
  const selectedIds = new Set((activeShiftData.assigned_employees || []).map((e) => String(e.id)));
  document.querySelectorAll('#employeeMulti input[type="checkbox"]').forEach((cb) => {
    cb.checked = selectedIds.has(String(cb.value));
  });
  updateEmployeeMulti();
  openModal('createShiftModal');
}

function deleteShift() {
  if (!activeShiftId) return;
  const titleEl = document.getElementById('deleteShiftConfirmTitle');
  if (titleEl) {
    const role = activeShiftData?.position || '';
    const time =
      activeShiftData?.start_time && activeShiftData?.end_time ? `${activeShiftData.start_time}–${activeShiftData.end_time}` : '';
    const date = activeShiftData?.date || '';
    titleEl.textContent = [role, time, date].filter(Boolean).join(' • ') || `#${activeShiftId}`;
  }
  openModal('deleteShiftConfirmModal');
}

function cancelDeleteShift() {
  closeModal('deleteShiftConfirmModal');
}

function confirmDeleteShift() {
  if (!activeShiftId) return;

  const form = document.getElementById('deleteShiftForm');
  const page = document.getElementById('managerShiftPage');
  const delTpl = page?.dataset.shiftDeleteUrlTemplate;
  if (!form || !delTpl) return;
  form.action = urlFromTemplate(delTpl, activeShiftId);
  form.submit();
}

function initManagerShifts() {
  const page = document.getElementById('managerShiftPage');
  if (!page) return;

  serverCanUndo = (page.dataset.canUndo || '') === '1';

  wireStickyOffsets();
  wireSelectionEscapeCancel();

  // If the page was restored from the back/forward cache, force a reload so newly created
  // shifts/roles show up correctly.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) window.location.reload();
  });

  const config = {
    baseUrl: page.dataset.baseUrl,
    view: page.dataset.view,
    anchor: page.dataset.anchor,
    start: page.dataset.start,
    end: page.dataset.end,
    today: page.dataset.today,
    shiftDetailsUrlTemplate: page.dataset.shiftDetailsUrlTemplate,
  };

  const shifts = parseJsonScript('managerShiftsData', []);
  managerCurrentShifts = Array.isArray(shifts) ? shifts : [];
  const formState = parseJsonScript('shiftFormState', null);

  initManagerMonthPicker(config);

  wireMultiSelectAutoClose();
  wireManagerFiltersMultiselectClickThrough();
  wireEmployeeChipRemovals();
  initEmployeeBuckets();
  updatePositionMulti();
  updateStatusMulti();
  updateShowMulti();
  updateEmployeeMulti();
  wireCreateShiftValidation();
  document.getElementById('shiftPosition')?.addEventListener('change', filterEmployeePicker);
  renderRoleLegend(collectPositionsFromDom(), managerCurrentShifts);
  refreshPositionsFromServer();

  wireCalendarClicks('weekGrid');
  wireCalendarClicks('monthGrid');

  if (config.view === 'month') renderMonthGrid(config, shifts);
  else if (config.view === 'day') renderDayGrid(config, shifts);
  else renderWeekGrid(config, shifts);
  updateSelectionUI();
  wireDayViewResizeReflow(config);

  if (formState && typeof formState === 'object') {
    resetCreateShiftModal();
    clearCreateShiftErrors();

    const mode = formState.mode || 'create';
    const shiftId = formState.shift_id;
    const dateInput = document.getElementById('shiftDate');
    if (dateInput && formState.date) dateInput.value = formState.date;
    const startInput = document.getElementById('shiftStart');
    if (startInput && formState.start_time) startInput.value = formState.start_time;
    const endInput = document.getElementById('shiftEnd');
    if (endInput && formState.end_time) endInput.value = formState.end_time;
    const capInput = document.getElementById('shiftCapacity');
    if (capInput && formState.capacity) capInput.value = String(formState.capacity);
    const positionSelect = document.getElementById('shiftPosition');
    if (positionSelect && formState.position_id) positionSelect.value = String(formState.position_id);
    const publish = document.getElementById('publishImmediatelyCustom');
    if (publish) publish.checked = !!formState.publish;

    filterEmployeePicker();
    const selectedIds = new Set((formState.employee_ids || []).map((x) => String(x)));
    document.querySelectorAll('#employeeMulti input[type="checkbox"]').forEach((cb) => {
      cb.checked = selectedIds.has(String(cb.value));
    });

    if (mode === 'update' && shiftId) {
      document.getElementById('createShiftTitle').textContent = 'Edit Shift';
      document.getElementById('createShiftSubmit').textContent = 'Save';
      const updateTpl = page.dataset.shiftUpdateUrlTemplate;
      const form = document.getElementById('createShiftForm');
      if (form && updateTpl) form.action = urlFromTemplate(updateTpl, shiftId);
    }

    updateEmployeeMulti();

    const errorField = formState.error_field;
    if (errorField === 'capacity') {
      document.getElementById('shiftCapacity')?.classList.add('form-error');
    } else if (errorField === 'employee_ids') {
      document.getElementById('employeeMulti')?.classList.add('form-error');
    }
    openModal('createShiftModal');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initManagerShifts);
} else {
  initManagerShifts();
}
