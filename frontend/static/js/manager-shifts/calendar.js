/**
 * MANAGER SHIFTS - Calendar Renderers
 * Renders week, month, and day calendar views
 */

(function() {
  'use strict';

  // Safe imports with fallbacks
  const Config = window.ManagerShiftsConfig || {};
const Time = window.ManagerShiftsTime || {};
const LaneLayout = window.ManagerShiftsLaneLayout || {};
const PositionPalette = window.ManagerShiftsPositionPalette || {};
const Sidebar = window.ManagerShiftsSidebar || {};
const BulkSelection = window.ManagerShiftsBulkSelection || {};

const { getEl, escapeHtml, TIME_GRID_HOUR_HEIGHT_PX, TIME_GRID_HOUR_WIDTH_PX, SHIFT_LANE_GAP_PX } = Config;
const { parseTimeToMinutes, formatDurationMinutes } = Time;
const { computeShiftLaneLayout, applyTimedShiftChipVertical, applyTimedShiftChipHorizontalDynamic, autoScrollWeekGridToEarliestShift } = LaneLayout;
const { applyPositionPaletteToElement } = PositionPalette;
const { applyEmployeeShiftHighlight } = Sidebar;
const { isSelectionMode, getSelectedShiftIds, toggleChipSelected } = BulkSelection;

// Calendar-utils globals
const toISODate = window.toISODate;
const navigateWith = window.navigateWith;
const weekdayLabel = window.weekdayLabel;
const dayNumber = window.dayNumber;

// Helper function to render a shift chip
function renderShiftChip(shift) {
  const chip = document.createElement('div');
  const selectedShiftIds = getSelectedShiftIds();
  chip.className = `shift-chip ${shift.is_past ? 'shift-chip-past' : 'shift-chip-future'} ${
    shift.status === 'draft' ? 'shift-chip-draft' : 'shift-chip-published'
  }`;
  chip.dataset.shiftId = String(shift.id);
  if (shift.status !== 'draft') applyPositionPaletteToElement(chip, shift.position_id);
  if (selectedShiftIds.has(String(shift.id))) chip.classList.add('shift-chip-selected');

  const time = `${shift.start_time}-${shift.end_time}`;
  const duration = formatDurationMinutes(parseTimeToMinutes(shift.end_time) - parseTimeToMinutes(shift.start_time));
  chip.innerHTML = `
    <div class="shift-chip-header">
      <span class="shift-chip-position-name" title="${escapeHtml(shift.position)}">${escapeHtml(shift.position)}</span>
      <span class="shift-chip-qty">${shift.assigned_count}/${shift.capacity}</span>
    </div>
    <div class="shift-chip-time">${time}</div>
    <div class="shift-chip-duration-row">${duration}</div>
  `;

  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isSelectionMode()) {
      toggleChipSelected(chip);
      return;
    }
    window.openShiftDetails?.(shift.id);
  });
  return chip;
}

function renderMonthShiftChip(shift) {
  const chip = document.createElement('div');
  const selectedShiftIds = getSelectedShiftIds();
  chip.className = `shift-chip manager-month-shift-chip ${shift.is_past ? 'shift-chip-past' : 'shift-chip-future'} ${
    shift.status === 'draft' ? 'shift-chip-draft' : 'shift-chip-published'
  }`;
  chip.dataset.shiftId = String(shift.id);
  if (shift.status !== 'draft') applyPositionPaletteToElement(chip, shift.position_id);
  if (selectedShiftIds.has(String(shift.id))) chip.classList.add('shift-chip-selected');

  chip.innerHTML = `
    <div class="manager-month-shift-row">
      <span class="manager-month-shift-main" title="${escapeHtml(shift.position)} ${escapeHtml(shift.start_time)}-${escapeHtml(shift.end_time)}">
        <span class="manager-month-shift-name">${escapeHtml(shift.position)}</span>
        <span class="manager-month-shift-sep">•</span>
        <span class="manager-month-shift-time">${escapeHtml(shift.start_time)}-${escapeHtml(shift.end_time)}</span>
      </span>
      <span class="manager-month-shift-qty">${shift.assigned_count}/${shift.capacity}</span>
    </div>
  `;

  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isSelectionMode()) {
      toggleChipSelected(chip);
      return;
    }
    window.openShiftDetails?.(shift.id);
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
  const startDow = firstOfMonth.getDay();
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
      window.openCreateShiftModal?.(config.anchor, hourStr);
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
      window.openCreateShiftModal?.(config.anchor, hourStr);
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
    window.openCreateShiftModal?.(cell.dataset.date, start || undefined);
  });
}

window.ManagerShiftsCalendar = {
  renderShiftChip,
  renderMonthShiftChip,
  renderWeekGrid,
  renderMonthGrid,
  renderDayGrid,
  wireCalendarClicks,
};

})();
