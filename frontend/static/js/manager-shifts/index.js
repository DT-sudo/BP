/**
 * MANAGER SHIFTS - Main Entry Point
 * Initializes all modules and wires up the page
 * 
 * Module Load Order (important for dependencies):
 * 1. config.js         - Constants and utilities
 * 2. time-utils.js     - Time parsing functions  
 * 3. lane-layout.js    - Shift positioning algorithm
 * 4. role-palette.js   - Color system
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

  console.log('[ManagerShifts] Starting initialization...');

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
    RolePalette: window.ManagerShiftsRolePalette,
    Modal: window.ManagerShiftsModal,
    Layout: window.ManagerShiftsLayout,
  };

  const missing = Object.entries(modules).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    console.error('[ManagerShifts] Missing modules:', missing.join(', '));
    return;
  }

  console.log('[ManagerShifts] All modules loaded successfully');

  const { Config, Filters, EmployeePicker, Sidebar, BulkSelection, Calendar, RolePalette, Modal, Layout } = modules;

  let managerCurrentShifts = [];

  function initManagerShifts() {
    console.log('[ManagerShifts] initManagerShifts called');
    
    const page = Config.getEl('managerShiftPage');
    if (!page) {
      console.error('[ManagerShifts] managerShiftPage element not found');
      return;
    }

    const pageData = page.dataset;
    console.log('[ManagerShifts] Page data:', pageData);
    
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
    console.log('[ManagerShifts] Shifts loaded:', managerCurrentShifts.length);
    EmployeePicker.setManagerCurrentShifts(managerCurrentShifts);
    
    const employees = parseJsonScript('managerEmployeesData', []);
    console.log('[ManagerShifts] Employees loaded:', employees?.length || 0);
    Sidebar.setManagerEmployees(Array.isArray(employees) ? employees : []);
    Sidebar.computeEmployeePeriodStats(managerCurrentShifts);
    
    const formState = parseJsonScript('shiftFormState', null);

    // Initialize components
    console.log('[ManagerShifts] Initializing components...');
    Layout.initManagerMonthPicker(config);
    Filters.wireManagerMultiselectHooks();
    Sidebar.wireEmployeeSidebarControls();
    console.log('[ManagerShifts] Rendering sidebar...');
    Sidebar.renderEmployeeSidebar();;
    Filters.wireManagerFiltersMultiselectClickThrough();
    EmployeePicker.wireEmployeeChipRemovals();
    EmployeePicker.initEmployeeBuckets();
    Filters.updatePositionMulti();
    EmployeePicker.updateEmployeeMulti();
    Modal.wireCreateShiftValidation();
    
    Config.getEl('shiftPosition')?.addEventListener('change', EmployeePicker.filterEmployeePicker);
    
    RolePalette.renderRoleLegend(RolePalette.collectPositionsFromDom(), managerCurrentShifts);
    EmployeePicker.refreshPositionsFromServer();
    Sidebar.renderEmployeeSidebar();

    // Render calendar view
    console.log('[ManagerShifts] Rendering calendar view:', config.view);
    Calendar.wireCalendarClicks('weekGrid');
    Calendar.wireCalendarClicks('monthGrid');

    if (config.view === 'month') {
      console.log('[ManagerShifts] Rendering month grid');
      Calendar.renderMonthGrid(config, shifts);
    } else if (config.view === 'day') {
      console.log('[ManagerShifts] Rendering day grid');
      Calendar.renderDayGrid(config, shifts);
    } else {
      console.log('[ManagerShifts] Rendering week grid');
      Calendar.renderWeekGrid(config, shifts);
    }
    
    console.log('[ManagerShifts] Initialization complete');
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
