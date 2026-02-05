/**
 * MANAGER SHIFTS - Shift Modal & Details
 * Create/edit shift modal and shift details modal functionality
 */

(function() {
  'use strict';

  const Config = window.ManagerShiftsConfig || {};
const Time = window.ManagerShiftsTime || {};
const EmployeePicker = window.ManagerShiftsEmployeePicker || {};
const { getEl, getPageData, pad2, getEmployeeCbs, initialsFromName } = Config;
const { parseTimeToMinutes, formatDurationMinutes, formatDateDMY } = Time;
const { refreshPositionsFromServer, filterEmployeePicker, clearAllEmployeeSelections, updateEmployeeMulti, updateShiftPositionMultiLabel } = EmployeePicker;

// State
let activeShiftId = null;
let activeShiftData = null;

function resetCreateShiftModal() {
  getEl('createShiftTitle').textContent = 'Create Shift';
  getEl('createShiftSubmit').textContent = 'Create Shift';

  const form = getEl('createShiftForm');
  if (form?.dataset.createAction) form.action = form.dataset.createAction;

  const dateInput = getEl('shiftDate');
  if (dateInput) dateInput.value = '';
  const startInput = getEl('shiftStart');
  if (startInput) startInput.value = '09:00';
  const endInput = getEl('shiftEnd');
  if (endInput) endInput.value = '17:00';
  const capInput = getEl('shiftCapacity');
  if (capInput) capInput.value = '1';
  const positionSelect = getEl('shiftPosition');
  if (positionSelect) positionSelect.value = '';
  updateShiftPositionMultiLabel();

  const publish = getEl('publishImmediatelyCustom');
  if (publish) publish.checked = false;

  clearAllEmployeeSelections();
  updateEmployeeMulti();
}

function openCreateShiftModal(dateStr, startTime, endTime) {
  refreshPositionsFromServer();
  resetCreateShiftModal();
  const dateInput = getEl('shiftDate');
  if (dateInput && dateStr) dateInput.value = dateStr;

  const startInput = getEl('shiftStart');
  if (startInput && startTime) startInput.value = startTime;

  const endInput = getEl('shiftEnd');
  if (endInput) {
    if (endTime) endInput.value = endTime;
    else if (startTime) {
      const [h, m] = startTime.split(':').map((x) => parseInt(x, 10));
      endInput.value = `${pad2((Number.isFinite(h) ? h + 1 : 1) % 24)}:${pad2(Number.isFinite(m) ? m : 0)}`;
    }
  }

  filterEmployeePicker();
  updateEmployeeMulti();
  openModal('createShiftModal');
}

function clearCreateShiftErrors() {
  getEl('shiftCapacity')?.classList.remove('form-error');
  getEl('employeeMulti')?.classList.remove('form-error');
  const capErr = getEl('capacityError');
  const empErr = getEl('employeeAssignError');
  if (capErr) { capErr.classList.add('hidden'); capErr.textContent = ''; }
  if (empErr) { empErr.classList.add('hidden'); empErr.textContent = ''; }
}

function wireCreateShiftValidation() {
  const form = getEl('createShiftForm');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    clearCreateShiftErrors();

    const start = getEl('shiftStart')?.value;
    const end = getEl('shiftEnd')?.value;
    if (start && end && start >= end) {
      e.preventDefault();
      showToast('error', 'Invalid time range', 'End time must be after start time.');
      return;
    }

    const capEl = getEl('shiftCapacity');
    const capacity = parseInt(capEl?.value || '0', 10);
    const selected = getEmployeeCbs().filter((cb) => cb.checked).length;
    if (Number.isFinite(capacity) && capacity > 0 && selected > capacity) {
      e.preventDefault();
      capEl?.classList.add('form-error');
      getEl('employeeMulti')?.classList.add('form-error');

      const msg = 'Cannot assign more employees than shift capacity.';
      const capErr = getEl('capacityError');
      const empErr = getEl('employeeAssignError');
      if (capErr) { capErr.textContent = msg; capErr.classList.remove('hidden'); }
      if (empErr) { empErr.textContent = msg; empErr.classList.remove('hidden'); }
    }
  });

  getEl('shiftCapacity')?.addEventListener('input', clearCreateShiftErrors);
  getEl('shiftPosition')?.addEventListener('change', clearCreateShiftErrors);
  getEl('employeeMulti')?.addEventListener('change', clearCreateShiftErrors);
}

function openShiftDetails(shiftId) {
  const template = getPageData()?.shiftDetailsUrlTemplate;
  if (!template) return;
  const url = urlFromTemplate(template, shiftId);

  fetch(url, { headers: { Accept: 'application/json' } })
    .then(async (r) => {
      if (!r.ok) throw new Error(`Failed to load shift (${r.status})`);
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      if (!ct.includes('application/json')) {
        throw new Error('Could not load shift details. Please refresh the page.');
      }
      return r.json();
    })
    .then((data) => {
      activeShiftId = shiftId;
      activeShiftData = data;

      const detailsDate = getEl('detailsDate');
      if (detailsDate) detailsDate.textContent = formatDateDMY(data.date || '');
      const detailsTime = getEl('detailsTime');
      if (detailsTime) detailsTime.textContent = `${data.start_time || ''}-${data.end_time || ''}`;
      const durationMinutes = parseTimeToMinutes(data.end_time) - parseTimeToMinutes(data.start_time);
      const detailsDuration = getEl('detailsDuration');
      if (detailsDuration) detailsDuration.textContent = `Duration: ${formatDurationMinutes(durationMinutes)}`;
      const detailsPosition = getEl('detailsPosition');
      if (detailsPosition) detailsPosition.textContent = data.position || '';
      const detailsCapacity = getEl('detailsCapacity');
      if (detailsCapacity) {
        detailsCapacity.textContent = `Capacity: ${data.assigned_count ?? 0}/${data.capacity ?? 0} filled`;
      }

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
    })
    .catch((err) => {
      showToast('error', 'Error', err.message || 'Could not load shift details.');
    });
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
    const positionId = activeShiftData.position_id ?? activeShiftData.positionId ?? '';
    for (const o of positionSelect.options) o.selected = String(o.value) === String(positionId);
  }
  updateShiftPositionMultiLabel();

  getEl('publishImmediatelyCustom').checked = activeShiftData.status === 'published';

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

// Global exports
window.openCreateShiftModal = openCreateShiftModal;
window.openShiftDetails = openShiftDetails;
window.editShift = editShift;
window.publishShift = publishShift;
window.deleteShift = deleteShift;
window.cancelDeleteShift = cancelDeleteShift;
window.confirmDeleteShift = confirmDeleteShift;

window.ManagerShiftsModal = {
  resetCreateShiftModal,
  openCreateShiftModal,
  clearCreateShiftErrors,
  wireCreateShiftValidation,
  openShiftDetails,
  editShift,
  publishShift,
  deleteShift,
  cancelDeleteShift,
  confirmDeleteShift,
};

})();
