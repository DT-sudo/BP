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
  const page = document.getElementById('employeeShiftPage');
  const anchor = page?.dataset.anchor || '';
  navigateWith({ view, date: anchor });
}

function prevPeriod() {
  const page = document.getElementById('employeeShiftPage');
  if (!page) return;
  const view = page.dataset.view;
  const anchor = page.dataset.anchor;
  if (!anchor) return;

  if (view === 'week') navigateWith({ view: 'week', date: addDays(anchor, -7) });
  else navigateWith({ view: 'month', date: addMonths(anchor, -1) });
}

function nextPeriod() {
  const page = document.getElementById('employeeShiftPage');
  if (!page) return;
  const view = page.dataset.view;
  const anchor = page.dataset.anchor;
  if (!anchor) return;

  if (view === 'week') navigateWith({ view: 'week', date: addDays(anchor, 7) });
  else navigateWith({ view: 'month', date: addMonths(anchor, 1) });
}

function goToToday() {
  const page = document.getElementById('employeeShiftPage');
  if (!page) return;
  const view = page.dataset.view || 'month';
  const today = page.dataset.today;
  if (!today) return;
  navigateWith({ view, date: today });
}

function parseJsonScript(id, fallback) {
  const el = document.getElementById(id);
  if (!el) return fallback;
  try {
    return JSON.parse(el.textContent || '');
  } catch (e) {
    return fallback;
  }
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

  const byDate = new Map();
  shifts.forEach((s) => {
    byDate.set(s.date, (byDate.get(s.date) || []).concat([s]));
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

function weekdayLabel(d) {
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

function renderWeekGrid(config, shifts) {
  const grid = document.getElementById('employeeWeekGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const start = new Date(`${config.start}T00:00:00`);
  const byDate = new Map();
  shifts.forEach((s) => {
    byDate.set(s.date, (byDate.get(s.date) || []).concat([s]));
  });

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
        <div class="flex items-center justify-between">
          <span>${s.start_time}–${s.end_time}</span>
          <span class="badge badge-default">${s.position}</span>
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
  const shifts = parseJsonScript('employeeShiftsData', []);
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
  const shifts = parseJsonScript('employeeShiftsData', []);
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

  const shifts = parseJsonScript('employeeShiftsData', []);

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
