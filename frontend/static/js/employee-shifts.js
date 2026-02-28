const NAV_OPTIONS = {
  defaultView: 'month',
  viewSteps: {
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
      for (var s = 0; s < dayShifts.length; s++) {
        var shift = dayShifts[s];
        var chip = document.createElement('div');
        chip.className = 'shift-chip ' + (shift.is_past ? 'shift-chip-past' : 'shift-chip-future');
        chip.textContent = shift.start_time + '-' + shift.end_time;
        (function (shiftId) {
          chip.onclick = function (event) { openShiftPopup(shiftId, event); };
        })(shift.id);
        cell.appendChild(chip);
      }
    }
  });
}

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

function initEmployeeShifts() {
  const page = document.getElementById('employeeShiftPage');
  if (!page) return;

  const config = {
    anchor: page.dataset.anchor,
    start: page.dataset.start,
    end: page.dataset.end,
    today: page.dataset.today
  };

  const shifts = getShiftsData();
  renderMonthGrid(config, shifts);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEmployeeShifts);
} else {
  initEmployeeShifts();
}
