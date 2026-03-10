(function() {
  'use strict';

  const ManagerShifts = window.ManagerShifts || (window.ManagerShifts = {});

  const getEl = (id) => document.getElementById(id);
  const getPageData = () => getEl('managerShiftPage')?.dataset;
  const pad2 = (n) => String(n).padStart(2, '0');

  const getPositionCbs = () => document.querySelectorAll('#positionMulti input[type="checkbox"]');
  const getEmployeeCbs = () => [...document.querySelectorAll('#employeeMulti input[type="checkbox"]')];

  const TIME_GRID_HOUR_HEIGHT_PX = 56;
  const SHIFT_LANE_GAP_PX = 4;

  const MANAGER_PERIOD_NAV = {
    defaultView: 'week',
    viewSteps: {
      week: { days: 7, view: 'week' },
      month: { months: 1, view: 'month' },
    },
  };

  function createEmptyMessage(text, className = 'text-sm text-muted') {
    const el = document.createElement('div');
    el.className = className;
    el.style.padding = '.5rem .75rem';
    el.textContent = text;
    return el;
  }

  function initialsFromName(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'E';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  ManagerShifts.Config = {
    getEl,
    getPageData,
    pad2,
    getPositionCbs,
    getEmployeeCbs,
    TIME_GRID_HOUR_HEIGHT_PX,
    SHIFT_LANE_GAP_PX,
    MANAGER_PERIOD_NAV,
    createEmptyMessage,
    initialsFromName,
  };
})();


(function() {
  'use strict';

  const ManagerShifts = window.ManagerShifts || {};
  const Config = ManagerShifts.Config || {};
  const { pad2 } = Config;

  function parseTimeToMinutes(value) {
    const [h, m] = String(value || '00:00').split(':').slice(0, 2).map(Number);
    const hh = Number.isFinite(h) ? h : 0;
    const mm = Number.isFinite(m) ? m : 0;
    return hh * 60 + mm;
  }

  function formatDurationMinutes(minutes) {
    const total = Math.max(0, parseInt(minutes, 10) || 0);
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  }

  function formatDateDMY(iso) {
    if (!iso) return '';
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return String(iso);
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  ManagerShifts.Time = {
    parseTimeToMinutes,
    formatDurationMinutes,
    formatDateDMY,
  };
})();


(function() {
  'use strict';

  const ManagerShifts = window.ManagerShifts || {};
  const Time = ManagerShifts.Time || {};
  const Config = ManagerShifts.Config || {};
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

  ManagerShifts.LaneLayout = {
    computeShiftLaneLayout,
    applyTimedShiftChipVertical,
  };
})();


(function() {
  'use strict';

  const ManagerShifts = window.ManagerShifts || {};
  const Config = ManagerShifts.Config || {};
  const { MANAGER_PERIOD_NAV } = Config;

  ManagerShifts.Layout = ManagerShifts.Layout || { syncLayout: () => {} };

  function wireStickyOffsets() {
    const header = document.querySelector('.header');
    if (!header) return;

    const sync = () => {
      const root = document.documentElement;
      const headerHeight = header.getBoundingClientRect().height;
      root.style.setProperty('--header-sticky-height', `${headerHeight}px`);

      const toolbar = document.querySelector('.card.page-toolbar-card');
      const toolbarHeight = toolbar?.getBoundingClientRect().height || 0;
      root.style.setProperty('--toolbar-sticky-height', `${toolbarHeight}px`);

      const legendBarHeight = parseFloat(getComputedStyle(root).getPropertyValue('--legend-bar-height')) || 0;

      const activeView = document.querySelector('#weekView.card:not(.hidden), #monthView.card:not(.hidden)');
      const viewMargin = activeView ? parseFloat(getComputedStyle(activeView).marginTop) || 0 : 0;

      const available = innerHeight - headerHeight - toolbarHeight - legendBarHeight - viewMargin * 2;
      root.style.setProperty('--manager-calendar-fill-height', `${Math.max(320, Math.floor(available))}px`);
    };

    sync();
    ManagerShifts.Layout.syncLayout = sync;

    let resizeTimer;
    addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(sync, 50);
    });
  }

  ManagerShifts.Nav = {
    switchView: (view) => window.calendarSwitchView?.('managerShiftPage', view),
    prevPeriod: () => window.calendarPrevPeriod?.('managerShiftPage', MANAGER_PERIOD_NAV),
    nextPeriod: () => window.calendarNextPeriod?.('managerShiftPage', MANAGER_PERIOD_NAV),
    goToToday:  () => window.calendarGoToToday?.('managerShiftPage', 'week'),
  };

  ManagerShifts.Layout.wireStickyOffsets = wireStickyOffsets;
})();
