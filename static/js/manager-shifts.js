/**
 * =============================================================================
 * MANAGER SHIFTS PAGE - Main JavaScript Controller
 * =============================================================================
 * 
 * This file handles all client-side functionality for the manager's shift
 * scheduling interface. It manages:
 * 
 * 1. CALENDAR VIEWS (Week/Month/Day)
 *    - Rendering shift chips on time grids
 *    - Lane layout algorithm for overlapping shifts
 *    - Navigation between dates/views
 * 
 * 2. SHIFT MANAGEMENT
 *    - Create/Edit shift modal with form validation
 *    - Position and employee multi-select dropdowns
 *    - Shift details modal (view, edit, delete, publish)
 * 
 * 3. BULK OPERATIONS
 *    - Selection mode for multi-shift selection
 *    - Bulk publish/delete functionality
 *    - Undo support
 * 
 * 4. EMPLOYEE SIDEBAR
 *    - Employee list with search/filter/sort
 *    - Shift highlighting per employee
 *    - Hours worked statistics
 * 
 * 5. FILTERS & URL STATE
 *    - Position filter (multiselect with checkboxes)
 *    - Status filter (draft/published)
 *    - Show filter (all/understaffed)
 *    - URL-based state persistence
 * 
 * 6. ROLE LEGEND
 *    - Color-coded position legend at bottom
 *    - Dynamic palette generation based on position ID
 * 
 * Dependencies:
 *   - app.js (openModal, closeModal, showToast, parseJsonScript, etc.)
 *   - calendar-utils.js (toISODate, weekdayLabel, dayNumber, navigateWith, etc.)
 * 
 * =============================================================================
 */

// =============================================================================
// SECTION 1: UTILITY HELPERS & SELECTORS
// =============================================================================
// Small reusable functions used throughout the file to reduce code duplication.

/** Shorthand for document.getElementById - saves typing and bytes */
const getEl = (id) => document.getElementById(id);

/** Gets the dataset from the main page container (contains URLs, config, etc.) */
const getPageData = () => getEl('managerShiftPage')?.dataset;

/** Pads a number to 2 digits with leading zero (e.g., 9 → "09") */
const pad2 = (n) => String(n).padStart(2, '0');

// CSS selectors for commonly accessed checkbox groups
const POSITION_CB_SEL = '#positionMulti input[type="checkbox"]';
const EMPLOYEE_CB_SEL = '#employeeMulti input[type="checkbox"]';

/** Returns NodeList of all position filter checkboxes */
const getPositionCbs = () => document.querySelectorAll(POSITION_CB_SEL);

/** Returns array of all employee picker checkboxes */
const getEmployeeCbs = () => [...document.querySelectorAll(EMPLOYEE_CB_SEL)];

/**
 * Clears specified inline style properties from an element.
 * Used to reset dropdown menu positioning after close.
 */
function clearStyles(el, ...props) {
  if (!el) return;
  for (const p of props) el.style[p] = '';
}

/**
 * Creates a styled empty state message element.
 * Used when lists have no items to display.
 */
function createEmptyMessage(text, className = 'text-sm text-muted') {
  const el = document.createElement('div');
  el.className = className;
  el.style.padding = '.5rem .75rem';
  el.textContent = text;
  return el;
}

/**
 * Gets the label text for a checked radio button in a container.
 * Used to display current filter selection in dropdown triggers.
 */
function getRadioLabel(containerId, name, fallback = 'All') {
  const checked = document.querySelector(`#${containerId} input[name="${name}"]:checked`);
  if (!checked?.value) return fallback;
  return checked.parentElement?.textContent?.trim() || fallback;
}

// =============================================================================
// SECTION 2: FILTER URL BUILDER
// =============================================================================
// Builds URLs from the filter form state for navigation.
// When user changes filters, the page reloads with new URL params.

/**
 * Constructs a URL with current filter selections as query parameters.
 * Reads from the managerFiltersForm and builds a clean URL.
 * 
 * Special handling:
 * - Removes 'positions' param if all or none are selected (means "show all")
 * - Removes empty status/show params
 * 
 * @returns {string|null} The constructed URL or null if form not found
 */
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
    if (checkedCount === 0 || checkedCount === positionBoxes.length) params.delete('positions');
  }

  if ((params.get('status') || '') === '') params.delete('status');
  if ((params.get('show') || '') === '') params.delete('show');

  url.search = params.toString();
  return url.toString();
}

/** Navigates to the URL built from current filter state */
function submitManagerFiltersForm() {
  const url = buildManagerFiltersUrl();
  if (!url) return;
  window.location.assign(url);
}

/** 
 * Called from HTML onclick handlers on filter buttons.
 * Closes any open dropdowns first, then submits filters.
 */
function submitFilters() {
  window.closeAllMultiselects?.('programmatic');
  submitManagerFiltersForm();
}

// =============================================================================
// SECTION 3: MULTI-SELECT DROPDOWN HANDLING
// =============================================================================
// Manages the custom multiselect dropdowns (position, status, show filters).
// These are custom UI components, not native <select> elements.

/**
 * Updates the status filter dropdown trigger label.
 * Capitalizes the selected value or shows "All" if none selected.
 */
function updateStatusMulti() {
  const label = getEl('statusMultiLabel');
  if (!label) return;
  const value = document.querySelector('#statusMulti input[name="status"]:checked')?.value;
  label.textContent = value ? value.charAt(0).toUpperCase() + value.slice(1) : 'All';
}

/** Updates the "show" filter dropdown trigger label */
function updateShowMulti() {
  const label = getEl('showMultiLabel');
  if (!label) return;
  const value = document.querySelector('#showMulti input[name="show"]:checked')?.value;
  label.textContent = !value ? 'All' : value === 'understaffed' ? 'Understaffed only' : value;
}

/**
 * Marks the position multiselect as "dirty" (changed).
 * When the dropdown closes, dirty state triggers a filter submission.
 */
function markPositionMultiDirty() {
  const ms = getEl('positionMulti');
  if (!ms) return;
  ms.dataset.dirty = '1';
}

// Flag to ensure hooks are only wired once
let managerMultiselectHooksWired = false;

/** Resets the month picker dropdown menu positioning styles */
function resetManagerMonthPickerMenu(el) {
  clearStyles(el?.querySelector?.('.multiselect-menu'), 'position', 'top', 'left', 'right', 'bottom', 'transform', 'maxWidth', 'width');
}

/**
 * Positions the month picker dropdown menu.
 * Calculates position to center under the trigger while staying in viewport.
 */
function positionManagerMonthPickerMenu(el) {
  const trigger = el?.querySelector?.('.multiselect-trigger');
  const label = el?.querySelector?.('#periodLabel');
  const menu = el?.querySelector?.('.multiselect-menu');
  if (!trigger || !menu) return;

  const triggerRect = trigger.getBoundingClientRect();
  const labelRect = (label || trigger).getBoundingClientRect();

  menu.style.position = 'fixed';
  menu.style.transform = '';
  menu.style.width = '';
  menu.style.maxWidth = `calc(100vw - 16px)`;

  const menuWidth = Math.max(0, menu.offsetWidth || 0);
  const margin = 8;
  const vw = window.innerWidth || document.documentElement.clientWidth || 0;

  const centerX = labelRect.left + labelRect.width / 2;
  let left = centerX - menuWidth / 2;
  left = Math.min(Math.max(margin, left), Math.max(margin, vw - menuWidth - margin));

  menu.style.top = `${Math.round(triggerRect.bottom + 6)}px`;
  menu.style.left = `${Math.round(left)}px`;
  menu.style.right = 'auto';
  menu.style.bottom = 'auto';
}

/**
 * Sets up global event listeners for multiselect dropdown events.
 * Uses custom events dispatched by app.js multiselect system:
 * - multiselect:willopen - before dropdown opens
 * - multiselect:didopen - after dropdown opened
 * - multiselect:didclose - after dropdown closed
 */
function wireManagerMultiselectHooks() {
  if (managerMultiselectHooksWired) return;
  managerMultiselectHooksWired = true;

  document.addEventListener('multiselect:willopen', (e) => {
    const id = e.detail?.id || '';
    if (id === 'employeeMulti') filterEmployeePicker();
    if (id === 'positionMulti') refreshPositionsFromServer();
  });

  document.addEventListener('multiselect:didopen', (e) => {
    const id = e.detail?.id || '';
    if (id !== 'managerMonthPicker') return;
    const el = e.detail?.el;
    window.requestAnimationFrame(() => positionManagerMonthPickerMenu(el));
  });

  document.addEventListener('multiselect:didclose', (e) => {
    const id = e.detail?.id || '';
    const el = e.detail?.el;
    const reason = e.detail?.reason || '';

    if (id === 'managerMonthPicker') {
      resetManagerMonthPickerMenu(el);
      return;
    }

    if (id !== 'positionMulti') return;
    if (!['toggle', 'auto-close', 'escape'].includes(reason)) return;
    if (!el || el.dataset.dirty !== '1') return;
    el.dataset.dirty = '0';
    submitManagerFiltersForm();
  });
}

/** Helper to check/uncheck all position filter checkboxes */
function selectAllPositions(on) {
  getPositionCbs().forEach((cb) => (cb.checked = on));
  updatePositionMulti();
}

/**
 * Updates the position filter dropdown trigger label.
 * Shows "All positions", comma-separated names, or count based on selection.
 */
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

/**
 * Rebuilds the position filter dropdown menu with current positions.
 * Called after fetching fresh positions from server.
 * 
 * @param {Array} positions - Array of {id, name, is_active} objects
 */
function rebuildPositionFilterOptions(positions) {
  const menu = document.querySelector('#positionMulti .multiselect-menu');
  if (!menu) return;
  menu.innerHTML = '';

  if (!positions.length) {
    menu.appendChild(createEmptyMessage('No positions yet. Add roles in Employees → Manage roles.'));
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

/**
 * Rebuilds the hidden <select> element for shift position.
 * This is the actual form field submitted with the create/edit form.
 * The visible UI is a custom multiselect styled dropdown.
 */
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

/** Updates the shift position dropdown trigger to show selected position name */
function updateShiftPositionMultiLabel() {
  const label = getEl('shiftPositionMultiLabel');
  if (!label) return;
  const select = getEl('shiftPosition');
  const opt = select?.selectedOptions?.[0];
  label.textContent = opt?.value ? opt.textContent?.trim() || 'Select position...' : 'Select position...';
}

/**
 * Sets the shift position when user clicks a radio in the dropdown.
 * Updates hidden select, closes dropdown, and triggers change event.
 */
function setShiftPosition(value) {
  const select = getEl('shiftPosition');
  if (select) select.value = String(value || '');
  updateShiftPositionMultiLabel();
  select?.dispatchEvent(new Event('change', { bubbles: true }));
  window.closeAllMultiselects?.();
}

/**
 * Rebuilds the shift position dropdown menu (radio buttons).
 * Used in the create/edit shift modal.
 */
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

/**
 * Fetches fresh position data from the server via AJAX.
 * Called when opening position dropdown or create shift modal.
 * Rebuilds all position-related UI components with fresh data.
 */
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
    updateStatusMulti();
    updateShowMulti();
    updateShiftPositionMultiLabel();
    renderRoleLegend(positions, managerCurrentShifts);
  } catch (e) {
    // ignore
  }
}

/**
 * Updates the employee multiselect to show chips for selected employees.
 * Creates removable chips or shows placeholder text.
 */
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
    remove.textContent = '×';

    const text = document.createElement('span');
    text.className = 'chip-text';
    text.textContent = name;

    chip.appendChild(remove);
    chip.appendChild(text);
    chips.appendChild(chip);
  });
}

/** Helper to check/uncheck all visible employee checkboxes */
function selectAllEmployees(on) {
  document.querySelectorAll('#employeeMulti .employee-item input[type="checkbox"]').forEach((cb) => {
    // Only affect visible employees (hidden ones are for other positions)
    if (cb.closest('.employee-item')?.classList.contains('hidden')) return;
    cb.checked = on;
  });
  updateEmployeeMulti();
}

// =============================================================================
// SECTION 4: EMPLOYEE PICKER OPTIMIZATION
// =============================================================================
// Employee list is pre-grouped by position and dynamically shown/hidden
// based on selected shift position. This avoids re-rendering on every change.

/** Cache of employee DOM elements grouped by position ID */
let employeeBuckets = null;

/** Last selected position ID - used to detect position changes */
let lastShiftPositionId = null;

/**
 * Initializes the employee bucket cache on first call.
 * Groups employee items by their position_id and removes them from DOM.
 * Items are re-added when their position is selected.
 * 
 * @returns {Map} Map of positionId → array of DOM elements
 */
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

  // Remove all items from DOM; only append matching position when selected.
  for (const c of [...list.children]) c.remove();

  return employeeBuckets;
}

/** Unchecks all employee checkboxes across all position buckets */
function clearAllEmployeeSelections() {
  initEmployeeBuckets();
  employeeBuckets.forEach((rows) => {
    rows.forEach((row) => {
      const cb = row.querySelector('input[type="checkbox"]');
      if (cb) cb.checked = false;
    });
  });
}

/**
 * Wires up click handlers for the "×" buttons on employee chips.
 * Uses event delegation on the chips container for efficiency.
 */
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

/**
 * Prevents clicks inside filter multiselects from bubbling up.
 * Needed because the filters are inside a form that might submit on click.
 */
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

// =============================================================================
// SECTION 5: CREATE/EDIT SHIFT MODAL
// =============================================================================
// Handles the modal form for creating new shifts or editing existing ones.
// The same modal is reused for both operations with different titles/actions.

/**
 * Resets the create shift modal to its default "create" state.
 * Clears all form fields and sets default values.
 */
function resetCreateShiftModal() {
  getEl('createShiftTitle').textContent = 'Create Shift';
  getEl('createShiftSubmit').textContent = 'Create Shift';

  const form = getEl('createShiftForm');
  if (form?.dataset.createAction) form.action = form.dataset.createAction;

  const dateInput = getEl('shiftDate');
  if (dateInput) dateInput.value = '';
  const startInput = getEl('shiftStart');
  if (startInput) startInput.value = '09:00';
  const endInput = getEl('shiftEnd');
  if (endInput) endInput.value = '17:00';
  const capInput = getEl('shiftCapacity');
  if (capInput) capInput.value = '1';
  const positionSelect = getEl('shiftPosition');
  if (positionSelect) positionSelect.value = '';
  updateShiftPositionMultiLabel();

  const publish = getEl('publishImmediatelyCustom');
  if (publish) publish.checked = false;

  clearAllEmployeeSelections();
  updateEmployeeMulti();
}

/**
 * Opens the create shift modal with optional pre-filled values.
 * Called when clicking on a calendar cell.
 * 
 * @param {string} dateStr - ISO date string (YYYY-MM-DD)
 * @param {string} startTime - Start time (HH:MM) or undefined
 * @param {string} endTime - End time (HH:MM) or undefined (defaults to start+1h)
 */
function openCreateShiftModal(dateStr, startTime, endTime) {
  refreshPositionsFromServer();
  resetCreateShiftModal();
  const dateInput = getEl('shiftDate');
  if (dateInput && dateStr) dateInput.value = dateStr;

  const startInput = getEl('shiftStart');
  if (startInput && startTime) startInput.value = startTime;

  const endInput = getEl('shiftEnd');
  if (endInput) {
    if (endTime) endInput.value = endTime;
    else if (startTime) {
      const [h, m] = startTime.split(':').map((x) => parseInt(x, 10));
      endInput.value = `${pad2((Number.isFinite(h) ? h + 1 : 1) % 24)}:${pad2(Number.isFinite(m) ? m : 0)}`;
    }
  }

  filterEmployeePicker();
  updateEmployeeMulti();
  openModal('createShiftModal');
}

/**
 * Filters the employee picker to show only employees for the selected position.
 * Uses the bucket system for efficient DOM manipulation.
 * 
 * When position changes:
 * 1. Clears previous selections
 * 2. Removes old position's employees from DOM
 * 3. Adds new position's employees to DOM
 */
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

/** Clears validation error styling from capacity and employee fields */
function clearCreateShiftErrors() {
  getEl('shiftCapacity')?.classList.remove('form-error');
  getEl('employeeMulti')?.classList.remove('form-error');
  const capErr = getEl('capacityError');
  const empErr = getEl('employeeAssignError');
  if (capErr) { capErr.classList.add('hidden'); capErr.textContent = ''; }
  if (empErr) { empErr.classList.add('hidden'); empErr.textContent = ''; }
}

/**
 * Wires up client-side validation for the create/edit shift form.
 * 
 * Validates:
 * - End time must be after start time
 * - Cannot assign more employees than capacity allows
 */
function wireCreateShiftValidation() {
  const form = getEl('createShiftForm');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    clearCreateShiftErrors();

    const start = getEl('shiftStart')?.value;
    const end = getEl('shiftEnd')?.value;
    if (start && end && start >= end) {
      e.preventDefault();
      showToast('error', 'Invalid time range', 'End time must be after start time.');
      return;
    }

    const capEl = getEl('shiftCapacity');
    const capacity = parseInt(capEl?.value || '0', 10);
    const selected = getEmployeeCbs().filter((cb) => cb.checked).length;
    if (Number.isFinite(capacity) && capacity > 0 && selected > capacity) {
      e.preventDefault();
      capEl?.classList.add('form-error');
      getEl('employeeMulti')?.classList.add('form-error');

      const msg = 'Cannot assign more employees than shift capacity.';
      const capErr = getEl('capacityError');
      const empErr = getEl('employeeAssignError');
      if (capErr) { capErr.textContent = msg; capErr.classList.remove('hidden'); }
      if (empErr) { empErr.textContent = msg; empErr.classList.remove('hidden'); }
    }
  });

  getEl('shiftCapacity')?.addEventListener('input', clearCreateShiftErrors);
  getEl('shiftPosition')?.addEventListener('change', clearCreateShiftErrors);
  getEl('employeeMulti')?.addEventListener('change', clearCreateShiftErrors);
}

// =============================================================================
// SECTION 6: TIME HELPERS & LAYOUT CONSTANTS
// =============================================================================
// Functions and constants for time calculations and grid layout.

/**
 * Converts a time string (HH:MM) to total minutes from midnight.
 * Used for positioning shift chips on the time grid.
 * 
 * @param {string} value - Time string like "09:30"
 * @returns {number} Minutes from midnight (e.g., 570 for 09:30)
 */
function parseTimeToMinutes(value) {
  const [h, m] = String(value || '00:00')
    .split(':')
    .slice(0, 2)
    .map((x) => parseInt(x, 10));
  const hh = Number.isFinite(h) ? h : 0;
  const mm = Number.isFinite(m) ? m : 0;
  return hh * 60 + mm;
}

// Grid layout constants for the time-based views
const TIME_GRID_HOUR_WIDTH_PX = 72;    // Width per hour in day view (horizontal)
const TIME_GRID_HOUR_HEIGHT_PX = 56;   // Height per hour in week view (vertical)
const SHIFT_LANE_HEIGHT_PX = 60;       // Height of each shift lane in day view
const SHIFT_LANE_GAP_PX = 4;           // Gap between shift lanes

// =============================================================================
// SECTION 7: ROLE COLOR PALETTE SYSTEM
// =============================================================================
// Generates consistent colors for each position/role based on their ID.
// Uses HSL color space to ensure readable, distinct colors.

/**
 * Generates a color palette for a position based on its ID.
 * Uses modular arithmetic to spread hues across the spectrum.
 * 
 * @param {number|string} positionId - The position's unique ID
 * @returns {Object|null} {bg, border, fg} color values or null
 */
function computeRolePalette(positionId) {
  const n = parseInt(positionId, 10);
  if (!Number.isFinite(n)) return null;

  const hue = ((n * 47) % 360 + 360) % 360;
  const bg = `hsl(${hue} 80% 92%)`;
  const border = `hsl(${hue} 70% 45%)`;
  const fg = `hsl(${hue} 60% 20%)`;
  return { bg, border, fg };
}

/**
 * Applies role-specific CSS custom properties to an element.
 * The element can then use these variables for consistent styling.
 */
function applyRolePaletteToElement(el, positionId) {
  const palette = computeRolePalette(positionId);
  if (!el || !palette) return;
  el.classList.add('shift-chip-role');
  el.style.setProperty('--role-bg', palette.bg);
  el.style.setProperty('--role-border', palette.border);
  el.style.setProperty('--role-fg', palette.fg);
}

/** Extracts position data from the filter dropdown DOM for rendering legend */
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

/**
 * Renders the color legend at the bottom of the page.
 * Shows all positions that have published shifts in the current view.
 * Also shows "Draft" indicator if any draft shifts exist.
 * 
 * @param {Array} positions - All available positions
 * @param {Array} shifts - Current shifts being displayed
 */
function renderRoleLegend(positions, shifts) {
  const card = getEl('roleLegendCard');
  const root = getEl('roleLegend');
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

// =============================================================================
// SECTION 8: EMPLOYEE SIDEBAR
// =============================================================================
// The right sidebar showing employees with their hours and highlighting controls.

// Module-level state for sidebar
let managerEmployees = [];                // All employees from server
let managerEmployeePeriodStats = {        // Computed stats for current period
  minutesByEmployeeId: new Map(),         // Total work minutes per employee
  shiftIdsByEmployeeId: new Map()         // Set of shift IDs per employee
};
let activeEmployeeHighlightId = null;     // Currently highlighted employee ID
let employeeSidebarControlsWired = false; // Prevent duplicate event binding

/**
 * Computes work statistics for each employee from shift data.
 * Calculates total minutes worked and collects shift IDs per employee.
 * 
 * @param {Array} shifts - Array of shift objects
 * @returns {Object} {minutesByEmployeeId, shiftIdsByEmployeeId} Maps
 */
function computeEmployeePeriodStats(shifts) {
  const minutesByEmployeeId = new Map();
  const shiftIdsByEmployeeId = new Map();

  (Array.isArray(shifts) ? shifts : []).forEach((s) => {
    if (!s) return;
    const shiftId = String(s.id ?? '');
    if (!shiftId) return;

    const durationMinutes = Math.max(0, parseTimeToMinutes(s.end_time) - parseTimeToMinutes(s.start_time));
    const assignedIds = Array.isArray(s.assigned_employee_ids) ? s.assigned_employee_ids : [];

    assignedIds.forEach((eid) => {
      const employeeId = String(eid ?? '');
      if (!employeeId) return;

      minutesByEmployeeId.set(employeeId, (minutesByEmployeeId.get(employeeId) || 0) + durationMinutes);
      if (!shiftIdsByEmployeeId.has(employeeId)) shiftIdsByEmployeeId.set(employeeId, new Set());
      shiftIdsByEmployeeId.get(employeeId).add(shiftId);
    });
  });

  return { minutesByEmployeeId, shiftIdsByEmployeeId };
}

/**
 * Extracts initials from a person's name.
 * "John Doe" → "JD", "Alice" → "AL"
 */
function initialsFromName(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'E';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

/**
 * Formats minutes as compact hours display.
 * 90 → "1.5h", 60 → "1h", 30 → "0.5h"
 */
function formatHoursCompact(minutes) {
  const total = Math.max(0, parseInt(minutes, 10) || 0);
  const rounded = Math.round((total / 60) * 10) / 10;
  return `${String(rounded).replace(/\.0$/, '')}h`;
}

/** Updates the active/pressed state of sidebar items based on highlight selection */
function syncEmployeeSidebarActiveState() {
  const list = getEl('employeeSidebarList');
  if (!list) return;

  for (const row of list.querySelectorAll('.employee-sidebar-item')) {
    const id = row.dataset.employeeId || '';
    const active = !!activeEmployeeHighlightId && id === String(activeEmployeeHighlightId);
    row.classList.toggle('active', active);

    const btn = row.querySelector('.employee-highlight-btn');
    if (btn) {
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    }
  }
}

/**
 * Applies highlight styling to shift chips for the selected employee.
 * Adds 'shift-chip-employee-highlight' class to matching chips.
 */
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

/** Toggles highlight state for an employee (click handler for sidebar button) */
function toggleEmployeeHighlight(employeeId) {
  const id = String(employeeId || '');
  if (!id) return;
  activeEmployeeHighlightId = activeEmployeeHighlightId === id ? null : id;
  applyEmployeeShiftHighlight();
  syncEmployeeSidebarActiveState();
}

/** Wires up search/filter/sort controls for the sidebar (once only) */
function wireEmployeeSidebarControls() {
  if (employeeSidebarControlsWired) return;
  employeeSidebarControlsWired = true;

  getEl('employeeSidebarSearch')?.addEventListener('input', renderEmployeeSidebar);
  getEl('employeeSidebarPosition')?.addEventListener('change', renderEmployeeSidebar);
  getEl('employeeSidebarSort')?.addEventListener('change', renderEmployeeSidebar);
}

/**
 * Renders the employee sidebar list with filtering, searching, and sorting.
 * 
 * Features:
 * - Search by name or position
 * - Filter by position
 * - Sort by hours worked or name
 * - Shows hours per employee for current period
 * - Highlight button to emphasize employee's shifts
 */
function renderEmployeeSidebar() {
  const sidebar = getEl('managerEmployeeSidebar');
  const list = getEl('employeeSidebarList');
  if (!sidebar || !list) return;

  const query = (getEl('employeeSidebarSearch')?.value || '').trim().toLowerCase();
  const filterPosition = getEl('employeeSidebarPosition')?.value || '';
  const sortMode = getEl('employeeSidebarSort')?.value || 'hours_asc';

  const minutesById = managerEmployeePeriodStats?.minutesByEmployeeId || new Map();

  const filtered = (Array.isArray(managerEmployees) ? managerEmployees : []).filter((e) => {
    if (!e) return false;
    const positionId = e.position_id ?? e.positionId ?? null;
    if (!filterPosition) return true;
    if (filterPosition === '__none__') return positionId === null || positionId === undefined || String(positionId) === '';
    return String(positionId) === String(filterPosition);
  });

  const enriched = filtered
    .map((e) => {
      const id = String(e.id ?? '');
      const name = String(e.name || '');
      return {
        ...e,
        _id: id,
        _name: name,
        _minutes: minutesById.get(id) || 0,
        _search: `${name} ${String(e.position || '')}`.trim().toLowerCase(),
      };
    })
    .filter((e) => {
      if (!query) return true;
      return e._search.includes(query);
    });

  if (sortMode === 'hours_asc') {
    enriched.sort(
      (a, b) =>
        a._minutes - b._minutes ||
        a._name.localeCompare(b._name) ||
        String(a._id).localeCompare(String(b._id)),
    );
  } else {
    enriched.sort((a, b) => a._name.localeCompare(b._name) || String(a._id).localeCompare(String(b._id)));
  }

  const meta = getEl('employeeSidebarMeta');
  if (meta) {
    const total = Array.isArray(managerEmployees) ? managerEmployees.length : 0;
    meta.textContent = total ? `${enriched.length}/${total}` : '';
  }

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
    row.setAttribute('role', 'listitem');
    row.dataset.employeeId = e._id;
    if (e.position_id !== null && e.position_id !== undefined) row.dataset.positionId = String(e.position_id);

    const avatar = document.createElement('div');
    avatar.className = 'employee-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = initialsFromName(e._name);

    const meta = document.createElement('div');
    meta.className = 'employee-sidebar-meta';

    const name = document.createElement('div');
    name.className = 'employee-sidebar-name';
    name.textContent = e._name || 'Employee';

    const sub = document.createElement('div');
    sub.className = 'employee-sidebar-sub';

    const badge = document.createElement('span');
    badge.className = 'badge badge-outline employee-position-badge';
    const positionLabel = String(e.position || '').trim() || 'Unassigned';
    badge.textContent = positionLabel;
    if (e.position_id) applyRolePaletteToElement(badge, e.position_id);

    const hours = document.createElement('span');
    hours.className = 'employee-sidebar-hours';
    hours.textContent = formatHoursCompact(e._minutes);

    sub.appendChild(badge);
    sub.appendChild(hours);
    meta.appendChild(name);
    meta.appendChild(sub);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-outline btn-icon employee-highlight-btn';
    btn.setAttribute('aria-label', `Highlight shifts for ${e._name || 'employee'}`);
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"></circle>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    `;
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      toggleEmployeeHighlight(e._id);
    });

    row.appendChild(avatar);
    row.appendChild(meta);
    row.appendChild(btn);
    frag.appendChild(row);
  });

  list.appendChild(frag);
  syncEmployeeSidebarActiveState();
}

// =============================================================================
// SECTION 9: SHIFT LANE LAYOUT ALGORITHM
// =============================================================================
// When multiple shifts overlap in time, they need to be displayed in separate
// "lanes" (columns in week view, rows in day view) to avoid visual overlap.

/**
 * Computes lane assignments for overlapping shifts using a greedy algorithm.
 * 
 * Algorithm:
 * 1. Sort shifts by start time
 * 2. For each shift, find the first lane where it fits (no overlap)
 * 3. If no lane available, create a new one
 * 
 * @param {Array} shifts - Array of shift objects with start_time, end_time, id
 * @returns {Object} {laneById: Map<id, laneIndex>, laneCount: number}
 */
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

/**
 * Positions a shift chip vertically on the week grid (time flows top-to-bottom).
 * Sets top position based on start time and height based on duration.
 * 
 * @param {HTMLElement} chip - The shift chip element
 * @param {Object} shift - Shift data with start_time, end_time
 * @param {number} laneIndex - Which lane (column) the chip is in
 * @param {number} laneCount - Total number of lanes for the day
 * @param {number} hourHeightPx - Pixels per hour for positioning
 */
function applyTimedShiftChipVertical(chip, shift, laneIndex, laneCount, hourHeightPx) {
  if (!chip || !shift) return;

  const start = parseTimeToMinutes(shift.start_time);
  const end = parseTimeToMinutes(shift.end_time);
  const durationMinutes = Math.max(0, end - start);
  const hourHeight = Number.isFinite(hourHeightPx) && hourHeightPx > 0 ? hourHeightPx : TIME_GRID_HOUR_HEIGHT_PX;

  chip.classList.add('shift-chip-timed');
  chip.style.top = `${(start / 60) * hourHeight}px`;
  chip.style.height = `${Math.max(18, (durationMinutes / 60) * hourHeight)}px`;

  const lanes = Math.max(1, laneCount || 1);
  const lane = Math.min(Math.max(0, laneIndex || 0), lanes - 1);
  const pct = 100 / lanes;
  const gap = SHIFT_LANE_GAP_PX;
  chip.style.left = `calc(${lane * pct}% + ${gap}px)`;
  chip.style.width = `calc(${pct}% - ${gap * 2}px)`;
}

/**
 * Auto-scrolls the week grid to show the earliest shift.
 * Improves UX by not starting at midnight when shifts are later in the day.
 */
function autoScrollWeekGridToEarliestShift(gridEl, shifts, hourHeightPx) {
  const grid = gridEl;
  if (!grid) return;
  const list = Array.isArray(shifts) ? shifts : [];
  if (!list.length) return;

  let earliest = Infinity;
  list.forEach((s) => {
    const m = parseTimeToMinutes(s?.start_time);
    if (Number.isFinite(m)) earliest = Math.min(earliest, m);
  });
  if (!Number.isFinite(earliest) || earliest === Infinity) return;

  const hour = Math.max(0, Math.min(23, Math.floor(earliest / 60)));
  const hh = Number.isFinite(hourHeightPx) && hourHeightPx > 0 ? hourHeightPx : TIME_GRID_HOUR_HEIGHT_PX;
  const target = Math.max(0, Math.floor(hour * hh));

  window.requestAnimationFrame(() => {
    grid.scrollTop = target;
  });
}

/**
 * Positions a shift chip horizontally on the day grid (time flows left-to-right).
 * Sets left position based on start time and width based on duration.
 * 
 * @param {HTMLElement} chip - The shift chip element
 * @param {Object} shift - Shift data with start_time, end_time
 * @param {number} hourStartMinutes - Minutes offset for the grid start
 * @param {number} laneIndex - Which lane (row) the chip is in
 * @param {number} laneCount - Total number of lanes for the day
 * @param {number} hourWidthPx - Pixels per hour for horizontal positioning
 * @param {number} laneHeightPx - Height of each lane in pixels
 * @param {number} laneGapPx - Gap between lanes in pixels
 */
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

// =============================================================================
// SECTION 10: CALENDAR NAVIGATION
// =============================================================================
// Functions for navigating between views and time periods.

/** Configuration for period navigation steps per view */
const MANAGER_PERIOD_NAV = {
  defaultView: 'week',
  viewSteps: {
    day: { days: 1, view: 'day' },      // Day view: +/- 1 day
    week: { days: 7, view: 'week' },    // Week view: +/- 7 days
    month: { months: 1, view: 'month' }, // Month view: +/- 1 month
  },
};

/** Switches to a different calendar view (day/week/month) */
function switchView(view) {
  window.calendarSwitchView?.('managerShiftPage', view);
}

/** Navigates to the previous period (day/week/month depending on view) */
function prevPeriod() {
  window.calendarPrevPeriod?.('managerShiftPage', MANAGER_PERIOD_NAV);
}

/** Navigates to the next period */
function nextPeriod() {
  window.calendarNextPeriod?.('managerShiftPage', MANAGER_PERIOD_NAV);
}

/** Navigates to today in week view */
function goToToday() {
  window.calendarGoToToday?.('managerShiftPage', 'week');
}

// =============================================================================
// SECTION 11: MONTH PICKER WIDGET
// =============================================================================
// A grid of months for quick navigation to specific month views.

// State for the month picker
let managerMonthPickerYear = null;       // Currently displayed year in picker
let managerMonthPickerAnchorYear = null; // Year of the current view anchor
let managerMonthPickerAnchorMonth = null; // Month of the current view anchor

/** Renders the month picker grid with Jan-Dec buttons */
function renderManagerMonthPicker() {
  const yearLabel = getEl('managerMonthPickerYearLabel');
  const grid = getEl('managerMonthPickerGrid');
  if (!yearLabel || !grid) return;

  yearLabel.textContent = String(managerMonthPickerYear || '');
  grid.innerHTML = '';

  const now = new Date();
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth();

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
    if (managerMonthPickerYear === nowYear && idx === nowMonth) {
      btn.classList.add('current');
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

/** Shows previous year in month picker */
function managerMonthPickerPrevYear() {
  managerMonthPickerYear = (managerMonthPickerYear || new Date().getFullYear()) - 1;
  renderManagerMonthPicker();
}

/** Shows next year in month picker */
function managerMonthPickerNextYear() {
  managerMonthPickerYear = (managerMonthPickerYear || new Date().getFullYear()) + 1;
  renderManagerMonthPicker();
}

/** Initializes month picker state from calendar config */
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

// =============================================================================
// SECTION 12: STICKY HEADER LAYOUT
// =============================================================================
// Manages sticky positioning of header, toolbar, and legend.
// Calculates available height for the calendar grid.

/**
 * Sets up CSS custom properties for sticky element heights.
 * These are used by CSS to position sticky elements and size the calendar.
 * 
 * Runs on init and window resize to adapt to layout changes.
 */
function wireStickyOffsets() {
  const header = document.querySelector('.header');
  if (!header) return;

  const sync = () => {
    const root = document.documentElement;
    const headerHeight = header.getBoundingClientRect().height;
    root.style.setProperty('--header-sticky-height', `${headerHeight}px`);

    const toolbar = document.querySelector('.card.page-toolbar-card');
    const toolbarHeight = toolbar?.getBoundingClientRect().height || 0;
    root.style.setProperty('--toolbar-sticky-height', `${toolbarHeight}px`);

    const legend = getEl('roleLegendCard');
    const legendHeight = legend?.getBoundingClientRect().height || 0;
    root.style.setProperty('--bottom-legend-height', `${legendHeight}px`);

    const activeView = document.querySelector('#weekView.card:not(.hidden), #monthView.card:not(.hidden), #dayView.card:not(.hidden)');
    const viewMargin = activeView ? parseFloat(getComputedStyle(activeView).marginTop) || 0 : 0;

    const available = innerHeight - headerHeight - toolbarHeight - legendHeight - viewMargin * 2;
    root.style.setProperty('--manager-calendar-fill-height', `${Math.max(320, Math.floor(available))}px`);
  };

  sync();
  window.managerSyncStickyOffsets = sync;

  let resizeTimer;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(sync, 50);
  });
}

// =============================================================================
// SECTION 13: RENDERING UTILITIES
// =============================================================================
// Helper functions for rendering shift chips and formatting data.

/**
 * Escapes HTML special characters to prevent XSS.
 * Used when inserting user data into innerHTML.
 */
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

/**
 * Formats minutes as human-readable duration.
 * 90 → "1h 30m", 60 → "1h", 30 → "30m"
 */
function formatDurationMinutes(minutes) {
  const total = Math.max(0, parseInt(minutes, 10) || 0);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/** Formats ISO date as DD/MM/YYYY for display */
function formatDateDMY(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// =============================================================================
// SECTION 14: BULK SHIFT SELECTION
// =============================================================================
// Allows selecting multiple shifts for bulk publish/delete operations.
// Selection mode is toggled via toolbar button.

let selectionMode = false;              // Whether selection mode is active
const selectedShiftIds = new Set();     // Currently selected shift IDs
let selectionHistory = [];              // Stack for undo functionality
let serverCanUndo = false;              // Whether server has undo available

/** Enables or disables selection mode, clearing selection when turning off */
function setSelectMode(on) {
  selectionMode = !!on;
  if (!selectionMode) {
    selectedShiftIds.clear();
    selectionHistory = [];
  }
  updateSelectionUI();
}

/**
 * Updates all selection-related UI elements.
 * - Toggles button text (Select/Cancel)
 * - Updates body class for selection mode styling
 * - Enables/disables undo button
 * - Adds/removes selected class from shift chips
 */
function updateSelectionUI() {
  const btn = getEl('selectModeBtn');
  if (btn) {
    btn.textContent = selectionMode ? 'Cancel' : 'Select';
    btn.classList.toggle('btn-primary', selectionMode);
    btn.classList.toggle('btn-outline', !selectionMode);
  }

  document.body?.classList?.toggle('selection-mode', selectionMode);

  const undoBtn = getEl('undoSelectBtn');
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

/** Toggles selection state for a single shift chip when clicked */
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

/** Returns selected shift IDs as comma-separated string for form submission */
function selectedIdsCsv() {
  return Array.from(selectedShiftIds).join(',');
}

// Global functions exposed on window for use in HTML onclick handlers
window.toggleSelectMode = function toggleSelectMode() {
  setSelectMode(!selectionMode);
};

/** Undoes the last selection change (restores previous selection state) */
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

/** 
 * Handles undo button in toolbar.
 * If in selection mode with history, undoes selection.
 * Otherwise, submits undo form to server.
 */
window.undoToolbar = function undoToolbar() {
  if (selectionMode && selectionHistory.length > 0) {
    window.undoSelection?.();
    return;
  }
  getEl('undoLastActionForm')?.submit();
};

/**
 * Handles publish button in toolbar.
 * If in selection mode, publishes selected shifts.
 * Otherwise, publishes all draft shifts.
 */
window.toolbarPublish = function toolbarPublish() {
  if (selectionMode) {
    if (!selectedShiftIds.size) {
      showToast('error', 'Select shifts', 'Select one or more shifts first.');
      return;
    }
    const input = getEl('publishSelectedIds');
    const form = getEl('publishSelectedForm');
    if (!input || !form) return;
    input.value = selectedIdsCsv();
    form.submit();
    return;
  }
  getEl('publishAllDraftsForm')?.submit();
};

/**
 * Handles delete button in toolbar.
 * If in selection mode, opens delete confirmation for selected shifts.
 * Otherwise, opens delete confirmation for all drafts.
 */
window.toolbarDelete = function toolbarDelete() {
  if (selectionMode) {
    if (!selectedShiftIds.size) {
      showToast('error', 'Select shifts', 'Select one or more shifts first.');
      return;
    }
    const input = getEl('deleteSelectedIds');
    if (input) input.value = selectedIdsCsv();
    openModal('deleteSelectedModal');
    return;
  }
  openModal('deleteDraftsModal');
};

/** Wires up Escape key to cancel selection mode */
function wireSelectionEscapeCancel() {
  if (window._managerShiftsSelectionEscapeBound) return;
  window._managerShiftsSelectionEscapeBound = true;

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!selectionMode) return;
    setSelectMode(false);
  });
}

/** Wires up window resize handler to reflow day view grid */
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

// =============================================================================
// SECTION 15: SHIFT CHIP RENDERING
// =============================================================================
// Creates the DOM elements for individual shift chips on the calendar.

/**
 * Creates a shift chip element for week/day views.
 * Shows position name, time, duration, and capacity fill status.
 * 
 * @param {Object} shift - Shift data object
 * @returns {HTMLElement} The shift chip element
 */
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

/**
 * Creates a compact shift chip for month view.
 * Shows only essential info in a single row to fit in small cells.
 */
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

// =============================================================================
// SECTION 16: SHIFT DETAILS MODAL
// =============================================================================
// Modal that shows when clicking on a shift chip (not in selection mode).
// Displays shift info and provides edit/delete/publish actions.

/**
 * Opens the shift details modal by fetching shift data from server.
 * Populates the modal with shift information and assigned employees.
 * 
 * @param {number|string} shiftId - The shift ID to display
 */
function openShiftDetails(shiftId) {
  const template = getPageData()?.shiftDetailsUrlTemplate;
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

      const detailsDate = getEl('detailsDate');
      if (detailsDate) detailsDate.textContent = formatDateDMY(data.date || '');
      const detailsTime = getEl('detailsTime');
      if (detailsTime) detailsTime.textContent = `${data.start_time || ''}–${data.end_time || ''}`;
      const durationMinutes = parseTimeToMinutes(data.end_time) - parseTimeToMinutes(data.start_time);
      const detailsDuration = getEl('detailsDuration');
      if (detailsDuration) detailsDuration.textContent = `Duration: ${formatDurationMinutes(durationMinutes)}`;
      const detailsPosition = getEl('detailsPosition');
      if (detailsPosition) detailsPosition.textContent = data.position || '';
      const detailsCapacity = getEl('detailsCapacity');
      if (detailsCapacity) {
        detailsCapacity.textContent = `Capacity: ${data.assigned_count ?? 0}/${data.capacity ?? 0} filled`;
      }

      const statusEl = getEl('detailsStatus');
      if (statusEl) {
        statusEl.textContent = data.status === 'draft' ? 'Draft' : 'Published';
        statusEl.className = 'badge ' + (data.status === 'draft' ? 'badge-outline' : 'badge-success');
      }

      const publishBtn = getEl('publishShiftBtn');
      publishBtn?.classList.toggle('hidden', data.status !== 'draft');

      const list = getEl('detailsEmployees');
      if (list) {
        const assignedEmployees = Array.isArray(data.assigned_employees) ? data.assigned_employees : [];
        list.innerHTML = '';
        if (!assignedEmployees.length) {
          const empty = document.createElement('div');
          empty.className = 'text-sm text-muted';
          empty.textContent = 'No employees assigned.';
          list.appendChild(empty);
        } else {
          for (const e of assignedEmployees) {
            const row = document.createElement('div');
            row.className = 'flex items-center gap-2';
            const initials = initialsFromName(e.name);
            row.innerHTML = `<div class="header-avatar" style="width: 1.5rem; height: 1.5rem; font-size: 0.625rem;">${initials}</div><span class="text-sm">${e.name}</span>`;
            list.appendChild(row);
          }
        }
      }

      openModal('shiftDetailsModal');
    })
    .catch((err) => {
      showToast('error', 'Error', err.message || 'Could not load shift details.');
    });
}

/**
 * Wires up click handler on calendar containers.
 * Handles clicks on cells (open create modal) and other-month cells (navigate).
 */
function wireCalendarClicks(containerId) {
  const el = getEl(containerId);
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

/** Publishes the currently viewed shift via form submission */
function publishShift() {
  if (!activeShiftId) return;
  const tpl = getPageData()?.shiftPublishUrlTemplate;
  const form = getEl('publishShiftForm');
  if (!tpl || !form) return;
  form.action = urlFromTemplate(tpl, activeShiftId);
  form.submit();
}

// =============================================================================
// SECTION 17: CALENDAR GRID RENDERING
// =============================================================================
// Functions that build the actual calendar grids (week/month/day views).

/**
 * Renders the week view grid.
 * 
 * Structure:
 * - 7 columns (one per day) + time labels column
 * - 24 rows (one per hour)
 * - Shift chips positioned absolutely based on time
 * - Uses lane layout for overlapping shifts
 * 
 * @param {Object} config - Calendar config (start, end, today, etc.)
 * @param {Array} shifts - Shifts to display
 */
function renderWeekGrid(config, shifts) {
  const grid = getEl('weekGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const start = new Date(`${config.start}T00:00:00`);
  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    weekDays.push({ date: d, iso: toISODate(d) });
  }

  const byDate = new Map();
  (Array.isArray(shifts) ? shifts : []).forEach((s) => {
    const dateKey = s?.date;
    if (!dateKey) return;
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey).push(s);
  });

  const laneLayoutByDate = new Map();
  byDate.forEach((dayShifts, dateKey) => {
    laneLayoutByDate.set(dateKey, computeShiftLaneLayout(dayShifts));
  });

  const corner = document.createElement('div');
  corner.className = 'week-time-corner';
  corner.textContent = '';
  corner.style.gridColumn = '1';
  corner.style.gridRow = '1';
  grid.appendChild(corner);

  weekDays.forEach(({ date, iso }, idx) => {
    const header = document.createElement('div');
    header.className = 'week-time-day-header';
    header.textContent = `${weekdayLabel(date)} ${dayNumber(date)}`;
    header.dataset.date = iso;
    header.style.gridRow = '1';
    header.style.gridColumn = String(idx + 2);
    header.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      navigateWith({ view: 'day', date: iso });
    });
    grid.appendChild(header);
  });

  for (let hour = 0; hour < 24; hour++) {
    const hourStr = `${String(hour).padStart(2, '0')}:00`;

    const label = document.createElement('div');
    label.className = 'week-time-hour-label';
    label.textContent = hourStr;
    label.dataset.hour = hourStr;
    label.style.gridColumn = '1';
    label.style.gridRow = String(hour + 2);
    grid.appendChild(label);

    weekDays.forEach(({ iso }, idx) => {
      const cell = document.createElement('div');
      cell.className = 'week-time-cell';
      cell.dataset.date = iso;
      cell.dataset.hour = hourStr;
      if (iso === config.today) cell.classList.add('calendar-cell-today');
      cell.style.gridColumn = String(idx + 2);
      cell.style.gridRow = String(hour + 2);
      grid.appendChild(cell);
    });
  }

  const sampleCell = grid.querySelector('.week-time-cell');
  const hourHeightPx = sampleCell ? sampleCell.getBoundingClientRect().height : TIME_GRID_HOUR_HEIGHT_PX;

  weekDays.forEach(({ iso }, idx) => {
    const layer = document.createElement('div');
    layer.className = 'week-shifts-layer week-shifts-layer-vertical';
    layer.dataset.date = iso;
    layer.style.gridColumn = String(idx + 2);
    layer.style.gridRow = '2 / -1';

    const laneInfo = laneLayoutByDate.get(iso) || { laneById: new Map(), laneCount: 1 };
    (byDate.get(iso) || []).forEach((s) => {
      const chip = renderShiftChip(s);
      const laneIndex = laneInfo.laneById.get(String(s.id)) ?? 0;
      applyTimedShiftChipVertical(chip, s, laneIndex, laneInfo.laneCount, hourHeightPx);
      layer.appendChild(chip);
    });
    grid.appendChild(layer);
  });

  applyEmployeeShiftHighlight();
  autoScrollWeekGridToEarliestShift(grid, shifts, hourHeightPx);
}

/**
 * Renders the month view grid.
 * 
 * Structure:
 * - 7 columns (days of week)
 * - 6 rows (weeks, some may show prev/next month days)
 * - Compact shift chips stacked in each cell
 * 
 * @param {Object} config - Calendar config
 * @param {Array} shifts - Shifts to display
 */
function renderMonthGrid(config, shifts) {
  const grid = getEl('monthGrid');
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

  applyEmployeeShiftHighlight();
}

/**
 * Renders the day view grid.
 * 
 * Structure:
 * - 24 columns (one per hour), time flows left-to-right
 * - Shift chips positioned horizontally based on time
 * - Uses lane layout for overlapping shifts (stacked vertically)
 * 
 * @param {Object} config - Calendar config
 * @param {Array} shifts - Shifts to display
 */
function renderDayGrid(config, shifts) {
  const grid = getEl('dayGrid');
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

  applyEmployeeShiftHighlight();
}

// =============================================================================
// SECTION 18: SHIFT EDIT/DELETE FROM DETAILS MODAL
// =============================================================================
// Actions available from the shift details modal.

// State for currently viewed/edited shift
let activeShiftId = null;     // ID of shift shown in details modal
let activeShiftData = null;   // Full data of that shift
let managerCurrentShifts = []; // All shifts for current view period

/**
 * Opens the create/edit modal in edit mode for the current shift.
 * Pre-fills all form fields with the shift's current values.
 */
function editShift() {
  if (!activeShiftData || !activeShiftId) return;

  closeModal('shiftDetailsModal');
  getEl('createShiftTitle').textContent = 'Edit Shift';
  getEl('createShiftSubmit').textContent = 'Save';

  const form = getEl('createShiftForm');
  const updateTpl = getPageData()?.shiftUpdateUrlTemplate;
  if (form && updateTpl) form.action = urlFromTemplate(updateTpl, activeShiftId);

  getEl('shiftDate').value = activeShiftData.date;
  getEl('shiftStart').value = activeShiftData.start_time;
  getEl('shiftEnd').value = activeShiftData.end_time;
  getEl('shiftCapacity').value = String(activeShiftData.capacity);

  const positionSelect = getEl('shiftPosition');
  if (positionSelect) {
    const positionId = activeShiftData.position_id ?? activeShiftData.positionId ?? '';
    for (const o of positionSelect.options) o.selected = String(o.value) === String(positionId);
  }
  updateShiftPositionMultiLabel();

  getEl('publishImmediatelyCustom').checked = activeShiftData.status === 'published';

  filterEmployeePicker();
  // set employees (after list is filtered to the selected position)
  const selectedIds = new Set((activeShiftData.assigned_employees || []).map((e) => String(e.id)));
  for (const cb of getEmployeeCbs()) cb.checked = selectedIds.has(String(cb.value));
  updateEmployeeMulti();
  openModal('createShiftModal');
}

/** Opens the delete confirmation modal for the current shift */
function deleteShift() {
  if (!activeShiftId) return;
  const titleEl = getEl('deleteShiftConfirmTitle');
  if (titleEl) {
    const role = activeShiftData?.position || '';
    const time = activeShiftData?.start_time && activeShiftData?.end_time
      ? `${activeShiftData.start_time}–${activeShiftData.end_time}` : '';
    titleEl.textContent = [role, time, activeShiftData?.date].filter(Boolean).join(' • ') || `#${activeShiftId}`;
  }
  openModal('deleteShiftConfirmModal');
}

/** Closes the delete confirmation modal without deleting */
function cancelDeleteShift() {
  closeModal('deleteShiftConfirmModal');
}

/** Confirms deletion and submits the delete form */
function confirmDeleteShift() {
  if (!activeShiftId) return;
  const form = getEl('deleteShiftForm');
  const delTpl = getPageData()?.shiftDeleteUrlTemplate;
  if (!form || !delTpl) return;
  form.action = urlFromTemplate(delTpl, activeShiftId);
  form.submit();
}

// =============================================================================
// SECTION 19: PAGE INITIALIZATION
// =============================================================================
// Main entry point that sets up everything when the page loads.

/**
 * Main initialization function for the manager shifts page.
 * 
 * This function:
 * 1. Reads configuration from the page's data attributes
 * 2. Parses JSON data (shifts, employees) from script tags
 * 3. Wires up all event handlers
 * 4. Renders the appropriate calendar view
 * 5. Restores form state if returning from validation error
 */
function initManagerShifts() {
  const page = getEl('managerShiftPage');
  if (!page) return;

  const pageData = page.dataset;
  serverCanUndo = pageData.canUndo === '1';

  wireStickyOffsets();
  wireSelectionEscapeCancel();

  // If the page was restored from the back/forward cache, force a reload so newly created
  // shifts/roles show up correctly.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) window.location.reload();
  });

  const config = {
    baseUrl: pageData.baseUrl,
    view: pageData.view,
    anchor: pageData.anchor,
    start: pageData.start,
    end: pageData.end,
    today: pageData.today,
    shiftDetailsUrlTemplate: pageData.shiftDetailsUrlTemplate,
  };

  const shifts = parseJsonScript('managerShiftsData', []);
  managerCurrentShifts = Array.isArray(shifts) ? shifts : [];
  const employees = parseJsonScript('managerEmployeesData', []);
  managerEmployees = Array.isArray(employees) ? employees : [];
  managerEmployeePeriodStats = computeEmployeePeriodStats(managerCurrentShifts);
  const formState = parseJsonScript('shiftFormState', null);

  initManagerMonthPicker(config);

  wireManagerMultiselectHooks();
  wireEmployeeSidebarControls();
  wireManagerFiltersMultiselectClickThrough();
  wireEmployeeChipRemovals();
  initEmployeeBuckets();
  updatePositionMulti();
  updateStatusMulti();
  updateShowMulti();
  updateEmployeeMulti();
  wireCreateShiftValidation();
  getEl('shiftPosition')?.addEventListener('change', filterEmployeePicker);
  renderRoleLegend(collectPositionsFromDom(), managerCurrentShifts);
  refreshPositionsFromServer();
  renderEmployeeSidebar();

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
    if (formState.date) getEl('shiftDate').value = formState.date;
    if (formState.start_time) getEl('shiftStart').value = formState.start_time;
    if (formState.end_time) getEl('shiftEnd').value = formState.end_time;
    if (formState.capacity) getEl('shiftCapacity').value = String(formState.capacity);
    if (formState.position_id) getEl('shiftPosition').value = String(formState.position_id);
    getEl('publishImmediatelyCustom').checked = !!formState.publish;

    filterEmployeePicker();
    const selectedIds = new Set((formState.employee_ids || []).map(String));
    for (const cb of getEmployeeCbs()) cb.checked = selectedIds.has(String(cb.value));

    if (mode === 'update' && shiftId) {
      getEl('createShiftTitle').textContent = 'Edit Shift';
      getEl('createShiftSubmit').textContent = 'Save';
      const updateTpl = pageData.shiftUpdateUrlTemplate;
      const form = getEl('createShiftForm');
      if (form && updateTpl) form.action = urlFromTemplate(updateTpl, shiftId);
    }

    updateEmployeeMulti();

    const errorField = formState.error_field;
    if (errorField === 'capacity') getEl('shiftCapacity')?.classList.add('form-error');
    else if (errorField === 'employee_ids') getEl('employeeMulti')?.classList.add('form-error');
    openModal('createShiftModal');
  }
}

// =============================================================================
// BOOTSTRAP: Run initialization when DOM is ready
// =============================================================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initManagerShifts);
} else {
  // DOM already loaded (script was deferred or at end of body)
  initManagerShifts();
}
