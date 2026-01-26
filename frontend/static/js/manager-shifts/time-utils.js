/**
 * MANAGER SHIFTS - Time Utilities
 * Time parsing, formatting, and duration calculations
 */
(function() {
  'use strict';

  const Config = window.ManagerShiftsConfig || {};
  const { pad2 } = Config;

  function parseTimeToMinutes(value) {
    const [h, m] = String(value || '00:00').split(':').slice(0, 2).map((x) => parseInt(x, 10));
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

  function formatHoursCompact(minutes) {
    const total = Math.max(0, parseInt(minutes, 10) || 0);
    const rounded = Math.round((total / 60) * 10) / 10;
    return `${String(rounded).replace(/\.0$/, '')}h`;
  }

  function formatDateDMY(iso) {
    if (!iso) return '';
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return String(iso);
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  window.ManagerShiftsTime = {
    parseTimeToMinutes,
    formatDurationMinutes,
    formatHoursCompact,
    formatDateDMY,
  };
})();
