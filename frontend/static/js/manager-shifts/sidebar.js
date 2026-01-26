/**
 * MANAGER SHIFTS - Employee Sidebar
 * Employee list with search, filter, sort, and shift highlighting
 */

(function() {
  'use strict';

  const Config = window.ManagerShiftsConfig || {};
const Time = window.ManagerShiftsTime || {};
const RolePalette = window.ManagerShiftsRolePalette || {};
const { getEl, initialsFromName } = Config;
const { parseTimeToMinutes, formatHoursCompact } = Time;
const { applyRolePaletteToElement } = RolePalette;

// State
let managerEmployees = [];
let managerEmployeePeriodStats = {
  minutesByEmployeeId: new Map(),
  shiftIdsByEmployeeId: new Map()
};
let activeEmployeeHighlightId = null;
let employeeSidebarControlsWired = false;

function setManagerEmployees(employees) {
  managerEmployees = employees;
}

function computeEmployeePeriodStats(shifts) {
  const minutesByEmployeeId = new Map();
  const shiftIdsByEmployeeId = new Map();

  (Array.isArray(shifts) ? shifts : []).forEach((s) => {
    if (!s) return;
    const shiftId = String(s.id ?? '');
    if (!shiftId) return;

    const durationMinutes = Math.max(0, parseTimeToMinutes(s.end_time) - parseTimeToMinutes(s.start_time));
    const assignedIds = Array.isArray(s.assigned_employee_ids) ? s.assigned_employee_ids : [];

    assignedIds.forEach((eid) => {
      const employeeId = String(eid ?? '');
      if (!employeeId) return;

      minutesByEmployeeId.set(employeeId, (minutesByEmployeeId.get(employeeId) || 0) + durationMinutes);
      if (!shiftIdsByEmployeeId.has(employeeId)) shiftIdsByEmployeeId.set(employeeId, new Set());
      shiftIdsByEmployeeId.get(employeeId).add(shiftId);
    });
  });

  managerEmployeePeriodStats = { minutesByEmployeeId, shiftIdsByEmployeeId };
  return managerEmployeePeriodStats;
}

function syncEmployeeSidebarActiveState() {
  const list = getEl('employeeSidebarList');
  if (!list) return;

  for (const row of list.querySelectorAll('.employee-sidebar-item')) {
    const id = row.dataset.employeeId || '';
    const active = !!activeEmployeeHighlightId && id === String(activeEmployeeHighlightId);
    row.classList.toggle('active', active);

    const btn = row.querySelector('.employee-highlight-btn');
    if (btn) {
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    }
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

  getEl('employeeSidebarSearch')?.addEventListener('input', renderEmployeeSidebar);
  getEl('employeeSidebarPosition')?.addEventListener('change', renderEmployeeSidebar);
  getEl('employeeSidebarSort')?.addEventListener('change', renderEmployeeSidebar);
}

function renderEmployeeSidebar() {
  const sidebar = getEl('managerEmployeeSidebar');
  const list = getEl('employeeSidebarList');
  if (!sidebar || !list) return;

  const query = (getEl('employeeSidebarSearch')?.value || '').trim().toLowerCase();
  const filterPosition = getEl('employeeSidebarPosition')?.value || '';
  const sortMode = getEl('employeeSidebarSort')?.value || 'hours_asc';

  const minutesById = managerEmployeePeriodStats?.minutesByEmployeeId || new Map();

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
      return {
        ...e,
        _id: id,
        _name: name,
        _minutes: minutesById.get(id) || 0,
        _search: `${name} ${String(e.position || '')}`.trim().toLowerCase(),
      };
    })
    .filter((e) => {
      if (!query) return true;
      return e._search.includes(query);
    });

  if (sortMode === 'hours_asc') {
    enriched.sort(
      (a, b) =>
        a._minutes - b._minutes ||
        a._name.localeCompare(b._name) ||
        String(a._id).localeCompare(String(b._id)),
    );
  } else {
    enriched.sort((a, b) => a._name.localeCompare(b._name) || String(a._id).localeCompare(String(b._id)));
  }

  const meta = getEl('employeeSidebarMeta');
  if (meta) {
    const total = Array.isArray(managerEmployees) ? managerEmployees.length : 0;
    meta.textContent = total ? `${enriched.length}/${total}` : '';
  }

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
    row.setAttribute('role', 'listitem');
    row.dataset.employeeId = e._id;
    if (e.position_id !== null && e.position_id !== undefined) row.dataset.positionId = String(e.position_id);

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
    if (e.position_id) applyRolePaletteToElement(badge, e.position_id);

    const hours = document.createElement('span');
    hours.className = 'employee-sidebar-hours';
    hours.textContent = formatHoursCompact(e._minutes);

    sub.appendChild(badge);
    sub.appendChild(hours);
    metaDiv.appendChild(name);
    metaDiv.appendChild(sub);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-outline btn-icon employee-highlight-btn';
    btn.setAttribute('aria-label', `Highlight shifts for ${e._name || 'employee'}`);
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"></circle>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    `;
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      toggleEmployeeHighlight(e._id);
    });

    row.appendChild(avatar);
    row.appendChild(metaDiv);
    row.appendChild(btn);
    frag.appendChild(row);
  });

  list.appendChild(frag);
  syncEmployeeSidebarActiveState();
}

window.ManagerShiftsSidebar = {
  setManagerEmployees,
  computeEmployeePeriodStats,
  applyEmployeeShiftHighlight,
  toggleEmployeeHighlight,
  wireEmployeeSidebarControls,
  renderEmployeeSidebar,
};

})();
