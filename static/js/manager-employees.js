// === Constants ===
const ROLE_SELECT_IDS = ['roleFilter', 'addRole', 'editRole'];

// === Helpers ===
function getPageData() {
  return document.getElementById('managerEmployeesPage')?.dataset;
}

function closeDropdowns() {
  for (const m of document.querySelectorAll('.dropdown-menu')) m.classList.remove('open');
}

function openModalWithDropdownClose(modalId) {
  closeDropdowns();
  openModal(modalId);
}

function cancelModal(modalId, clearFn) {
  clearFn?.();
  closeModal(modalId);
}

// === Filtering (client-side) ===
function applyEmployeeFilters() {
  const q = (document.getElementById('employeeSearch')?.value || '').trim().toLowerCase();
  const role = document.getElementById('roleFilter')?.value || 'all';

  for (const row of document.querySelectorAll('.employee-row')) {
    const roleOk = role === 'all' || row.dataset.role === role;
    const qOk = !q || row.innerText.toLowerCase().includes(q);
    row.style.display = roleOk && qOk ? '' : 'none';
  }
}

function updateRoleFilterMultiLabel() {
  const label = document.getElementById('roleFilterMultiLabel');
  if (!label) return;

  const checked = document.querySelector('#roleFilterMulti input[name="employeeRoleChoice"]:checked');
  if (!checked || checked.value === 'all' || checked.value === '') {
    label.textContent = 'All';
  } else {
    label.textContent = checked.parentElement?.textContent?.trim() || 'Role';
  }
}

function setEmployeeRoleFilter(value) {
  const select = document.getElementById('roleFilter');
  if (select) select.value = value || 'all';
  updateRoleFilterMultiLabel();
  applyEmployeeFilters();
  window.closeAllMultiselects?.();
}

let editTargetUserId = null;
let pendingEmployeeDelete = null;

function digitsCount(value) {
  return (String(value || '').match(/\d/g) || []).length;
}

function setFieldError(inputId, errorId, message) {
  const input = document.getElementById(inputId);
  const err = document.getElementById(errorId);
  const hasError = !!message;
  input?.classList.toggle('form-error', hasError);
  if (err) {
    err.textContent = message || '';
    err.classList.toggle('hidden', !hasError);
  }
}

function validateEmployeeFields(prefix) {
  const fields = ['FullName', 'Email', 'Phone', 'Role'];
  const errors = {};

  // Clear all first
  for (const f of fields) setFieldError(`${prefix}${f}`, `${prefix}${f}Error`, null);

  const fullName = document.getElementById(`${prefix}FullName`)?.value.trim();
  const emailEl = document.getElementById(`${prefix}Email`);
  const email = emailEl?.value.trim();
  const phone = document.getElementById(`${prefix}Phone`)?.value.trim();
  const role = document.getElementById(`${prefix}Role`)?.value;

  if (!fullName) errors.FullName = 'Full name is required.';
  if (!email) errors.Email = 'Email is required.';
  else if (emailEl && !emailEl.checkValidity()) errors.Email = 'Enter a valid email address.';
  if (!phone) errors.Phone = 'Phone is required.';
  else if (digitsCount(phone) < 7) errors.Phone = 'Enter a valid phone number.';
  if (!role) errors.Role = 'Role is required.';

  for (const [f, msg] of Object.entries(errors)) {
    setFieldError(`${prefix}${f}`, `${prefix}${f}Error`, msg);
  }

  return Object.keys(errors).length === 0;
}

// === View/Edit ===
async function openEditEmployee(userId) {
  const url = getPageData()?.employeeDetailsUrlTemplate;
  if (!url) return;

  closeDropdowns();
  try {
    const res = await fetch(urlFromTemplate(url, userId), { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('Failed to load employee.');
    const data = await res.json().catch(() => ({}));

    editTargetUserId = userId;
    document.getElementById('editUserId').value = userId;
    document.getElementById('editFullName').value = `${data.first_name || ''} ${data.last_name || ''}`.trim();
    document.getElementById('editEmail').value = data.email || '';
    document.getElementById('editPhone').value = data.phone || '';
    document.getElementById('editRole').value = data.position_id ?? '';

    validateEmployeeFields('edit');
    openModal('editEmployeeModal');
  } catch (e) {
    showToast('error', 'Error', e.message || 'Could not open employee.');
  }
}

function openDeleteEmployee(userId, employeeId, email) {
  pendingEmployeeDelete = { userId, employeeId: employeeId || '', email: email || '' };
  const label = document.getElementById('deleteEmployeeLabel');
  if (label) label.textContent = `${employeeId || ''} (${email || ''})`.trim();
  openModalWithDropdownClose('deleteEmployeeModal');
}

function cancelDeleteEmployee() {
  cancelModal('deleteEmployeeModal', () => { pendingEmployeeDelete = null; });
}

function confirmDeleteEmployee() {
  const url = getPageData()?.employeeDeleteUrlTemplate;
  const form = document.getElementById('deleteEmployeeForm');
  if (!url || !form || !pendingEmployeeDelete?.userId) return;
  form.action = urlFromTemplate(url, pendingEmployeeDelete.userId);
  pendingEmployeeDelete = null;
  form.submit();
}

async function saveEmployeeEdits() {
  const url = getPageData()?.employeeUpdateUrlTemplate;
  if (!url || !editTargetUserId || !validateEmployeeFields('edit')) return;

  const getValue = (id) => document.getElementById(id)?.value.trim() || '';

  try {
    const payload = await postFormJson(urlFromTemplate(url, editTargetUserId), {
      full_name: getValue('editFullName'),
      email: getValue('editEmail'),
      phone: getValue('editPhone'),
      position: getValue('editRole'),
    });
    const emp = payload.employee;
    if (!emp) throw new Error('Update failed.');

    const row = document.querySelector(`.employee-row[data-user-id="${emp.id}"]`);
    if (row) {
      row.dataset.role = emp.position_id ?? '';
      const cells = row.querySelectorAll('td');
      if (cells[2]) cells[2].textContent = emp.full_name || '';
      if (cells[3]) {
        cells[3].innerHTML = emp.position
          ? `<span class="badge badge-default">${emp.position}</span>`
          : '<span class="text-sm text-muted">—</span>';
      }
      if (cells[4]) cells[4].textContent = emp.email || '';
      if (cells[5]) cells[5].textContent = emp.phone || '—';
    }

    closeModal('editEmployeeModal');
    applyEmployeeFilters();
    showToast('success', 'Employee updated', 'Saved.');
  } catch (e) {
    showToast('error', 'Could not update employee', e?.message || 'Could not save changes.');
  }
}

// === Reset password ===
let resetTargetUrl = null;

function openResetPassword(empId, login, url) {
  resetTargetUrl = url;
  const labelEl = document.getElementById('resetEmployeeLabel');
  if (labelEl) labelEl.textContent = `${empId} (${login})`;
  openModalWithDropdownClose('resetPasswordModal');
}

function cancelResetPassword() {
  cancelModal('resetPasswordModal', () => { resetTargetUrl = null; });
}

function confirmResetPassword() {
  const form = document.getElementById('resetPasswordForm');
  if (!form || !resetTargetUrl) return;
  form.action = resetTargetUrl;
  form.submit();
}

// === Roles management (DB-backed) ===
function updateRoleSelects(roleId, roleName) {
  const id = String(roleId);
  for (const selectId of ROLE_SELECT_IDS) {
    const select = document.getElementById(selectId);
    if (!select) continue;

    if (roleName === null) {
      // Remove
      select.querySelector(`option[value="${id}"]`)?.remove();
    } else {
      // Upsert
      let opt = select.querySelector(`option[value="${id}"]`);
      if (!opt) {
        opt = document.createElement('option');
        opt.value = id;
        select.appendChild(opt);
      }
      opt.textContent = roleName;
    }
  }
}

async function addRole() {
  const url = getPageData()?.positionCreateUrl;
  if (!url) return;

  const input = document.getElementById('newRoleName');
  const name = input?.value.trim();
  if (!name) {
    showToast('error', 'Role name required', 'Please enter a role name.');
    return;
  }

  try {
    const { id: roleId } = await postFormJson(url, { name, is_active: 'on' });

    const tr = document.createElement('tr');
    tr.dataset.positionId = roleId;
    tr.innerHTML = `
      <td class="role-name"></td>
      <td class="role-actions-cell">
        <button class="btn btn-outline btn-sm" type="button" onclick="renameRole(this)">Rename</button>
        <button class="btn btn-ghost btn-icon" type="button" onclick="deleteRole(this)" aria-label="Delete role" title="Delete" style="color: var(--destructive);">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 6h18"/>
            <path d="M8 6V4h8v2"/>
            <path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6"/>
            <path d="M14 11v6"/>
          </svg>
        </button>
      </td>
    `;
    tr.querySelector('.role-name').textContent = name;
    document.getElementById('roleTbody')?.appendChild(tr);

    updateRoleSelects(roleId, name);
    if (input) input.value = '';
    showToast('success', 'Role added', `${name} added.`);
  } catch (e) {
    showToast('error', 'Could not add role', e.message);
  }
}

async function renameRole(btn) {
  const url = getPageData()?.positionUpdateUrlTemplate;
  if (!url) return;

  const tr = btn.closest('tr');
  const roleId = tr?.dataset.positionId;
  const current = tr?.querySelector('.role-name')?.textContent || '';
  const next = prompt('Rename role:', current);
  if (!next || !roleId) return;

  try {
    await postFormJson(urlFromTemplate(url, roleId), { name: next, is_active: 'on' });
    tr.querySelector('.role-name').textContent = next;
    updateRoleSelects(roleId, next);
    showToast('success', 'Role renamed', 'Updated.');
  } catch (e) {
    showToast('error', 'Could not rename role', e.message);
  }
}

let pendingRoleDelete = null;

function deleteRole(btn) {
  const tr = btn.closest('tr');
  const roleId = tr?.dataset.positionId;
  const roleName = tr?.querySelector('.role-name')?.textContent || 'Role';
  if (!roleId) return;
  pendingRoleDelete = { roleId, roleName, tr };

  const nameEl = document.getElementById('deleteRoleName');
  if (nameEl) nameEl.textContent = roleName;
  openModal('deleteRoleModal');
}

function cancelDeleteRole() {
  cancelModal('deleteRoleModal', () => { pendingRoleDelete = null; });
}

async function confirmDeleteRole() {
  const url = getPageData()?.positionDeleteUrlTemplate;
  const target = pendingRoleDelete;
  if (!url || !target?.roleId) return;

  try {
    await postFormJson(urlFromTemplate(url, target.roleId), {});
    target.tr?.remove();
    updateRoleSelects(target.roleId, null);

    const esc = CSS?.escape || ((s) => String(s).replace(/["\\]/g, '\\$&'));
    const radio = document.querySelector(`#roleFilterMulti input[name="employeeRoleChoice"][value="${esc(target.roleId)}"]`);
    radio?.closest('label')?.remove();
    radio?.checked ? setEmployeeRoleFilter('all') : updateRoleFilterMultiLabel();

    pendingRoleDelete = null;
    closeModal('deleteRoleModal');
    showToast('success', 'Role deleted', 'Deleted.');
  } catch (e) {
    showToast('error', 'Cannot delete role', e.message);
  }
}

function bindOnce(el, key, setup) {
  if (!el || el.dataset[key]) return;
  el.dataset[key] = '1';
  setup(el);
}

function initManagerEmployees() {
  updateRoleFilterMultiLabel();
  applyEmployeeFilters();

  bindOnce(document.getElementById('addEmployeeForm'), 'validationBound', (form) => {
    form.addEventListener('submit', (e) => {
      if (!validateEmployeeFields('add')) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
  });

  bindOnce(document.getElementById('newRoleName'), 'enterBound', (input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addRole();
      }
    });
  });

  bindOnce(document.getElementById('deleteRoleModal'), 'bound', (modal) => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) pendingRoleDelete = null;
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initManagerEmployees);
} else {
  initManagerEmployees();
}
