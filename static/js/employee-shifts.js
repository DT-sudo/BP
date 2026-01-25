const EMPLOYEE_PERIOD_NAV = {
  defaultView: 'month',
  viewSteps: {
    week: { days: 7, view: 'week' },
    month: { months: 1, view: 'month' },
  },
};

let employeeShiftsCache = null;

function getEmployeeShiftsData() {
  if (!employeeShiftsCache) {
    employeeShiftsCache = parseJsonScript('employeeShiftsData', []);
  }
  return employeeShiftsCache;
}

function groupShiftsByDate(shifts) {
  const byDate = new Map();
  shifts.forEach((s) => {
    const existing = byDate.get(s.date);
    if (existing) existing.push(s);
    else byDate.set(s.date, [s]);
  });
  return byDate;
}

function switchView(view) {
  window.calendarSwitchView?.('employeeShiftPage', view);
}

function prevPeriod() {
  window.calendarPrevPeriod?.('employeeShiftPage', EMPLOYEE_PERIOD_NAV);
}

function nextPeriod() {
  window.calendarNextPeriod?.('employeeShiftPage', EMPLOYEE_PERIOD_NAV);
}

function goToToday() {
  window.calendarGoToToday?.('employeeShiftPage', 'month');
}

function shiftHours(shift) {
  const [sh, sm] = shift.start_time.split(':').map((x) => parseInt(x, 10));
  const [eh, em] = shift.end_time.split(':').map((x) => parseInt(x, 10));
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  return Math.max(0, (end - start) / 60);
}

function renderMonthGrid(config, shifts) {
  const grid = document.getElementById('employeeMonthGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const anchor = new Date(`${config.anchor}T00:00:00`);
  const anchorMonth = anchor.getMonth();
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const startDow = firstOfMonth.getDay(); // 0=Sun
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - startDow);

  const byDate = groupShiftsByDate(shifts);

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
    if (iso === config.today) cell.classList.add('calendar-cell-today');
    if (d.getMonth() !== anchorMonth) cell.classList.add('calendar-cell-other-month');

    const dateEl = document.createElement('div');
    dateEl.className = 'calendar-date';
    dateEl.textContent = String(d.getDate());
    cell.appendChild(dateEl);

    (byDate.get(iso) || []).forEach((s) => {
      const chip = document.createElement('div');
      chip.className = `shift-chip ${s.is_past ? 'shift-chip-past' : 'shift-chip-future'}`;
      chip.textContent = `${s.start_time}–${s.end_time}`;
      chip.addEventListener('click', (ev) => openShiftPopup(s.id, ev));
      cell.appendChild(chip);
    });

    grid.appendChild(cell);
  }
}

function renderWeekGrid(config, shifts) {
  const grid = document.getElementById('employeeWeekGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const start = new Date(`${config.start}T00:00:00`);
  const byDate = groupShiftsByDate(shifts);

  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const header = document.createElement('div');
    header.className = 'calendar-header-cell';
    header.textContent = `${weekdayLabel(d)} ${d.getDate()}`;
    grid.appendChild(header);
  }

  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = toISODate(d);

    const cell = document.createElement('div');
    cell.className = 'calendar-cell employee-week-day-cell';
    if (iso === config.today) cell.classList.add('calendar-cell-today');

    (byDate.get(iso) || []).forEach((s) => {
      const chip = document.createElement('div');
      chip.className = `shift-chip employee-week-shift-chip ${s.is_past ? 'shift-chip-past' : 'shift-chip-future'}`;
      chip.innerHTML = `
        <div class="flex items-center">
          <span>${s.start_time}–${s.end_time}</span>
        </div>
        <div class="text-xs text-muted mt-1">${weekdayLabel(d)} • ${shiftHours(s)}h</div>
      `;
      chip.addEventListener('click', () => openShiftDetails(s.id));
      cell.appendChild(chip);
    });

    grid.appendChild(cell);
  }
}

function openShiftDetails(id) {
  const shifts = getEmployeeShiftsData();
  const s = shifts.find((x) => x.id === id);
  if (!s) {
    showToast('error', 'Not found', 'Shift not found.');
    return;
  }
  document.getElementById('detailDate').textContent = s.date;
  document.getElementById('detailTime').textContent = `${s.start_time}–${s.end_time}`;
  document.getElementById('detailRole').textContent = s.position;
  document.getElementById('detailHours').textContent = `${shiftHours(s)} hours`;
  openModal('shiftDetailsModal');
}

let activeMonthPopupId = null;

function openShiftPopup(id, ev) {
  ev.stopPropagation();
  const shifts = getEmployeeShiftsData();
  const s = shifts.find((x) => x.id === id);
  if (!s) return;

  activeMonthPopupId = id;
  document.getElementById('monthPopupDate').textContent = s.date;
  document.getElementById('monthPopupTime').textContent = `${s.start_time}–${s.end_time}`;
  document.getElementById('monthPopupHours').textContent = `Total: ${shiftHours(s)}h`;
  openModal('monthPopupModal');
}

function initEmployeeShifts() {
  const page = document.getElementById('employeeShiftPage');
  if (!page) return;

  const config = {
    view: page.dataset.view,
    anchor: page.dataset.anchor,
    start: page.dataset.start,
    end: page.dataset.end,
    today: page.dataset.today,
  };

  const shifts = getEmployeeShiftsData();

  document.getElementById('weekView')?.classList.toggle('hidden', config.view !== 'week');
  document.getElementById('monthView')?.classList.toggle('hidden', config.view !== 'month');

  const btnWeek = document.getElementById('btnWeek');
  const btnMonth = document.getElementById('btnMonth');
  if (btnWeek && btnMonth) {
    const isWeek = config.view === 'week';
    btnWeek.classList.toggle('btn-primary', isWeek);
    btnWeek.classList.toggle('btn-outline', !isWeek);
    btnMonth.classList.toggle('btn-primary', !isWeek);
    btnMonth.classList.toggle('btn-outline', isWeek);
  }

  if (config.view === 'week') renderWeekGrid(config, shifts);
  else renderMonthGrid(config, shifts);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEmployeeShifts);
} else {
  initEmployeeShifts();
}
