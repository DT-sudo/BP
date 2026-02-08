/**
 * MANAGER SHIFTS - Main Entry Point
 * Initializes all modules and wires up the page
 * 
 * Module Load Order (important for dependencies):
 * 1. config.js         - Constants and utilities
 * 2. time-utils.js     - Time parsing functions  
 * 3. lane-layout.js    - Shift positioning algorithm
 * 4. position-palette.js   - Color system
 * 5. filters.js        - URL builder and dropdowns
 * 6. employee-picker.js - Employee selection
 * 7. sidebar.js        - Employee sidebar
 * 8. bulk-selection.js - Multi-select functionality
 * 9. calendar.js       - Calendar renderers
 * 10. shift-modal.js   - Create/edit/details modals
 * 11. layout.js        - Sticky headers and navigation
 * 12. index.js         - This file (initialization)
 */

(function() {
  'use strict';

  // Check calendar-utils globals
  if (!window.parseJsonScript) {
    console.error('[ManagerShifts] Missing parseJsonScript from calendar-utils.js');
    return;
  }
  if (!window.toISODate) {
    console.error('[ManagerShifts] Missing toISODate from calendar-utils.js');
    return;
  }

  // Verify all modules loaded
  const modules = {
    Config: window.ManagerShiftsConfig,
    Filters: window.ManagerShiftsFilters,
    EmployeePicker: window.ManagerShiftsEmployeePicker,
    Sidebar: window.ManagerShiftsSidebar,
    BulkSelection: window.ManagerShiftsBulkSelection,
    Calendar: window.ManagerShiftsCalendar,
    PositionPalette: window.ManagerShiftsPositionPalette,
    Modal: window.ManagerShiftsModal,
    Layout: window.ManagerShiftsLayout,
  };

  const missing = Object.entries(modules).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    console.error('[ManagerShifts] Missing modules:', missing.join(', '));
    return;
  }

  const { Config, Filters, EmployeePicker, Sidebar, BulkSelection, Calendar, PositionPalette, Modal, Layout } = modules;

  let managerCurrentShifts = [];

  function initManagerShifts() {
    const page = Config.getEl('managerShiftPage');
    if (!page) {
      console.error('[ManagerShifts] managerShiftPage element not found');
      return;
    }

    const pageData = page.dataset;
    
    BulkSelection.setServerCanUndo(pageData.canUndo === '1');

    Layout.wireStickyOffsets();
    BulkSelection.wireSelectionEscapeCancel();

    // Force reload on back/forward cache
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) window.location.reload();
    });

    const config = {
      baseUrl: pageData.baseUrl,
      view: pageData.view,
      anchor: pageData.anchor,
      start: pageData.start,
      end: pageData.end,
      today: pageData.today,
      shiftDetailsUrlTemplate: pageData.shiftDetailsUrlTemplate,
    };

    // Parse data from script tags
    const shifts = parseJsonScript('managerShiftsData', []);
    managerCurrentShifts = Array.isArray(shifts) ? shifts : [];
    EmployeePicker.setManagerCurrentShifts(managerCurrentShifts);
    
    const employees = parseJsonScript('managerEmployeesData', []);
    Sidebar.setManagerEmployees(Array.isArray(employees) ? employees : []);
    Sidebar.computeEmployeePeriodStats(managerCurrentShifts);
    
    const formState = parseJsonScript('shiftFormState', null);

    // Initialize components
    Layout.initManagerMonthPicker(config);
    Filters.wireManagerMultiselectHooks();
    Sidebar.wireEmployeeSidebarControls();
    Sidebar.renderEmployeeSidebar();
    Filters.wireManagerFiltersMultiselectClickThrough();
    EmployeePicker.wireEmployeeChipRemovals();
    EmployeePicker.initEmployeeBuckets();
    Filters.updatePositionMulti();
    EmployeePicker.updateEmployeeMulti();
    Modal.wireCreateShiftValidation();
    
    Config.getEl('shiftPosition')?.addEventListener('change', EmployeePicker.filterEmployeePicker);
    
    PositionPalette.renderPositionLegend(PositionPalette.collectPositionsFromDom(), managerCurrentShifts);
    EmployeePicker.refreshPositionsFromServer();
    Sidebar.renderEmployeeSidebar();

    // Render calendar view
    Calendar.wireCalendarClicks('weekGrid');
    Calendar.wireCalendarClicks('monthGrid');

    if (config.view === 'month') {
      Calendar.renderMonthGrid(config, shifts);
    } else if (config.view === 'day') {
      Calendar.renderDayGrid(config, shifts);
    } else {
      Calendar.renderWeekGrid(config, shifts);
    }
    BulkSelection.updateSelectionUI();
    Layout.wireDayViewResizeReflow(config, managerCurrentShifts, Calendar.renderDayGrid);

    // Restore form state if validation failed
    if (formState && typeof formState === 'object') {
      Modal.resetCreateShiftModal();
      Modal.clearCreateShiftErrors();

      const mode = formState.mode || 'create';
      const shiftId = formState.shift_id;
      if (formState.date) Config.getEl('shiftDate').value = formState.date;
      if (formState.start_time) Config.getEl('shiftStart').value = formState.start_time;
      if (formState.end_time) Config.getEl('shiftEnd').value = formState.end_time;
      if (formState.capacity) Config.getEl('shiftCapacity').value = String(formState.capacity);
      if (formState.position_id) Config.getEl('shiftPosition').value = String(formState.position_id);
      Config.getEl('publishImmediatelyCustom').checked = !!formState.publish;

      EmployeePicker.filterEmployeePicker();
      const selectedIds = new Set((formState.employee_ids || []).map(String));
      for (const cb of Config.getEmployeeCbs()) cb.checked = selectedIds.has(String(cb.value));

      if (mode === 'update' && shiftId) {
        Config.getEl('createShiftTitle').textContent = 'Edit Shift';
        Config.getEl('createShiftSubmit').textContent = 'Save';
        const updateTpl = pageData.shiftUpdateUrlTemplate;
        const form = Config.getEl('createShiftForm');
        if (form && updateTpl) form.action = urlFromTemplate(updateTpl, shiftId);
      }

      EmployeePicker.updateEmployeeMulti();

      const errorField = formState.error_field;
      if (errorField === 'capacity') Config.getEl('shiftCapacity')?.classList.add('form-error');
      else if (errorField === 'employee_ids') Config.getEl('employeeMulti')?.classList.add('form-error');
      openModal('createShiftModal');
    }
  }

  // Bootstrap
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initManagerShifts);
  } else {
    initManagerShifts();
  }
})();
