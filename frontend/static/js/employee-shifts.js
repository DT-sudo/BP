const NAV_OPTIONS = {
  defaultView: 'month',
  viewSteps: {
    month: { months: 1, view: 'month' }
  }
};

// ── Shift data ────────────────────────────────────────────────────────────────

let shiftsCache = null;

function getShiftsData() {
  if (!shiftsCache) {
    shiftsCache = parseJsonScript('employeeShiftsData', []);
  }
  return shiftsCache;
}

function groupShiftsByDate(shifts) {
  const grouped = new Map();
  for (let i = 0; i < shifts.length; i++) {
    const shift = shifts[i];
    if (!grouped.has(shift.date)) {
      grouped.set(shift.date, []);
    }
    grouped.get(shift.date).push(shift);
  }
  return grouped;
}

function calculateHours(shift) {
  const startParts = shift.start_time.split(':');
  const endParts = shift.end_time.split(':');
  const startMinutes = parseInt(startParts[0], 10) * 60 + parseInt(startParts[1], 10);
  const endMinutes = parseInt(endParts[0], 10) * 60 + parseInt(endParts[1], 10);
  return Math.max(0, (endMinutes - startMinutes) / 60);
}

// ── Unavailability data ───────────────────────────────────────────────────────

// Set of ISO date strings the employee has marked unavailable this month.
let unavailableDays = new Set();

function loadUnavailableDays() {
  const raw = parseJsonScript('employeeUnavailableData', []);
  unavailableDays = new Set(raw);
}

function formatPrettyDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

function renderUnavailableList() {
  const container = document.getElementById('unavailableDaysList');
  if (!container) return;
  container.innerHTML = '';

  const sorted = Array.from(unavailableDays).sort();

  if (sorted.length === 0) {
    container.innerHTML = '<div class="text-sm text-muted">No unavailable days selected.</div>';
    return;
  }

  const fragment = document.createDocumentFragment();

  for (let i = 0; i < sorted.length; i++) {
    const iso = sorted[i];
    const pretty = formatPrettyDate(iso);

    const chip = document.createElement('span');
    chip.className = 'date-chip';

    const btn = document.createElement('span');
    btn.className = 'chip-remove';
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
    btn.setAttribute('aria-label', 'Remove ' + pretty);
    btn.textContent = 'x';
    (function (d) {
      btn.onclick = function () { toggleUnavailability(d); };
      btn.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') toggleUnavailability(d); };
    })(iso);

    const label = document.createElement('span');
    label.className = 'chip-text';
    label.textContent = pretty;

    chip.appendChild(btn);
    chip.appendChild(label);
    fragment.appendChild(chip);
  }

  container.appendChild(fragment);
}

async function toggleUnavailability(isoDate) {
  const page = document.getElementById('employeeShiftPage');
  const toggleUrl = page ? page.dataset.toggleUrl : '';
  if (!toggleUrl) return;

  try {
    const data = await postFormJson(toggleUrl, { date: isoDate });
    if (!data.ok) {
      showToast('error', 'Cannot mark unavailable', data.error || 'Unknown error.');
      return;
    }

    if (data.unavailable) {
      unavailableDays.add(isoDate);
    } else {
      unavailableDays.delete(isoDate);
    }

    // Re-render both the list and the calendar so the cell colouring stays in sync.
    renderUnavailableList();
    const config = _currentConfig;
    if (config) {
      renderMonthGrid(config, getShiftsData());
    }
  } catch (err) {
    showToast('error', 'Error', 'Could not update unavailability.');
  }
}

// ── Calendar ──────────────────────────────────────────────────────────────────

// Kept in module scope so toggleUnavailability can trigger a re-render.
let _currentConfig = null;

function prevPeriod() {
  if (window.calendarPrevPeriod) {
    window.calendarPrevPeriod('employeeShiftPage', NAV_OPTIONS);
  }
}

function nextPeriod() {
  if (window.calendarNextPeriod) {
    window.calendarNextPeriod('employeeShiftPage', NAV_OPTIONS);
  }
}

function goToToday() {
  if (window.calendarGoToToday) {
    window.calendarGoToToday('employeeShiftPage', 'month');
  }
}

function renderMonthGrid(config, shifts) {
  const grid = document.getElementById('employeeMonthGrid');
  if (!grid || !window.calendarRenderMonthGrid) return;

  const shiftsByDate = groupShiftsByDate(shifts);

  window.calendarRenderMonthGrid(grid, {
    anchorISO: config.anchor,
    todayISO: config.today,
    onCell: function (cell, info) {
      var dayShifts = shiftsByDate.get(info.iso) || [];
      var hasShift = dayShifts.length > 0;
      // ISO string comparison is safe for yyyy-mm-dd dates.
      var isFuture = info.iso > config.today;

      // Apply unavailability colouring.
      if (!hasShift && unavailableDays.has(info.iso)) {
        cell.classList.add('calendar-cell-unavailable');
      }

      // Render shift chips.
      for (var s = 0; s < dayShifts.length; s++) {
        var shift = dayShifts[s];
        var chip = document.createElement('div');
        chip.className = 'shift-chip ' + (shift.is_past ? 'shift-chip-past' : 'shift-chip-future');
        chip.textContent = shift.start_time + '-' + shift.end_time;
        (function (shiftId) {
          chip.onclick = function (event) {
            event.stopPropagation();
            openShiftPopup(shiftId, event);
          };
        })(shift.id);
        cell.appendChild(chip);
      }

      // Cell click — navigate out-of-month cells, toggle unavailability for in-month future days.
      cell.onclick = function () {
        if (!info.inMonth) {
          var url = new URL(window.location.href);
          url.searchParams.set('date', info.iso);
          window.location.href = url.toString();
          return;
        }
        if (!isFuture || hasShift) return;
        toggleUnavailability(info.iso);
      };
    }
  });
}

// ── Shift popups ──────────────────────────────────────────────────────────────

function openShiftDetails(shiftId) {
  const shifts = getShiftsData();
  let shift = null;

  for (let i = 0; i < shifts.length; i++) {
    if (shifts[i].id === shiftId) {
      shift = shifts[i];
      break;
    }
  }

  if (!shift) {
    showToast('error', 'Not found', 'Shift not found.');
    return;
  }

  document.getElementById('detailDate').textContent = shift.date;
  document.getElementById('detailTime').textContent = shift.start_time + '-' + shift.end_time;
  document.getElementById('detailPosition').textContent = shift.position;
  document.getElementById('detailHours').textContent = calculateHours(shift) + ' hours';

  openModal('shiftDetailsModal');
}

let currentPopupShiftId = null;

Object.defineProperty(window, 'activeMonthPopupId', {
  get: function() { return currentPopupShiftId; }
});

function openShiftPopup(shiftId, event) {
  event.stopPropagation();

  const shifts = getShiftsData();
  let shift = null;

  for (let i = 0; i < shifts.length; i++) {
    if (shifts[i].id === shiftId) {
      shift = shifts[i];
      break;
    }
  }

  if (!shift) return;

  currentPopupShiftId = shiftId;

  document.getElementById('monthPopupDate').textContent = shift.date;
  document.getElementById('monthPopupTime').textContent = shift.start_time + '-' + shift.end_time;
  document.getElementById('monthPopupHours').textContent = 'Total: ' + calculateHours(shift) + 'h';

  openModal('monthPopupModal');
}

// ── Init ──────────────────────────────────────────────────────────────────────

function initEmployeeShifts() {
  const page = document.getElementById('employeeShiftPage');
  if (!page) return;

  _currentConfig = {
    anchor: page.dataset.anchor,
    start: page.dataset.start,
    end: page.dataset.end,
    today: page.dataset.today
  };

  loadUnavailableDays();
  renderMonthGrid(_currentConfig, getShiftsData());
  renderUnavailableList();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEmployeeShifts);
} else {
  initEmployeeShifts();
}
