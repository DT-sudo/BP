(function () {
  function toISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function addDays(isoDate, delta) {
    const d = new Date(`${isoDate}T00:00:00`);
    d.setDate(d.getDate() + delta);
    return toISODate(d);
  }

  function addMonths(isoDate, delta) {
    const d = new Date(`${isoDate}T00:00:00`);
    d.setMonth(d.getMonth() + delta);
    return toISODate(d);
  }

  function navigateWith(params) {
    const url = new URL(window.location.href);
    const search = url.searchParams;
    Object.entries(params).forEach(([k, v]) => {
      if (v === null || v === undefined || v === '') search.delete(k);
      else search.set(k, v);
    });
    window.location.assign(`${url.pathname}?${search.toString()}`);
  }

  function getPageEl(pageId) {
    const el = document.getElementById(pageId);
    return el && el.dataset ? el : null;
  }

  function navigateRelativePeriod(pageId, direction, options) {
    const page = getPageEl(pageId);
    if (!page) return;

    const defaultView = (options?.defaultView || '').toLowerCase();
    const view = String(page.dataset.view || defaultView || '').toLowerCase();
    const anchor = page.dataset.anchor || '';
    if (!anchor) return;

    const steps = options?.viewSteps || {};
    const step = steps[view] || steps[defaultView] || null;
    if (!step) return;

    const targetView = String(step.view || view || defaultView || '').toLowerCase();

    let date = anchor;
    if (typeof step.days === 'number') date = addDays(anchor, direction * step.days);
    else if (typeof step.months === 'number') date = addMonths(anchor, direction * step.months);

    navigateWith({ view: targetView || view, date });
  }

  function goToToday(pageId, defaultView) {
    const page = getPageEl(pageId);
    if (!page) return;
    const view = page.dataset.view || defaultView || '';
    const today = page.dataset.today || '';
    if (!today) return;
    navigateWith({ view, date: today });
  }

  function parseJsonScript(id, fallback) {
    const el = document.getElementById(id);
    if (!el) return fallback;
    try {
      return JSON.parse(el.textContent || '');
    } catch (e) {
      return fallback;
    }
  }

  function weekdayLabel(d) {
    return d.toLocaleDateString(undefined, { weekday: 'short' });
  }

  function dayNumber(d) {
    return d.getDate();
  }

  function toDateAtMidnight(iso) {
    const raw = String(iso || '').trim();
    if (!raw) return null;
    const d = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }

  window.calendarRenderMonthGrid = function calendarRenderMonthGrid(gridOrId, options) {
    const grid =
      typeof gridOrId === 'string' ? document.getElementById(String(gridOrId)) : gridOrId;
    if (!grid) return null;

    const anchorISO = options?.anchorISO;
    const todayISO = options?.todayISO;
    const fallbackISO = options?.fallbackISO;
    const onCell = options?.onCell;

    const anchorDate = toDateAtMidnight(anchorISO) || toDateAtMidnight(fallbackISO);
    if (!anchorDate) return null;

    const anchorMonth = anchorDate.getMonth();
    const anchorYear = anchorDate.getFullYear();
    const firstOfMonth = new Date(anchorYear, anchorMonth, 1);
    const startDow = firstOfMonth.getDay(); // 0=Sun
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(firstOfMonth.getDate() - startDow);

    grid.innerHTML = '';

    const labels = options?.weekdayLabels || ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    labels.forEach((label) => {
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
      if (iso === todayISO) cell.classList.add('calendar-cell-today');
      const inMonth = d.getMonth() === anchorMonth;
      if (!inMonth) cell.classList.add('calendar-cell-other-month');

      const dateEl = document.createElement('div');
      dateEl.className = 'calendar-date';
      dateEl.textContent = String(d.getDate());
      cell.appendChild(dateEl);

      if (typeof onCell === 'function') onCell(cell, { date: d, iso, inMonth });
      grid.appendChild(cell);
    }

    return { anchorDate, gridStart };
  };

  window.toISODate = toISODate;
  window.addDays = addDays;
  window.addMonths = addMonths;
  window.navigateWith = navigateWith;
  window.parseJsonScript = parseJsonScript;
  window.weekdayLabel = weekdayLabel;
  window.dayNumber = dayNumber;

  window.calendarSwitchView = function calendarSwitchView(pageId, view) {
    const page = getPageEl(pageId);
    const anchor = page?.dataset.anchor || '';
    navigateWith({ view, date: anchor });
  };

  window.calendarPrevPeriod = function calendarPrevPeriod(pageId, options) {
    navigateRelativePeriod(pageId, -1, options);
  };

  window.calendarNextPeriod = function calendarNextPeriod(pageId, options) {
    navigateRelativePeriod(pageId, 1, options);
  };

  window.calendarGoToToday = function calendarGoToToday(pageId, defaultView) {
    goToToday(pageId, defaultView);
  };
})();
