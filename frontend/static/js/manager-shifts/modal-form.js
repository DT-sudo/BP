(function() {
  'use strict';

const ManagerShifts = window.ManagerShifts || {};
const Config = ManagerShifts.Config || {};
const Time = ManagerShifts.Time || {};
const EmployeePicker = ManagerShifts.EmployeePicker || {};
const Filters = ManagerShifts.Filters || {};
const { getEl, getPageData, pad2, getEmployeeCbs, initialsFromName } = Config;
const { parseTimeToMinutes, formatDurationMinutes, formatDateDMY } = Time;
const { filterEmployeePicker, clearAllEmployeeSelections, updateEmployeeMulti, updateShiftPositionMultiLabel } = EmployeePicker;

let activeShiftId = null;
let activeShiftData = null;
let templateActionsWired = false;

const st = (id, v) => { const e = getEl(id); if (e) e.textContent = v; };
const sv = (id, v, k = 'value') => { const e = getEl(id); if (e) e[k] = v; };

function resetCreateShiftModal() {
  getEl('createShiftTitle').textContent = 'Create Shift';
  getEl('createShiftSubmit').textContent = 'Create Shift';

  const form = getEl('createShiftForm');
  if (form?.dataset.createAction) form.action = form.dataset.createAction;

  sv('shiftDate', '');
  sv('shiftStart', '09:00');
  sv('shiftEnd', '17:00');
  sv('shiftCapacity', '1');
  sv('shiftPosition', '');
  updateShiftPositionMultiLabel();

  clearAllEmployeeSelections();
  updateEmployeeMulti();
}

function openCreateShiftModal(dateStr, startTime, endTime) {
  resetCreateShiftModal();
  const dateInput = getEl('shiftDate');
  if (dateInput && dateStr) dateInput.value = dateStr;

  const startInput = getEl('shiftStart');
  if (startInput && startTime) startInput.value = startTime;

  const endInput = getEl('shiftEnd');
  if (endInput) {
    if (endTime) endInput.value = endTime;
    else if (startTime) {
      const [h, m] = startTime.split(':').map(Number);
      endInput.value = `${pad2((Number.isFinite(h) ? h + 1 : 1) % 24)}:${pad2(Number.isFinite(m) ? m : 0)}`;
    }
  }

  filterEmployeePicker();
  updateEmployeeMulti();
  openModal('createShiftModal');
}

function wireCreateShiftValidation() {
  const form = getEl('createShiftForm');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    const start = getEl('shiftStart')?.value;
    const end = getEl('shiftEnd')?.value;
    if (start && end && start >= end) {
      e.preventDefault();
      showToast('error', 'Invalid time range', 'End time must be after start time.');
    }
  });
}

function wireTemplateActions() {
  if (templateActionsWired) return;
  templateActionsWired = true;

  document.addEventListener('click', (event) => {
    const actionEl = event.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action || '';
    if (!action) return;

    if (action === 'toggle-multi') {
      const multiId = actionEl.dataset.multiId || '';
      if (multiId) window.toggleMulti?.(multiId);
      return;
    }

    if (action === 'position-clear' || action === 'position-all') {
      Filters.selectAllPositions?.(action === 'position-all');
      Filters.updatePositionMulti?.();
      return;
    }

    if (action === 'open-create-shift') {
      openCreateShiftModal();
      return;
    }

    if (action === 'close-modal') {
      const modalId = actionEl.dataset.modalId || '';
      if (modalId) closeModal(modalId);
      return;
    }

    if (action === 'shift-delete') {
      deleteShift();
      return;
    }

    if (action === 'shift-publish') {
      publishShift();
      return;
    }

    if (action === 'shift-edit') {
      editShift();
      return;
    }

    if (action === 'employees-select-all') {
      EmployeePicker.selectAllEmployees?.(true);
      return;
    }

    if (action === 'employees-clear') {
      EmployeePicker.selectAllEmployees?.(false);
    }
  }, true);

  document.addEventListener('change', (event) => {
    const target = event.target;
    const action = target?.dataset?.action || '';
    if (!action) return;

    if (action === 'switch-view') {
      ManagerShifts.Nav?.switchView?.(target.value);
      return;
    }

    if (action === 'shift-position-change') {
      EmployeePicker.filterEmployeePicker?.();
      return;
    }

    if (action === 'employee-checkbox-change') {
      EmployeePicker.updateEmployeeMulti?.();
    }
  });
}

function _buildShiftDetailsFromState(shiftId) {
  const state = ManagerShifts.State || {};
  const shifts = Array.isArray(state.shifts) ? state.shifts : [];
  const employeesById = state.employeesById || {};

  const shift = shifts.find((s) => String(s?.id) === String(shiftId));
  if (!shift) return null;

  const assignedIds = Array.isArray(shift.assigned_employee_ids) ? shift.assigned_employee_ids : [];
  const assignedEmployees = assignedIds.map((id) => ({
    id,
    name: employeesById[String(id)] || `Employee #${id}`,
  }));

  return {
    id: shift.id,
    date: shift.date,
    start_time: shift.start_time,
    end_time: shift.end_time,
    position_id: shift.position_id,
    position: shift.position || '',
    status: shift.status || 'draft',
    capacity: shift.capacity ?? 0,
    assigned_count: shift.assigned_count ?? assignedEmployees.length,
    assigned_employees: assignedEmployees,
  };
}

function openShiftDetails(shiftId) {
  const data = _buildShiftDetailsFromState(shiftId);
  if (!data) {
    showToast('error', 'Error', 'Could not load shift details.');
    return;
  }

  activeShiftId = shiftId;
  activeShiftData = data;

  st('detailsDate', formatDateDMY(data.date || ''));
  st('detailsTime', `${data.start_time || ''}-${data.end_time || ''}`);
  const durationMinutes = parseTimeToMinutes(data.end_time) - parseTimeToMinutes(data.start_time);
  st('detailsDuration', `Duration: ${formatDurationMinutes(durationMinutes)}`);
  st('detailsPosition', data.position || '');
  st('detailsCapacity', `Capacity: ${data.assigned_count ?? 0}/${data.capacity ?? 0} filled`);

  const statusEl = getEl('detailsStatus');
  if (statusEl) {
    statusEl.textContent = data.status === 'draft' ? 'Draft' : 'Published';
    statusEl.className = 'badge ' + (data.status === 'draft' ? 'badge-outline' : 'badge-success');
  }

  const publishBtn = getEl('publishShiftBtn');
  publishBtn?.classList.toggle('hidden', data.status !== 'draft');

  const list = getEl('detailsEmployees');
  if (list) {
    const assignedEmployees = Array.isArray(data.assigned_employees) ? data.assigned_employees : [];
    list.innerHTML = '';
    if (!assignedEmployees.length) {
      const empty = document.createElement('div');
      empty.className = 'text-sm text-muted';
      empty.textContent = 'No employees assigned.';
      list.appendChild(empty);
    } else {
      for (const e of assignedEmployees) {
        const row = document.createElement('div');
        row.className = 'flex items-center gap-2';
        const initials = initialsFromName(e.name);
        row.innerHTML = `<div class="header-avatar" style="width: 1.5rem; height: 1.5rem; font-size: 0.625rem;">${initials}</div><span class="text-sm">${e.name}</span>`;
        list.appendChild(row);
      }
    }
  }

  openModal('shiftDetailsModal');
}

function editShift() {
  if (!activeShiftData || !activeShiftId) return;

  closeModal('shiftDetailsModal');
  getEl('createShiftTitle').textContent = 'Edit Shift';
  getEl('createShiftSubmit').textContent = 'Save';

  const form = getEl('createShiftForm');
  const updateTpl = getPageData()?.shiftUpdateUrlTemplate;
  if (form && updateTpl) form.action = urlFromTemplate(updateTpl, activeShiftId);

  getEl('shiftDate').value = activeShiftData.date;
  getEl('shiftStart').value = activeShiftData.start_time;
  getEl('shiftEnd').value = activeShiftData.end_time;
  getEl('shiftCapacity').value = String(activeShiftData.capacity);

  const positionSelect = getEl('shiftPosition');
  if (positionSelect) {
    const positionId = activeShiftData.position_id ?? '';
    for (const o of positionSelect.options) o.selected = String(o.value) === String(positionId);
  }
  updateShiftPositionMultiLabel();

  filterEmployeePicker();
  const selectedIds = new Set((activeShiftData.assigned_employees || []).map((e) => String(e.id)));
  for (const cb of getEmployeeCbs()) cb.checked = selectedIds.has(String(cb.value));
  updateEmployeeMulti();
  openModal('createShiftModal');
}

function publishShift() {
  if (!activeShiftId) return;
  const tpl = getPageData()?.shiftPublishUrlTemplate;
  const form = getEl('publishShiftForm');
  if (!tpl || !form) return;
  form.action = urlFromTemplate(tpl, activeShiftId);
  form.submit();
}

function deleteShift() {
  if (!activeShiftId) return;
  const titleEl = getEl('deleteShiftConfirmTitle');
  if (titleEl) {
    const positionName = activeShiftData?.position || '';
    const time = activeShiftData?.start_time && activeShiftData?.end_time
      ? `${activeShiftData.start_time}-${activeShiftData.end_time}` : '';
    titleEl.textContent = [positionName, time, activeShiftData?.date].filter(Boolean).join(' • ') || `#${activeShiftId}`;
  }
  openModal('deleteShiftConfirmModal');
}

function cancelDeleteShift() {
  closeModal('deleteShiftConfirmModal');
}

function confirmDeleteShift() {
  if (!activeShiftId) return;
  const form = getEl('deleteShiftForm');
  const delTpl = getPageData()?.shiftDeleteUrlTemplate;
  if (!form || !delTpl) return;
  form.action = urlFromTemplate(delTpl, activeShiftId);
  form.submit();
}

ManagerShifts.Actions = {
  openCreateShiftModal,
  openShiftDetails,
  editShift,
  publishShift,
  deleteShift,
  cancelDeleteShift,
  confirmDeleteShift,
};

ManagerShifts.Modal = {
  resetCreateShiftModal,
  wireCreateShiftValidation,
  wireTemplateActions,
};

})();


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

  const ManagerShifts = window.ManagerShifts || {};
  const modules = {
    Config: ManagerShifts.Config,
    Filters: ManagerShifts.Filters,
    EmployeePicker: ManagerShifts.EmployeePicker,
    Sidebar: ManagerShifts.Sidebar,
    Calendar: ManagerShifts.Calendar,
    PositionPalette: ManagerShifts.PositionPalette,
    Modal: ManagerShifts.Modal,
    Layout: ManagerShifts.Layout,
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
    
    const employees = parseJsonScript('managerEmployeesData', []);
    const managerEmployees = Array.isArray(employees) ? employees : [];
    const employeesById = {};
    managerEmployees.forEach((employee) => {
      const id = employee?.id;
      if (id === undefined || id === null) return;
      const fullName = String(employee?.name || '').trim();
      employeesById[String(id)] = fullName || `Employee #${id}`;
    });
    ManagerShifts.State = {
      shifts: managerCurrentShifts,
      employeesById,
    };

    Sidebar.setManagerEmployees(managerEmployees);
    Sidebar.computeEmployeePeriodStats(managerCurrentShifts);
    
    Filters.wireManagerFiltersNativeSubmit?.();
    Sidebar.wireEmployeeSidebarControls();
    Sidebar.renderEmployeeSidebar();
    Filters.wireManagerFiltersMultiselectClickThrough();
    EmployeePicker.wireEmployeeChipRemovals();
    EmployeePicker.initEmployeeBuckets();
    Filters.updatePositionMulti();
    EmployeePicker.updateEmployeeMulti();
    EmployeePicker.syncShiftPositionMenuFromSelect?.();
    Modal.wireTemplateActions?.();
    Modal.wireCreateShiftValidation();
    
    Config.getEl('shiftPosition')?.addEventListener('change', EmployeePicker.filterEmployeePicker);
    
    PositionPalette.renderPositionLegend(PositionPalette.collectPositionsFromDom(), managerCurrentShifts);

    Calendar.wireCalendarClicks('weekGrid');
    Calendar.wireCalendarClicks('monthGrid');

    if (config.view === 'month') {
      Calendar.renderMonthGrid(config, shifts);
    } else {
      Calendar.renderWeekGrid(config, shifts);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initManagerShifts);
  } else {
    initManagerShifts();
  }
})();
