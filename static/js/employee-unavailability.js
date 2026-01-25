const PAGE_ID = 'employeeUnavailabilityPage';
const GRID_ID = 'employeeUnavailableMonthGrid';
const LIST_ID = 'unavailableDaysList';

const NAV_CONFIG = {
  defaultView: 'month',
  viewSteps: { month: { months: 1, view: 'month' } },
};

let unavailableDays = new Set();

// Navigation helpers (expose globally for HTML onclick handlers)
function prevPeriod() {
  window.calendarPrevPeriod?.(PAGE_ID, NAV_CONFIG);
}

function nextPeriod() {
  window.calendarNextPeriod?.(PAGE_ID, NAV_CONFIG);
}

function goToToday() {
  window.calendarGoToToday?.(PAGE_ID, 'month');
}

// Utility: format ISO date to human-readable string
function formatPrettyDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? String(iso)
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Utility: bind click + keyboard activation to an element
function bindActivation(el, handler) {
  if (!el || typeof handler !== 'function') return;
  const invoke = (e) => {
    e.preventDefault();
    e.stopPropagation();
    handler(e);
  };
  el.addEventListener('click', invoke);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') invoke(e);
  });
}

// Toggle unavailable class on a calendar cell
function setCellUnavailable(cell, isUnavailable) {
  cell?.classList.toggle('calendar-cell-unavailable', !!isUnavailable);
}

// Find calendar cell element by ISO date string
function findCellByDate(iso) {
  return document.getElementById(GRID_ID)?.querySelector(`.calendar-cell[data-date="${iso}"]`);
}

// Toggle unavailability for a specific date via API
async function toggleUnavailableDay(iso) {
  const toggleUrl = document.getElementById(PAGE_ID)?.dataset.toggleUrl;
  if (!toggleUrl) return;

  const cell = findCellByDate(iso);
  cell?.classList.add('calendar-cell-busy');

  try {
    const payload = await window.postFormJson?.(toggleUrl, { date: iso });
    const isUnavailable = !!payload?.unavailable;
    unavailableDays[isUnavailable ? 'add' : 'delete'](iso);
    setCellUnavailable(cell, isUnavailable);
    renderUnavailableList();
  } catch (e) {
    window.showToast?.('error', 'Error', e?.message || 'Could not update availability.');
  } finally {
    cell?.classList.remove('calendar-cell-busy');
  }
}

// Render the list of unavailable day chips
function renderUnavailableList() {
  const root = document.getElementById(LIST_ID);
  if (!root) return;

  const items = [...unavailableDays].sort();
  root.innerHTML = '';

  if (!items.length) {
    root.innerHTML = '<div class="text-sm text-muted">No unavailable days selected.</div>';
    return;
  }

  const frag = document.createDocumentFragment();
  for (const iso of items) {
    const chip = document.createElement('span');
    chip.className = 'date-chip';

    const pretty = formatPrettyDate(iso);

    const remove = document.createElement('span');
    remove.className = 'chip-remove';
    remove.setAttribute('role', 'button');
    remove.setAttribute('tabindex', '0');
    remove.setAttribute('aria-label', `Remove ${pretty}`);
    remove.textContent = '×';
    bindActivation(remove, () => toggleUnavailableDay(iso));

    const text = document.createElement('span');
    text.className = 'chip-text';
    text.textContent = pretty;

    chip.append(remove, text);
    frag.appendChild(chip);
  }
  root.appendChild(frag);
}

// Render the month calendar grid
function renderMonthGrid(config) {
  const grid = document.getElementById(GRID_ID);
  if (!grid) return;

  window.calendarRenderMonthGrid?.(grid, {
    anchorISO: config.anchor,
    todayISO: config.today,
    onCell: (cell, { iso, inMonth }) => {
      setCellUnavailable(cell, unavailableDays.has(iso));
      cell.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (inMonth) {
          toggleUnavailableDay(iso);
        } else {
          window.navigateWith?.({ view: 'month', date: iso });
        }
      });
    },
  });
}

// Initialize the page
function initEmployeeUnavailability() {
  const page = document.getElementById(PAGE_ID);
  if (!page) return;

  const { anchor, today } = page.dataset;
  const days = window.parseJsonScript?.('employeeUnavailableData', []);
  unavailableDays = new Set(Array.isArray(days) ? days.map(String) : []);

  renderMonthGrid({ anchor, today });
  renderUnavailableList();
}

// Bootstrap
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEmployeeUnavailability);
} else {
  initEmployeeUnavailability();
}
