(function() {
  'use strict';

  const ManagerShifts = window.ManagerShifts || {};
  const Config = ManagerShifts.Config || {};
  const Time = ManagerShifts.Time || {};
  const LaneLayout = ManagerShifts.LaneLayout || {};
  const PositionPalette = ManagerShifts.PositionPalette || {};
  const Sidebar = ManagerShifts.Sidebar || {};

  const { getEl, TIME_GRID_HOUR_HEIGHT_PX } = Config;
  const { parseTimeToMinutes, formatDurationMinutes } = Time;
  const { computeShiftLaneLayout, applyTimedShiftChipVertical } = LaneLayout;
  const { applyPositionPaletteToElement } = PositionPalette;
  const { applyEmployeeShiftHighlight } = Sidebar;

  const toISODate = window.toISODate;
  const navigateWith = window.navigateWith;
  const weekdayLabel = window.weekdayLabel;
  const dayNumber = window.dayNumber;

function renderShiftChip(shift) {
  const chip = document.createElement('div');
  chip.className = `shift-chip ${shift.is_past ? 'shift-chip-past' : 'shift-chip-future'} ${
    shift.status === 'draft' ? 'shift-chip-draft' : 'shift-chip-published'
  }`;
  chip.dataset.shiftId = String(shift.id);
  if (shift.status !== 'draft') applyPositionPaletteToElement(chip, shift.position_id);

  const time = `${shift.start_time}-${shift.end_time}`;
  const duration = formatDurationMinutes(parseTimeToMinutes(shift.end_time) - parseTimeToMinutes(shift.start_time));
  const header = document.createElement('div');
  header.className = 'shift-chip-header';

  const position = document.createElement('span');
  position.className = 'shift-chip-position-name';
  position.title = String(shift.position || '');
  position.textContent = String(shift.position || '');

  const qty = document.createElement('span');
  qty.className = 'shift-chip-qty';
  qty.textContent = `${shift.assigned_count}/${shift.capacity}`;

  header.appendChild(position);
  header.appendChild(qty);

  const timeEl = document.createElement('div');
  timeEl.className = 'shift-chip-time';
  timeEl.textContent = time;

  const durationEl = document.createElement('div');
  durationEl.className = 'shift-chip-duration-row';
  durationEl.textContent = duration;

  chip.appendChild(header);
  chip.appendChild(timeEl);
  chip.appendChild(durationEl);

  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    window.ManagerShifts?.Actions?.openShiftDetails?.(shift.id);
  });
  return chip;
}

function renderMonthShiftChip(shift) {
  const chip = document.createElement('div');
  chip.className = `shift-chip manager-month-shift-chip ${shift.is_past ? 'shift-chip-past' : 'shift-chip-future'} ${
    shift.status === 'draft' ? 'shift-chip-draft' : 'shift-chip-published'
  }`;
  chip.dataset.shiftId = String(shift.id);
  if (shift.status !== 'draft') applyPositionPaletteToElement(chip, shift.position_id);

  const row = document.createElement('div');
  row.className = 'manager-month-shift-row';

  const main = document.createElement('span');
  main.className = 'manager-month-shift-main';
  main.title = `${shift.position || ''} ${shift.start_time || ''}-${shift.end_time || ''}`.trim();

  const name = document.createElement('span');
  name.className = 'manager-month-shift-name';
  name.textContent = String(shift.position || '');

  const sep = document.createElement('span');
  sep.className = 'manager-month-shift-sep';
  sep.textContent = '•';

  const time = document.createElement('span');
  time.className = 'manager-month-shift-time';
  time.textContent = `${shift.start_time}-${shift.end_time}`;

  const qty = document.createElement('span');
  qty.className = 'manager-month-shift-qty';
  qty.textContent = `${shift.assigned_count}/${shift.capacity}`;

  main.appendChild(name);
  main.appendChild(sep);
  main.appendChild(time);
  row.appendChild(main);
  row.appendChild(qty);
  chip.appendChild(row);

  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    window.ManagerShifts?.Actions?.openShiftDetails?.(shift.id);
  });

  return chip;
}

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

  const colWidths = weekDays.map(({ iso }) => {
    const laneCount = (laneLayoutByDate.get(iso) || { laneCount: 1 }).laneCount;
    const colSpan = Math.max(1, Math.ceil(laneCount / 2));
    return colSpan === 1
      ? 'var(--week-day-col-width)'
      : `calc(${colSpan} * var(--week-day-col-width))`;
  });
  grid.style.gridTemplateColumns = `var(--week-hour-label-width) ${colWidths.join(' ')}`;

  const corner = document.createElement('div');
  corner.className = 'week-time-corner';
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
    grid.appendChild(header);
  });

  for (let hour = 0; hour < 24; hour++) {
    const hourStr = `${String(hour).padStart(2, '0')}:00`;

    const label = document.createElement('div');
    label.className = 'week-time-hour-label';
    label.textContent = hourStr;
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
}

function renderMonthGrid(config, shifts) {
  const grid = getEl('monthGrid');
  if (!grid) return;

  const byDate = new Map();
  (Array.isArray(shifts) ? shifts : []).forEach((s) => {
    if (!s?.date) return;
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date).push(s);
  });

  byDate.forEach((list) => {
    list.sort(
      (a, b) =>
        parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time) ||
        parseTimeToMinutes(a.end_time) - parseTimeToMinutes(b.end_time) ||
        String(a.id).localeCompare(String(b.id)),
    );
  });

  window.calendarRenderMonthGrid(grid, {
    anchorISO: config.anchor,
    todayISO: config.today,
    onCell(cell, { iso }) {
      const shiftList = document.createElement('div');
      shiftList.className = 'manager-month-shift-list';
      (byDate.get(iso) || []).forEach((s) => shiftList.appendChild(renderMonthShiftChip(s)));
      cell.appendChild(shiftList);
    },
  });

  applyEmployeeShiftHighlight();
}

function wireCalendarClicks(containerId) {
  const el = getEl(containerId);
  if (!el) return;
  el.addEventListener('click', (e) => {
    if (e.target.closest('.shift-chip')) return;
    const cell = e.target.closest('[data-date]');
    if (!cell) return;
    if (cell.classList.contains('week-time-day-header')) return;
    if (cell.classList.contains('calendar-cell-other-month')) {
      navigateWith({ view: 'month', date: cell.dataset.date });
      return;
    }
    const start = cell.dataset.hour || '';
    window.ManagerShifts?.Actions?.openCreateShiftModal?.(cell.dataset.date, start || undefined);
  });
}

ManagerShifts.Calendar = {
  renderWeekGrid,
  renderMonthGrid,
  wireCalendarClicks,
};

})();
