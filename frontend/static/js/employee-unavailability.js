/**
 * Employee Unavailability Calendar
 * Allows employees to mark dates when they're unavailable
 */
const PAGE_ID = 'employeeUnavailabilityPage';
const GRID_ID = 'employeeUnavailableMonthGrid';
const LIST_ID = 'unavailableDaysList';

const NAV_OPTIONS = {
  defaultView: 'month',
  viewSteps: {
    month: { months: 1, view: 'month' }
  }
};

let unavailableDays = new Set();

// Navigation
function prevPeriod() {
  if (window.calendarPrevPeriod) {
    window.calendarPrevPeriod(PAGE_ID, NAV_OPTIONS);
  }
}

function nextPeriod() {
  if (window.calendarNextPeriod) {
    window.calendarNextPeriod(PAGE_ID, NAV_OPTIONS);
  }
}

function goToToday() {
  if (window.calendarGoToToday) {
    window.calendarGoToToday(PAGE_ID, 'month');
  }
}

// Format date for display
function formatPrettyDate(isoDate) {
  const date = new Date(isoDate + 'T00:00:00');
  if (Number.isNaN(date.getTime())) return isoDate;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

// Activate handler for click and keyboard
function bindActivate(element, handler) {
  if (!element || typeof handler !== 'function') return;

  function invoke(event) {
    event.preventDefault();
    event.stopPropagation();
    handler(event);
  }

  element.addEventListener('click', invoke);
  element.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' || event.key === ' ') {
      invoke(event);
    }
  });
}

// Cell styling
function setUnavailable(cell, isUnavailable) {
  if (cell) {
    cell.classList.toggle('calendar-cell-unavailable', !!isUnavailable);
  }
}

function findCellByDate(isoDate) {
  const grid = document.getElementById(GRID_ID);
  if (!grid) return null;
  return grid.querySelector('.calendar-cell[data-date="' + isoDate + '"]');
}

// Toggle unavailability
async function toggleUnavailability(isoDate) {
  const page = document.getElementById(PAGE_ID);
  const url = page ? page.dataset.toggleUrl : null;
  if (!url) return;

  let cell = findCellByDate(isoDate);
  if (cell) {
    cell.classList.add('calendar-cell-busy');
  }

  try {
    let response = await window.postFormJson(url, { date: isoDate });

    if (response && response.unavailable) {
      unavailableDays.add(isoDate);
    } else {
      unavailableDays.delete(isoDate);
    }

    setUnavailable(cell, response && response.unavailable);
    renderUnavailableList();
  } catch (error) {
    let message = (error && error.message) ? error.message : 'Could not update availability.';
    if (window.showToast) {
      window.showToast('error', 'Error', message);
    }
  } finally {
    if (cell) {
      cell.classList.remove('calendar-cell-busy');
    }
  }
}

// Render unavailable days list
function renderUnavailableList() {
  const listContainer = document.getElementById(LIST_ID);
  if (!listContainer) return;

  const sortedDays = Array.from(unavailableDays).sort();

  if (sortedDays.length === 0) {
    listContainer.innerHTML = '<div class="text-sm text-muted">No unavailable days selected.</div>';
    return;
  }

  listContainer.innerHTML = '';
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < sortedDays.length; i++) {
    const isoDate = sortedDays[i];
    const prettyDate = formatPrettyDate(isoDate);

    const chip = document.createElement('span');
    chip.className = 'date-chip';

    // Remove button
    const removeBtn = document.createElement('span');
    removeBtn.className = 'chip-remove';
    removeBtn.setAttribute('role', 'button');
    removeBtn.setAttribute('tabindex', '0');
    removeBtn.setAttribute('aria-label', 'Remove ' + prettyDate);
    removeBtn.textContent = 'x';

    // Closure to capture isoDate
    (function (dateToToggle) {
      bindActivate(removeBtn, function () {
        toggleUnavailability(dateToToggle);
      });
    })(isoDate);

    // Date text
    const dateText = document.createElement('span');
    dateText.className = 'chip-text';
    dateText.textContent = prettyDate;

    chip.appendChild(removeBtn);
    chip.appendChild(dateText);
    fragment.appendChild(chip);
  }

  listContainer.appendChild(fragment);
}

// Render calendar grid
function renderGrid(config) {
  const grid = document.getElementById(GRID_ID);
  if (!grid) return;

  if (window.calendarRenderMonthGrid) {
    window.calendarRenderMonthGrid(grid, {
      anchorISO: config.anchor,
      todayISO: config.today,
      onCell: function (cell, info) {
        setUnavailable(cell, unavailableDays.has(info.iso));

        cell.onclick = function (event) {
          event.preventDefault();
          event.stopPropagation();

          if (info.inMonth) {
            toggleUnavailability(info.iso);
          } else {
            // Navigate to that month
            if (window.navigateWith) {
              window.navigateWith({ view: 'month', date: info.iso });
            }
          }
        };
      }
    });
  }
}

// Initialize
function init() {
  const page = document.getElementById(PAGE_ID);
  if (!page) return;

  // Load initial data
  let initialData = window.parseJsonScript ? window.parseJsonScript('employeeUnavailableData', []) : [];

  if (Array.isArray(initialData)) {
    unavailableDays = new Set(initialData.map(String));
  } else {
    unavailableDays = new Set();
  }

  // Render
  renderGrid({
    anchor: page.dataset.anchor,
    today: page.dataset.today
  });
  renderUnavailableList();
}

// Auto-init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
