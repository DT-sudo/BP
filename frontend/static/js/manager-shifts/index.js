(function() {
  'use strict';

  if (!window.parseJsonScript) {
    console.error('[ManagerShifts] Missing parseJsonScript from calendar-utils.js');
    return;
  }
  if (!window.toISODate) {
    console.error('[ManagerShifts] Missing toISODate from calendar-utils.js');
    return;
  }

  const modules = {
    Config: window.ManagerShiftsConfig,
    Filters: window.ManagerShiftsFilters,
    EmployeePicker: window.ManagerShiftsEmployeePicker,
    Sidebar: window.ManagerShiftsSidebar,
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

  const { Config, Filters, EmployeePicker, Sidebar, Calendar, PositionPalette, Modal, Layout } = modules;

  let managerCurrentShifts = [];

  function initManagerShifts() {
    const page = Config.getEl('managerShiftPage');
    if (!page) {
      console.error('[ManagerShifts] managerShiftPage element not found');
      return;
    }

    const pageData = page.dataset;

    Layout.wireStickyOffsets();

    window.addEventListener('pageshow', (e) => {
      if (e.persisted) window.location.reload();
    });

    const config = {
      view: pageData.view,
      anchor: pageData.anchor,
      start: pageData.start,
      today: pageData.today,
    };

    const shifts = parseJsonScript('managerShiftsData', []);
    managerCurrentShifts = Array.isArray(shifts) ? shifts : [];
    EmployeePicker.setManagerCurrentShifts(managerCurrentShifts);
    
    const employees = parseJsonScript('managerEmployeesData', []);
    Sidebar.setManagerEmployees(Array.isArray(employees) ? employees : []);
    Sidebar.computeEmployeePeriodStats(managerCurrentShifts);
    
    const formState = parseJsonScript('shiftFormState', null);

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

    Calendar.wireCalendarClicks('weekGrid');
    Calendar.wireCalendarClicks('monthGrid');

    if (config.view === 'month') {
      Calendar.renderMonthGrid(config, shifts);
    } else {
      Calendar.renderWeekGrid(config, shifts);
    }

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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initManagerShifts);
  } else {
    initManagerShifts();
  }
})();
