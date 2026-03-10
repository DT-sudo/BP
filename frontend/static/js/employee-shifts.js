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
  const m = new Map();
  for (const s of shifts) (m.get(s.date) ?? m.set(s.date, []).get(s.date)).push(s);
  return m;
}

function calculateHours(shift) {
  const [sh, sm] = shift.start_time.split(':').map(Number);
  const [eh, em] = shift.end_time.split(':').map(Number);
  return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
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

  for (const iso of sorted) {
    const pretty = formatPrettyDate(iso);

    const chip = document.createElement('span');
    chip.className = 'date-chip';

    const btn = document.createElement('span');
    btn.className = 'chip-remove';
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
    btn.setAttribute('aria-label', 'Remove ' + pretty);
    btn.textContent = 'x';
    btn.onclick = () => toggleUnavailability(iso);
    btn.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') toggleUnavailability(iso); };

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

function prevPeriod() { window.calendarPrevPeriod?.('employeeShiftPage', NAV_OPTIONS); }
function nextPeriod() { window.calendarNextPeriod?.('employeeShiftPage', NAV_OPTIONS); }
function goToToday()  { window.calendarGoToToday?.('employeeShiftPage', 'month'); }

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
      for (const shift of dayShifts) {
        const chip = document.createElement('div');
        chip.className = 'shift-chip ' + (shift.is_past ? 'shift-chip-past' : 'shift-chip-future');
        chip.textContent = shift.start_time + '-' + shift.end_time;
        chip.onclick = (e) => { e.stopPropagation(); openShiftPopup(shift.id); };
        cell.appendChild(chip);
      }

      // Cell click — navigate out-of-month cells, toggle unavailability for in-month future days.
      cell.onclick = function () {
        if (!info.inMonth) {
          window.navigateWith({ date: info.iso });
          return;
        }
        if (!isFuture || hasShift) return;
        toggleUnavailability(info.iso);
      };
    }
  });
}

// ── Shift popups ──────────────────────────────────────────────────────────────

function findShiftById(shiftId) {
  return getShiftsData().find(s => s.id === shiftId) ?? null;
}

function fillShiftSummary(shift, dateId, timeId, hoursId, hoursPrefix, hoursSuffix) {
  const dateEl = document.getElementById(dateId);
  const timeEl = document.getElementById(timeId);
  const hoursEl = document.getElementById(hoursId);
  if (dateEl) dateEl.textContent = shift.date;
  if (timeEl) timeEl.textContent = shift.start_time + '-' + shift.end_time;
  if (hoursEl) hoursEl.textContent = (hoursPrefix || '') + calculateHours(shift) + (hoursSuffix || '');
}

function openShiftDetails(shiftId) {
  const shift = findShiftById(shiftId);

  if (!shift) {
    showToast('error', 'Not found', 'Shift not found.');
    return;
  }

  fillShiftSummary(shift, 'detailDate', 'detailTime', 'detailHours', '', ' hours');
  document.getElementById('detailPosition').textContent = shift.position;

  openModal('shiftDetailsModal');
}

window.activeMonthPopupId = null;

function openShiftPopup(shiftId) {
  const shift = findShiftById(shiftId);

  if (!shift) return;

  window.activeMonthPopupId = shiftId;
  fillShiftSummary(shift, 'monthPopupDate', 'monthPopupTime', 'monthPopupHours', 'Total: ', 'h');

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
