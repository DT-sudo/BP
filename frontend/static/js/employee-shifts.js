/**
 * Employee Shifts Calendar
 * Week and month views for employee shift display
 */
const NAV_OPTIONS = {
  defaultView: 'month',
  viewSteps: {
    week: { days: 7, view: 'week' },
    month: { months: 1, view: 'month' }
  }
};

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

// Navigation functions
function switchView(view) {
  if (window.calendarSwitchView) {
    window.calendarSwitchView('employeeShiftPage', view);
  }
}

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

// Month view rendering
function renderMonthGrid(config, shifts) {
  const grid = document.getElementById('employeeMonthGrid');
  if (!grid) return;

  grid.innerHTML = '';

  const anchor = new Date(config.anchor + 'T00:00:00');
  const month = anchor.getMonth();
  const firstOfMonth = new Date(anchor.getFullYear(), month, 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

  const shiftsByDate = groupShiftsByDate(shifts);

  // Weekday headers
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let w = 0; w < weekdays.length; w++) {
    const header = document.createElement('div');
    header.className = 'calendar-header-cell';
    header.textContent = weekdays[w];
    grid.appendChild(header);
  }

  // Day cells
  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(gridStart);
    cellDate.setDate(gridStart.getDate() + i);
    const isoDate = toISODate(cellDate);

    const cell = document.createElement('div');
    cell.className = 'calendar-cell';

    if (isoDate === config.today) {
      cell.classList.add('calendar-cell-today');
    }
    if (cellDate.getMonth() !== month) {
      cell.classList.add('calendar-cell-other-month');
    }

    // Date label
    const dateLabel = document.createElement('div');
    dateLabel.className = 'calendar-date';
    dateLabel.textContent = cellDate.getDate();
    cell.appendChild(dateLabel);

    // Shift chips
    const dayShifts = shiftsByDate.get(isoDate) || [];
    for (let s = 0; s < dayShifts.length; s++) {
      const shift = dayShifts[s];
      const chip = document.createElement('div');
      chip.className = 'shift-chip ' + (shift.is_past ? 'shift-chip-past' : 'shift-chip-future');
      chip.textContent = shift.start_time + '-' + shift.end_time;

      // Use closure to capture shift.id
      (function (shiftId) {
        chip.onclick = function (event) {
          openShiftPopup(shiftId, event);
        };
      })(shift.id);

      cell.appendChild(chip);
    }

    grid.appendChild(cell);
  }
}

// Week view rendering
function renderWeekGrid(config, shifts) {
  const grid = document.getElementById('employeeWeekGrid');
  if (!grid) return;

  grid.innerHTML = '';

  const weekStart = new Date(config.start + 'T00:00:00');
  const shiftsByDate = groupShiftsByDate(shifts);

  // Day headers
  for (let h = 0; h < 7; h++) {
    const headerDay = new Date(weekStart);
    headerDay.setDate(weekStart.getDate() + h);

    const header = document.createElement('div');
    header.className = 'calendar-header-cell';
    header.textContent = weekdayLabel(headerDay) + ' ' + headerDay.getDate();
    grid.appendChild(header);
  }

  // Day columns
  for (let d = 0; d < 7; d++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + d);
    const isoDate = toISODate(day);

    const cell = document.createElement('div');
    cell.className = 'calendar-cell employee-week-day-cell';

    if (isoDate === config.today) {
      cell.classList.add('calendar-cell-today');
    }

    // Shift cards
    const dayShifts = shiftsByDate.get(isoDate) || [];
    for (let s = 0; s < dayShifts.length; s++) {
      const shift = dayShifts[s];
      const hours = calculateHours(shift);

      const chip = document.createElement('div');
      chip.className = 'shift-chip employee-week-shift-chip ' +
        (shift.is_past ? 'shift-chip-past' : 'shift-chip-future');
      chip.innerHTML = '<div class="flex items-center"><span>' +
        shift.start_time + '-' + shift.end_time +
        '</span></div><div class="text-xs text-muted mt-1">' +
        weekdayLabel(day) + ' • ' + hours + 'h</div>';

      // Use closure to capture shift.id
      (function (shiftId) {
        chip.onclick = function () {
          openShiftDetails(shiftId);
        };
      })(shift.id);

      cell.appendChild(chip);
    }

    grid.appendChild(cell);
  }
}

// Shift details modal
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

// Month popup (quick view)
let currentPopupShiftId = null;

// Global alias for HTML onclick handlers
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

// Initialize
function initEmployeeShifts() {
  const page = document.getElementById('employeeShiftPage');
  if (!page) return;

  const config = {
    view: page.dataset.view,
    anchor: page.dataset.anchor,
    start: page.dataset.start,
    end: page.dataset.end,
    today: page.dataset.today
  };

  const shifts = getShiftsData();

  // Toggle view visibility
  const weekView = document.getElementById('weekView');
  const monthView = document.getElementById('monthView');

  if (weekView) {
    weekView.classList.toggle('hidden', config.view !== 'week');
  }
  if (monthView) {
    monthView.classList.toggle('hidden', config.view !== 'month');
  }

  // Update view toggle buttons
  const btnWeek = document.getElementById('btnWeek');
  const btnMonth = document.getElementById('btnMonth');

  if (btnWeek && btnMonth) {
    const isWeekView = (config.view === 'week');
    btnWeek.classList.toggle('btn-primary', isWeekView);
    btnWeek.classList.toggle('btn-outline', !isWeekView);
    btnMonth.classList.toggle('btn-primary', !isWeekView);
    btnMonth.classList.toggle('btn-outline', isWeekView);
  }

  // Render appropriate view
  if (config.view === 'week') {
    renderWeekGrid(config, shifts);
  } else {
    renderMonthGrid(config, shifts);
  }
}

// Auto-init on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEmployeeShifts);
} else {
  initEmployeeShifts();
}
