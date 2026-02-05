/**
 * MANAGER SHIFTS - Layout & Navigation
 * Sticky headers, month picker, and calendar navigation
 */

(function() {
  'use strict';

  const Config = window.ManagerShiftsConfig || {};
const { getEl, MANAGER_PERIOD_NAV } = Config;

// Calendar-utils global
const navigateWith = window.navigateWith;

// Month picker state
let managerMonthPickerYear = null;
let managerMonthPickerAnchorYear = null;
let managerMonthPickerAnchorMonth = null;

function renderManagerMonthPicker() {
  const yearLabel = getEl('managerMonthPickerYearLabel');
  const grid = getEl('managerMonthPickerGrid');
  if (!yearLabel || !grid) return;

  yearLabel.textContent = String(managerMonthPickerYear || '');
  grid.innerHTML = '';

  const now = new Date();
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth();

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  months.forEach((m, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'month-picker-btn';
    btn.textContent = m;
    if (
      managerMonthPickerYear === managerMonthPickerAnchorYear &&
      managerMonthPickerAnchorMonth != null &&
      idx === managerMonthPickerAnchorMonth
    ) {
      btn.classList.add('active');
    }
    if (managerMonthPickerYear === nowYear && idx === nowMonth) {
      btn.classList.add('current');
    }
    btn.addEventListener('click', () => {
      const mm = String(idx + 1).padStart(2, '0');
      const iso = `${managerMonthPickerYear}-${mm}-01`;
      window.closeAllMultiselects?.();
      navigateWith({ view: 'month', date: iso });
    });
    grid.appendChild(btn);
  });
}

function managerMonthPickerPrevYear() {
  managerMonthPickerYear = (managerMonthPickerYear || new Date().getFullYear()) - 1;
  renderManagerMonthPicker();
}

function managerMonthPickerNextYear() {
  managerMonthPickerYear = (managerMonthPickerYear || new Date().getFullYear()) + 1;
  renderManagerMonthPicker();
}

function initManagerMonthPicker(config) {
  const anchor = new Date(`${config.anchor}T00:00:00`);
  if (Number.isNaN(anchor.getTime())) {
    const now = new Date();
    managerMonthPickerYear = now.getFullYear();
    managerMonthPickerAnchorYear = now.getFullYear();
    managerMonthPickerAnchorMonth = now.getMonth();
  } else {
    managerMonthPickerYear = anchor.getFullYear();
    managerMonthPickerAnchorYear = anchor.getFullYear();
    managerMonthPickerAnchorMonth = anchor.getMonth();
  }
  renderManagerMonthPicker();
}

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

    const legend = getEl('positionLegendCard');
    const legendHeight = legend?.getBoundingClientRect().height || 0;
    root.style.setProperty('--bottom-legend-height', `${legendHeight}px`);

    const activeView = document.querySelector('#weekView.card:not(.hidden), #monthView.card:not(.hidden), #dayView.card:not(.hidden)');
    const viewMargin = activeView ? parseFloat(getComputedStyle(activeView).marginTop) || 0 : 0;

    const available = innerHeight - headerHeight - toolbarHeight - legendHeight - viewMargin * 2;
    root.style.setProperty('--manager-calendar-fill-height', `${Math.max(320, Math.floor(available))}px`);
  };

  sync();
  window.managerSyncStickyOffsets = sync;

  let resizeTimer;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(sync, 50);
  });
}

function wireDayViewResizeReflow(config, shifts, renderDayGridFn) {
  if (window._managerDayViewResizeBound) return;
  window._managerDayViewResizeBound = true;
  let timer = null;
  window.addEventListener('resize', () => {
    if (config?.view !== 'day') return;
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      renderDayGridFn(config, shifts);
      window.ManagerShiftsBulkSelection?.updateSelectionUI?.();
    }, 60);
  });
}

// Navigation functions
function switchView(view) {
  window.calendarSwitchView?.('managerShiftPage', view);
}

function prevPeriod() {
  window.calendarPrevPeriod?.('managerShiftPage', MANAGER_PERIOD_NAV);
}

function nextPeriod() {
  window.calendarNextPeriod?.('managerShiftPage', MANAGER_PERIOD_NAV);
}

function goToToday() {
  window.calendarGoToToday?.('managerShiftPage', 'week');
}

// Global exports for HTML onclick handlers
window.managerMonthPickerPrevYear = managerMonthPickerPrevYear;
window.managerMonthPickerNextYear = managerMonthPickerNextYear;
window.switchView = switchView;
window.prevPeriod = prevPeriod;
window.nextPeriod = nextPeriod;
window.goToToday = goToToday;

window.ManagerShiftsLayout = {
  initManagerMonthPicker,
  wireStickyOffsets,
  wireDayViewResizeReflow,
  switchView,
  prevPeriod,
  nextPeriod,
  goToToday,
};

})();
