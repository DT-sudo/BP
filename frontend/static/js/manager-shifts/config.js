/**
 * MANAGER SHIFTS - Configuration & Utilities
 * Shared constants, DOM helpers, and utility functions
 */
(function() {
  'use strict';

  // DOM helpers
  const getEl = (id) => document.getElementById(id);
  const getPageData = () => getEl('managerShiftPage')?.dataset;
  const pad2 = (n) => String(n).padStart(2, '0');

  // CSS selectors
  const POSITION_CB_SEL = '#positionMulti input[type="checkbox"]';
  const EMPLOYEE_CB_SEL = '#employeeMulti input[type="checkbox"]';
  const getPositionCbs = () => document.querySelectorAll(POSITION_CB_SEL);
  const getEmployeeCbs = () => [...document.querySelectorAll(EMPLOYEE_CB_SEL)];

  // Layout constants
  const TIME_GRID_HOUR_WIDTH_PX = 72;
  const TIME_GRID_HOUR_HEIGHT_PX = 56;
  const SHIFT_LANE_HEIGHT_PX = 60;
  const SHIFT_LANE_GAP_PX = 4;

  // Navigation config
  const MANAGER_PERIOD_NAV = {
    defaultView: 'week',
    viewSteps: {
      day: { days: 1, view: 'day' },
      week: { days: 7, view: 'week' },
      month: { months: 1, view: 'month' },
    },
  };

  // Utility functions
  function clearStyles(el, ...props) {
    if (!el) return;
    for (const p of props) el.style[p] = '';
  }

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

  // Export to window
  window.ManagerShiftsConfig = {
    getEl,
    getPageData,
    pad2,
    POSITION_CB_SEL,
    EMPLOYEE_CB_SEL,
    getPositionCbs,
    getEmployeeCbs,
    TIME_GRID_HOUR_WIDTH_PX,
    TIME_GRID_HOUR_HEIGHT_PX,
    SHIFT_LANE_HEIGHT_PX,
    SHIFT_LANE_GAP_PX,
    MANAGER_PERIOD_NAV,
    clearStyles,
    createEmptyMessage,
    escapeHtml,
    initialsFromName,
  };
})();
