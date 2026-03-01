(function() {
  'use strict';

  const Config = window.ManagerShiftsConfig || {};
const PositionPalette = window.ManagerShiftsPositionPalette || {};
const Time = window.ManagerShiftsTime || {};
const { getEl, initialsFromName } = Config;
const { applyPositionPaletteToElement } = PositionPalette;
const { parseTimeToMinutes } = Time;

let managerEmployees = [];
let managerEmployeePeriodStats = {
  shiftIdsByEmployeeId: new Map(),
  minutesByEmployeeId: new Map(),
};
let activeEmployeeHighlightId = null;
let employeeSidebarControlsWired = false;

function setManagerEmployees(employees) {
  managerEmployees = employees;
}

function computeEmployeePeriodStats(shifts) {
  const shiftIdsByEmployeeId = new Map();
  const minutesByEmployeeId = new Map();

  (Array.isArray(shifts) ? shifts : []).forEach((s) => {
    if (!s) return;
    const shiftId = String(s.id ?? '');
    if (!shiftId) return;

    const duration = Math.max(0, parseTimeToMinutes(s.end_time) - parseTimeToMinutes(s.start_time));
    const assignedIds = Array.isArray(s.assigned_employee_ids) ? s.assigned_employee_ids : [];

    assignedIds.forEach((eid) => {
      const employeeId = String(eid ?? '');
      if (!employeeId) return;

      if (!shiftIdsByEmployeeId.has(employeeId)) shiftIdsByEmployeeId.set(employeeId, new Set());
      shiftIdsByEmployeeId.get(employeeId).add(shiftId);

      minutesByEmployeeId.set(employeeId, (minutesByEmployeeId.get(employeeId) || 0) + duration);
    });
  });

  managerEmployeePeriodStats = { shiftIdsByEmployeeId, minutesByEmployeeId };
  return managerEmployeePeriodStats;
}

function syncEmployeeSidebarActiveState() {
  const list = getEl('employeeSidebarList');
  if (!list) return;

  for (const row of list.querySelectorAll('.employee-sidebar-item')) {
    const id = row.dataset.employeeId || '';
    const active = !!activeEmployeeHighlightId && id === String(activeEmployeeHighlightId);
    row.classList.toggle('active', active);
    row.setAttribute('aria-pressed', String(active));
  }
}

function applyEmployeeShiftHighlight() {
  document.querySelectorAll('.shift-chip.shift-chip-employee-highlight').forEach((el) => {
    el.classList.remove('shift-chip-employee-highlight');
  });

  const activeId = activeEmployeeHighlightId ? String(activeEmployeeHighlightId) : '';
  if (!activeId) return;

  const shiftIds = managerEmployeePeriodStats?.shiftIdsByEmployeeId?.get(activeId);
  if (!shiftIds || !shiftIds.size) return;

  document.querySelectorAll('.shift-chip[data-shift-id]').forEach((chip) => {
    const id = String(chip.dataset.shiftId || '');
    if (!id) return;
    if (shiftIds.has(id)) chip.classList.add('shift-chip-employee-highlight');
  });
}

function toggleEmployeeHighlight(employeeId) {
  const id = String(employeeId || '');
  if (!id) return;
  activeEmployeeHighlightId = activeEmployeeHighlightId === id ? null : id;
  applyEmployeeShiftHighlight();
  syncEmployeeSidebarActiveState();
}

function wireEmployeeSidebarControls() {
  if (employeeSidebarControlsWired) return;
  employeeSidebarControlsWired = true;

  getEl('employeeSidebarPosition')?.addEventListener('change', renderEmployeeSidebar);
}

function renderEmployeeSidebar() {
  const sidebar = getEl('managerEmployeeSidebar');
  const list = getEl('employeeSidebarList');
  if (!sidebar || !list) return;

  const filterPosition = getEl('employeeSidebarPosition')?.value || '';

  const filtered = (Array.isArray(managerEmployees) ? managerEmployees : []).filter((e) => {
    if (!e) return false;
    const positionId = e.position_id ?? e.positionId ?? null;
    if (!filterPosition) return true;
    if (filterPosition === '__none__') return positionId === null || positionId === undefined || String(positionId) === '';
    return String(positionId) === String(filterPosition);
  });

  const enriched = filtered
    .map((e) => {
      const id = String(e.id ?? '');
      const name = String(e.name || '');
      const minutes = managerEmployeePeriodStats?.minutesByEmployeeId?.get(id) || 0;
      return {
        ...e,
        _id: id,
        _name: name,
        _minutes: minutes,
      };
    })
    .sort((a, b) => a._name.localeCompare(b._name) || String(a._id).localeCompare(String(b._id)));

  list.innerHTML = '';
  if (!enriched.length) {
    const empty = document.createElement('div');
    empty.className = 'employee-sidebar-empty text-sm text-muted';
    empty.textContent = 'No employees found.';
    list.appendChild(empty);
    syncEmployeeSidebarActiveState();
    return;
  }

  const frag = document.createDocumentFragment();
  enriched.forEach((e) => {
    const row = document.createElement('div');
    row.className = 'employee-sidebar-item';
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.setAttribute('aria-label', `Highlight shifts for ${e._name || 'employee'}`);
    row.setAttribute('aria-pressed', 'false');
    row.dataset.employeeId = e._id;
    if (e.position_id !== null && e.position_id !== undefined) row.dataset.positionId = String(e.position_id);
    row.addEventListener('click', () => toggleEmployeeHighlight(e._id));
    row.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggleEmployeeHighlight(e._id); } });

    const avatar = document.createElement('div');
    avatar.className = 'employee-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = initialsFromName(e._name);

    const metaDiv = document.createElement('div');
    metaDiv.className = 'employee-sidebar-meta';

    const name = document.createElement('div');
    name.className = 'employee-sidebar-name';
    name.textContent = e._name || 'Employee';

    const sub = document.createElement('div');
    sub.className = 'employee-sidebar-sub';

    const badge = document.createElement('span');
    badge.className = 'badge badge-outline employee-position-badge';
    const positionLabel = String(e.position || '').trim() || 'Unassigned';
    badge.textContent = positionLabel;
    if (e.position_id) applyPositionPaletteToElement(badge, e.position_id);

    sub.appendChild(badge);
    if (e._minutes > 0) {
      const hours = document.createElement('span');
      hours.className = 'employee-sidebar-hours';
      const rounded = Math.round((e._minutes / 60) * 10) / 10;
      hours.textContent = `${String(rounded).replace(/\.0$/, '')}h`;
      sub.appendChild(hours);
    }
    metaDiv.appendChild(name);
    metaDiv.appendChild(sub);

    row.appendChild(avatar);
    row.appendChild(metaDiv);
    frag.appendChild(row);
  });

  list.appendChild(frag);
  syncEmployeeSidebarActiveState();
}

window.ManagerShiftsSidebar = {
  setManagerEmployees,
  computeEmployeePeriodStats,
  applyEmployeeShiftHighlight,
  wireEmployeeSidebarControls,
  renderEmployeeSidebar,
};

})();
