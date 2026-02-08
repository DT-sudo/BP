/**
 * Calendar Utilities
 * Date helpers, navigation, and grid rendering for calendar views
 */
(function () {
  'use strict';

  // Date formatting
  function toISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function dateFromISO(isoString) {
    const cleaned = String(isoString || '').trim();
    if (!cleaned) return null;

    const date = new Date(cleaned + 'T00:00:00');
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  // Date arithmetic
  function addDays(isoString, days) {
    const date = dateFromISO(isoString);
    if (!date) return isoString;

    date.setDate(date.getDate() + days);
    return toISODate(date);
  }

  function addMonths(isoString, months) {
    const date = dateFromISO(isoString);
    if (!date) return isoString;

    date.setMonth(date.getMonth() + months);
    return toISODate(date);
  }

  // Navigation
  function navigateWith(params) {
    const url = new URL(window.location.href);
    const searchParams = url.searchParams;

    for (const key of Object.keys(params)) {
      const value = params[key];
      if (value == null || value === '') {
        searchParams.delete(key);
      } else {
        searchParams.set(key, value);
      }
    }

    window.location.assign(url.pathname + '?' + searchParams.toString());
  }

  function getPageElement(id) {
    const element = document.getElementById(id);
    if (element && element.dataset) {
      return element;
    }
    return null;
  }

  function normalizeView(view) {
    return String(view || '').toLowerCase();
  }

  function navigateRelative(pageId, direction, options) {
    const page = getPageElement(pageId);
    if (!page) return;

    const defaultView = normalizeView(options ? options.defaultView : '');
    const currentView = normalizeView(page.dataset.view || defaultView);
    const anchor = page.dataset.anchor;

    if (!anchor) return;

    const viewSteps = (options ? options.viewSteps : null) || {};
    const step = viewSteps[currentView] || viewSteps[defaultView];
    if (!step) return;

    const targetView = normalizeView(step.view || currentView || defaultView);
    let targetDate = anchor;

    if (typeof step.days === 'number') {
      targetDate = addDays(anchor, direction * step.days);
    } else if (typeof step.months === 'number') {
      targetDate = addMonths(anchor, direction * step.months);
    }

    navigateWith({ view: targetView || currentView, date: targetDate });
  }

  function goToToday(pageId, defaultView) {
    const page = getPageElement(pageId);
    if (!page) return;

    const today = page.dataset.today;
    if (today) {
      navigateWith({ view: page.dataset.view || defaultView || '', date: today });
    }
  }

  // JSON parsing
  function parseJsonScript(id, fallback) {
    const element = document.getElementById(id);
    if (!element) return fallback;

    try {
      return JSON.parse(element.textContent || '');
    } catch (err) {
      return fallback;
    }
  }

  // Display helpers
  function weekdayLabel(date) {
    return date.toLocaleDateString(undefined, { weekday: 'short' });
  }

  function dayNumber(date) {
    return date.getDate();
  }

  const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Month grid rendering
  window.calendarRenderMonthGrid = function (gridOrId, options) {
    options = options || {};

    const grid = (typeof gridOrId === 'string')
      ? document.getElementById(gridOrId)
      : gridOrId;

    if (!grid) return null;

    const anchorISO = options.anchorISO;
    const todayISO = options.todayISO;
    const fallbackISO = options.fallbackISO;
    const onCell = options.onCell;
    const weekdayLabels = options.weekdayLabels || WEEKDAY_LABELS;

    const anchor = dateFromISO(anchorISO) || dateFromISO(fallbackISO);
    if (!anchor) return null;

    const month = anchor.getMonth();
    const firstOfMonth = new Date(anchor.getFullYear(), month, 1);
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(1 - firstOfMonth.getDay());

    grid.innerHTML = '';

    // Add weekday headers
    for (const label of weekdayLabels) {
      const headerCell = document.createElement('div');
      headerCell.className = 'calendar-header-cell';
      headerCell.textContent = label;
      grid.appendChild(headerCell);
    }

    // Add day cells (6 weeks x 7 days = 42 cells)
    for (let i = 0; i < 42; i++) {
      const cellDate = new Date(gridStart);
      cellDate.setDate(gridStart.getDate() + i);

      const isoDate = toISODate(cellDate);
      const isInMonth = (cellDate.getMonth() === month);

      const cell = document.createElement('div');
      cell.className = 'calendar-cell';
      cell.dataset.date = isoDate;

      if (isoDate === todayISO) {
        cell.classList.add('calendar-cell-today');
      }
      if (!isInMonth) {
        cell.classList.add('calendar-cell-other-month');
      }

      const dateLabel = document.createElement('div');
      dateLabel.className = 'calendar-date';
      dateLabel.textContent = cellDate.getDate();
      cell.appendChild(dateLabel);

      // Allow customization via callback
      if (onCell) {
        onCell(cell, { date: cellDate, iso: isoDate, inMonth: isInMonth });
      }

      grid.appendChild(cell);
    }

    return { anchorDate: anchor, gridStart: gridStart };
  };

  // Export globals
  window.toISODate = toISODate;
  window.navigateWith = navigateWith;
  window.parseJsonScript = parseJsonScript;
  window.weekdayLabel = weekdayLabel;
  window.dayNumber = dayNumber;

  window.calendarSwitchView = function (pageId, view) {
    const page = getPageElement(pageId);
    const anchor = page ? page.dataset.anchor : '';
    navigateWith({ view: view, date: anchor });
  };

  window.calendarPrevPeriod = function (pageId, options) {
    navigateRelative(pageId, -1, options);
  };

  window.calendarNextPeriod = function (pageId, options) {
    navigateRelative(pageId, 1, options);
  };

  window.calendarGoToToday = goToToday;
})();
