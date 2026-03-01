(function() {
  'use strict';

  const Config = window.ManagerShiftsConfig || {};
const { MANAGER_PERIOD_NAV } = Config;

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
  window.ManagerShiftsLayout.syncLayout = sync;

  let resizeTimer;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(sync, 50);
  });
}

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

window.switchView = switchView;
window.prevPeriod = prevPeriod;
window.nextPeriod = nextPeriod;
window.goToToday = goToToday;

window.ManagerShiftsLayout = {
  wireStickyOffsets,
  syncLayout: () => {},
};

})();
