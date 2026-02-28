(function() {
  'use strict';

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

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => {
      switch (ch) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return ch;
      }
    });
  }

  function initialsFromName(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'E';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  window.ManagerShiftsConfig = {
    getEl,
    getPageData,
    pad2,
    getPositionCbs,
    getEmployeeCbs,
    TIME_GRID_HOUR_HEIGHT_PX,
    SHIFT_LANE_GAP_PX,
    MANAGER_PERIOD_NAV,
    createEmptyMessage,
    escapeHtml,
    initialsFromName,
  };
})();
