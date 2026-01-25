const EMPLOYEE_UNAVAILABILITY_NAV = {
  defaultView: 'month',
  viewSteps: {
    month: { months: 1, view: 'month' },
  },
};

let unavailableDays = new Set();

function prevPeriod() {
  window.calendarPrevPeriod?.('employeeUnavailabilityPage', EMPLOYEE_UNAVAILABILITY_NAV);
}

function nextPeriod() {
  window.calendarNextPeriod?.('employeeUnavailabilityPage', EMPLOYEE_UNAVAILABILITY_NAV);
}

function goToToday() {
  window.calendarGoToToday?.('employeeUnavailabilityPage', 'month');
}

function formatPrettyDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function setCellUnavailable(cell, isUnavailable) {
  if (!cell) return;
  cell.classList.toggle('calendar-cell-unavailable', !!isUnavailable);
}

function findCellByDate(iso) {
  const grid = document.getElementById('employeeUnavailableMonthGrid');
  return grid?.querySelector?.(`.calendar-cell[data-date="${String(iso)}"]`) || null;
}

async function toggleUnavailableDay(iso) {
  const page = document.getElementById('employeeUnavailabilityPage');
  const toggleUrl = page?.dataset.toggleUrl || '';
  if (!toggleUrl) return;

  const cell = findCellByDate(iso);
  cell?.classList.add('calendar-cell-busy');

  try {
    const payload = await window.postFormJson?.(toggleUrl, { date: iso });
    const isUnavailable = !!payload?.unavailable;
    if (isUnavailable) unavailableDays.add(iso);
    else unavailableDays.delete(iso);
    setCellUnavailable(cell, isUnavailable);
    renderUnavailableList();
  } catch (e) {
    window.showToast?.('error', 'Error', e?.message || 'Could not update availability.');
  } finally {
    cell?.classList.remove('calendar-cell-busy');
  }
}

function renderUnavailableList() {
  const root = document.getElementById('unavailableDaysList');
  if (!root) return;

  const items = Array.from(unavailableDays.values()).sort();
  root.innerHTML = '';

  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'text-sm text-muted';
    empty.textContent = 'No unavailable days selected.';
    root.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  items.forEach((iso) => {
    const chip = document.createElement('span');
    chip.className = 'date-chip';

    const remove = document.createElement('span');
    remove.className = 'chip-remove';
    remove.setAttribute('role', 'button');
    remove.setAttribute('tabindex', '0');
    remove.setAttribute('aria-label', `Remove ${formatPrettyDate(iso)}`);
    remove.textContent = '×';

    const text = document.createElement('span');
    text.className = 'chip-text';
    text.textContent = formatPrettyDate(iso);

    const onRemove = (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleUnavailableDay(iso);
    };
    remove.addEventListener('click', onRemove);
    remove.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      onRemove(e);
    });

    chip.appendChild(remove);
    chip.appendChild(text);
    frag.appendChild(chip);
  });
  root.appendChild(frag);
}

function renderMonthGrid(config) {
  const grid = document.getElementById('employeeUnavailableMonthGrid');
  if (!grid) return;
  window.calendarRenderMonthGrid?.(grid, {
    anchorISO: config.anchor,
    todayISO: config.today,
    onCell: (cell, { iso, inMonth }) => {
      setCellUnavailable(cell, unavailableDays.has(iso));

      cell.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!inMonth) {
          navigateWith({ view: 'month', date: iso });
          return;
        }
        toggleUnavailableDay(iso);
      });
    },
  });
}

function initEmployeeUnavailability() {
  const page = document.getElementById('employeeUnavailabilityPage');
  if (!page) return;

  const config = {
    view: page.dataset.view,
    anchor: page.dataset.anchor,
    today: page.dataset.today,
  };

  const days = window.parseJsonScript?.('employeeUnavailableData', []);
  unavailableDays = new Set((Array.isArray(days) ? days : []).map((d) => String(d)));

  renderMonthGrid(config);
  renderUnavailableList();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEmployeeUnavailability);
} else {
  initEmployeeUnavailability();
}
