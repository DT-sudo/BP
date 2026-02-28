(function() {
  'use strict';

  const Time = window.ManagerShiftsTime || {};
  const Config = window.ManagerShiftsConfig || {};
  const { parseTimeToMinutes } = Time;
  const { TIME_GRID_HOUR_HEIGHT_PX, SHIFT_LANE_GAP_PX } = Config;

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

  window.ManagerShiftsLaneLayout = {
    computeShiftLaneLayout,
    applyTimedShiftChipVertical,
  };
})();
