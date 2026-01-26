/**
 * MANAGER SHIFTS - Lane Layout Algorithm
 * Computes non-overlapping lanes for shifts that overlap in time
 */
(function() {
  'use strict';

  const Time = window.ManagerShiftsTime || {};
  const Config = window.ManagerShiftsConfig || {};
  const { parseTimeToMinutes } = Time;
  const { TIME_GRID_HOUR_WIDTH_PX, TIME_GRID_HOUR_HEIGHT_PX, SHIFT_LANE_HEIGHT_PX, SHIFT_LANE_GAP_PX } = Config;

  function computeShiftLaneLayout(shifts) {
    const items = (shifts || [])
      .map((s) => ({
        id: String(s.id),
        start: parseTimeToMinutes(s.start_time),
        end: parseTimeToMinutes(s.end_time),
      }))
      .sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id));

    const laneEnds = [];
    const laneById = new Map();

    items.forEach((it) => {
      let laneIndex = -1;
      for (let i = 0; i < laneEnds.length; i++) {
        if (it.start >= laneEnds[i]) {
          laneIndex = i;
          break;
        }
      }
      if (laneIndex === -1) {
        laneIndex = laneEnds.length;
        laneEnds.push(it.end);
      } else {
        laneEnds[laneIndex] = it.end;
      }
      laneById.set(it.id, laneIndex);
    });

    return { laneById, laneCount: Math.max(1, laneEnds.length) };
  }

  function applyTimedShiftChipVertical(chip, shift, laneIndex, laneCount, hourHeightPx) {
    if (!chip || !shift) return;

    const start = parseTimeToMinutes(shift.start_time);
    const end = parseTimeToMinutes(shift.end_time);
    const durationMinutes = Math.max(0, end - start);
    const hourHeight = Number.isFinite(hourHeightPx) && hourHeightPx > 0 ? hourHeightPx : TIME_GRID_HOUR_HEIGHT_PX;

    chip.classList.add('shift-chip-timed');
    chip.style.top = `${(start / 60) * hourHeight}px`;
    chip.style.height = `${Math.max(18, (durationMinutes / 60) * hourHeight)}px`;

    const lanes = Math.max(1, laneCount || 1);
    const lane = Math.min(Math.max(0, laneIndex || 0), lanes - 1);
    const pct = 100 / lanes;
    const gap = SHIFT_LANE_GAP_PX;
    chip.style.left = `calc(${lane * pct}% + ${gap}px)`;
    chip.style.width = `calc(${pct}% - ${gap * 2}px)`;
  }

  function applyTimedShiftChipHorizontalDynamic(chip, shift, hourStartMinutes, laneIndex, laneCount, hourWidthPx, laneHeightPx, laneGapPx) {
    if (!chip || !shift) return;
    const hourWidth = Number.isFinite(hourWidthPx) && hourWidthPx > 0 ? hourWidthPx : TIME_GRID_HOUR_WIDTH_PX;
    const laneHeight = Number.isFinite(laneHeightPx) && laneHeightPx > 0 ? laneHeightPx : SHIFT_LANE_HEIGHT_PX;
    const laneGap = Number.isFinite(laneGapPx) && laneGapPx >= 0 ? laneGapPx : SHIFT_LANE_GAP_PX;

    const start = parseTimeToMinutes(shift.start_time);
    const end = parseTimeToMinutes(shift.end_time);
    const offsetMinutes = Math.max(0, start - (hourStartMinutes || 0));
    const durationMinutes = Math.max(0, end - start);

    chip.classList.add('shift-chip-timed');
    chip.style.left = `${(offsetMinutes / 60) * hourWidth}px`;
    chip.style.width = `${Math.max(18, (durationMinutes / 60) * hourWidth)}px`;

    const lanes = Math.max(1, laneCount || 1);
    const lane = Math.min(Math.max(0, laneIndex || 0), lanes - 1);
    chip.style.top = `${laneGap + lane * (laneHeight + laneGap)}px`;
    chip.style.height = `${laneHeight}px`;
  }

  function autoScrollWeekGridToEarliestShift(gridEl, shifts, hourHeightPx) {
    const grid = gridEl;
    if (!grid) return;
    const list = Array.isArray(shifts) ? shifts : [];
    if (!list.length) return;

    let earliest = Infinity;
    list.forEach((s) => {
      const m = parseTimeToMinutes(s?.start_time);
      if (Number.isFinite(m)) earliest = Math.min(earliest, m);
    });
    if (!Number.isFinite(earliest) || earliest === Infinity) return;

    const hour = Math.max(0, Math.min(23, Math.floor(earliest / 60)));
    const hh = Number.isFinite(hourHeightPx) && hourHeightPx > 0 ? hourHeightPx : TIME_GRID_HOUR_HEIGHT_PX;
    const target = Math.max(0, Math.floor(hour * hh));

    window.requestAnimationFrame(() => {
      grid.scrollTop = target;
    });
  }

  window.ManagerShiftsLaneLayout = {
    computeShiftLaneLayout,
    applyTimedShiftChipVertical,
    applyTimedShiftChipHorizontalDynamic,
    autoScrollWeekGridToEarliestShift,
  };
})();
