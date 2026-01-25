(function () {
  // Core date utilities
  function toISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function dateFromISO(iso) {
    const raw = String(iso || '').trim();
    if (!raw) return null;
    const d = new Date(`${raw}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function addDays(isoDate, delta) {
    const d = dateFromISO(isoDate);
    if (!d) return isoDate;
    d.setDate(d.getDate() + delta);
    return toISODate(d);
  }

  function addMonths(isoDate, delta) {
    const d = dateFromISO(isoDate);
    if (!d) return isoDate;
    d.setMonth(d.getMonth() + delta);
    return toISODate(d);
  }

  // Navigation utilities
  function navigateWith(params) {
    const url = new URL(window.location.href);
    const search = url.searchParams;
    for (const [k, v] of Object.entries(params)) {
      if (v == null || v === '') search.delete(k);
      else search.set(k, v);
    }
    window.location.assign(`${url.pathname}?${search.toString()}`);
  }

  function getPageEl(pageId) {
    const el = document.getElementById(pageId);
    return el?.dataset ? el : null;
  }

  function normalizeView(value) {
    return String(value || '').toLowerCase();
  }

  function navigateRelativePeriod(pageId, direction, options) {
    const page = getPageEl(pageId);
    if (!page) return;

    const defaultView = normalizeView(options?.defaultView);
    const view = normalizeView(page.dataset.view || defaultView);
    const anchor = page.dataset.anchor;
    if (!anchor) return;

    const steps = options?.viewSteps || {};
    const step = steps[view] || steps[defaultView];
    if (!step) return;

    const targetView = normalizeView(step.view || view || defaultView);

    let date = anchor;
    if (typeof step.days === 'number') date = addDays(anchor, direction * step.days);
    else if (typeof step.months === 'number') date = addMonths(anchor, direction * step.months);

    navigateWith({ view: targetView || view, date });
  }

  function goToToday(pageId, defaultView) {
    const page = getPageEl(pageId);
    if (!page) return;

    const view = page.dataset.view || defaultView || '';
    const today = page.dataset.today;
    if (today) navigateWith({ view, date: today });
  }

  // JSON parsing utility
  function parseJsonScript(id, fallback) {
    const el = document.getElementById(id);
    if (!el) return fallback;
    try {
      return JSON.parse(el.textContent || '');
    } catch {
      return fallback;
    }
  }

  // Date formatting utilities
  function weekdayLabel(d) {
    return d.toLocaleDateString(undefined, { weekday: 'short' });
  }

  function dayNumber(d) {
    return d.getDate();
  }

  // Calendar grid rendering
  const DEFAULT_WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  window.calendarRenderMonthGrid = function calendarRenderMonthGrid(gridOrId, options = {}) {
    const grid = typeof gridOrId === 'string' ? document.getElementById(gridOrId) : gridOrId;
    if (!grid) return null;

    const { anchorISO, todayISO, fallbackISO, onCell, weekdayLabels = DEFAULT_WEEKDAY_LABELS } = options;

    const anchorDate = dateFromISO(anchorISO) || dateFromISO(fallbackISO);
    if (!anchorDate) return null;

    const anchorMonth = anchorDate.getMonth();
    const firstOfMonth = new Date(anchorDate.getFullYear(), anchorMonth, 1);
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(1 - firstOfMonth.getDay()); // Rewind to Sunday of first week

    grid.innerHTML = '';

    // Render weekday headers
    for (const label of weekdayLabels) {
      const header = document.createElement('div');
      header.className = 'calendar-header-cell';
      header.textContent = label;
      grid.appendChild(header);
    }

    // Render 6 weeks of day cells
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      const iso = toISODate(d);
      const inMonth = d.getMonth() === anchorMonth;

      const cell = document.createElement('div');
      cell.className = 'calendar-cell';
      cell.dataset.date = iso;
      if (iso === todayISO) cell.classList.add('calendar-cell-today');
      if (!inMonth) cell.classList.add('calendar-cell-other-month');

      const dateEl = document.createElement('div');
      dateEl.className = 'calendar-date';
      dateEl.textContent = d.getDate();
      cell.appendChild(dateEl);

      onCell?.(cell, { date: d, iso, inMonth });
      grid.appendChild(cell);
    }

    return { anchorDate, gridStart };
  };

  // Expose utilities globally
  window.toISODate = toISODate;
  window.navigateWith = navigateWith;
  window.parseJsonScript = parseJsonScript;
  window.weekdayLabel = weekdayLabel;
  window.dayNumber = dayNumber;

  window.calendarSwitchView = function calendarSwitchView(pageId, view) {
    const anchor = getPageEl(pageId)?.dataset.anchor || '';
    navigateWith({ view, date: anchor });
  };

  window.calendarPrevPeriod = (pageId, options) => navigateRelativePeriod(pageId, -1, options);
  window.calendarNextPeriod = (pageId, options) => navigateRelativePeriod(pageId, 1, options);
  window.calendarGoToToday = goToToday;
})();
