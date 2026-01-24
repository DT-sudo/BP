// ---------- Filtering (client-side) ----------
function applyEmployeeFilters() {
  const q = document.getElementById('employeeSearch')?.value.trim().toLowerCase() || '';
  const role = document.getElementById('roleFilter')?.value || 'all';

  document.querySelectorAll('.employee-row').forEach((row) => {
    const text = row.innerText.toLowerCase();
    const roleOk = role === 'all' || String(row.dataset.role) === String(role);
    const qOk = !q || text.includes(q);
    row.style.display = roleOk && qOk ? '' : 'none';
  });
}

function updateRoleFilterMultiLabel() {
  const label = document.getElementById('roleFilterMultiLabel');
  if (!label) return;
  const checked = document.querySelector('#roleFilterMulti input[type="radio"][name="employeeRoleChoice"]:checked');
  if (!checked) {
    label.textContent = 'All';
    return;
  }
  if (checked.value === 'all' || checked.value === '') label.textContent = 'All';
  else label.textContent = (checked.parentElement?.textContent || '').trim() || 'Role';
}

function setEmployeeRoleFilter(value) {
  const select = document.getElementById('roleFilter');
  if (select) select.value = value || 'all';
  updateRoleFilterMultiLabel();
  applyEmployeeFilters();
  window.closeAllMultiselects?.();
}

function getEmployeeConfig() {
  const el = document.getElementById('managerEmployeesPage');
  if (!el) return null;
  return {
    detailsUrlTemplate: el.dataset.employeeDetailsUrlTemplate,
    updateUrlTemplate: el.dataset.employeeUpdateUrlTemplate,
    resetPasswordUrlTemplate: el.dataset.employeeResetPasswordUrlTemplate,
    deleteUrlTemplate: el.dataset.employeeDeleteUrlTemplate,
  };
}

let editTargetUserId = null;
let editTargetEmployeeMeta = null;
let pendingEmployeeDelete = null;

function closeAllRowDropdownMenus() {
  document.querySelectorAll('.dropdown-menu').forEach((m) => m.classList.remove('open'));
}

function digitsCount(value) {
  return (String(value || '').match(/\d/g) || []).length;
}

function clearFieldError(inputId, errorId) {
  const input = document.getElementById(inputId);
  const err = document.getElementById(errorId);
  input?.classList.remove('form-error');
  if (err) {
    err.classList.add('hidden');
    err.textContent = '';
  }
}

function setFieldError(inputId, errorId, message) {
  const input = document.getElementById(inputId);
  const err = document.getElementById(errorId);
  input?.classList.add('form-error');
  if (err) {
    err.textContent = message || 'Required';
    err.classList.remove('hidden');
  }
}

function validateEmployeeFields(prefix) {
  const fullNameId = `${prefix}FullName`;
  const emailId = `${prefix}Email`;
  const phoneId = `${prefix}Phone`;
  const roleId = `${prefix}Role`;

  clearFieldError(fullNameId, `${fullNameId}Error`);
  clearFieldError(emailId, `${emailId}Error`);
  clearFieldError(phoneId, `${phoneId}Error`);
  clearFieldError(roleId, `${roleId}Error`);

  const fullName = document.getElementById(fullNameId)?.value.trim() || '';
  const emailEl = document.getElementById(emailId);
  const email = emailEl?.value.trim() || '';
  const phone = document.getElementById(phoneId)?.value.trim() || '';
  const role = document.getElementById(roleId)?.value || '';

  let ok = true;
  if (!fullName) {
    setFieldError(fullNameId, `${fullNameId}Error`, 'Full name is required.');
    ok = false;
  }

  if (!email) {
    setFieldError(emailId, `${emailId}Error`, 'Email is required.');
    ok = false;
  } else if (emailEl && !emailEl.checkValidity()) {
    setFieldError(emailId, `${emailId}Error`, 'Enter a valid email address.');
    ok = false;
  }

  if (!phone) {
    setFieldError(phoneId, `${phoneId}Error`, 'Phone is required.');
    ok = false;
  } else if (digitsCount(phone) < 7) {
    setFieldError(phoneId, `${phoneId}Error`, 'Enter a valid phone number.');
    ok = false;
  }

  if (!role) {
    setFieldError(roleId, `${roleId}Error`, 'Role is required.');
    ok = false;
  }

  return ok;
}

// ---------- View/Edit ----------
async function openEditEmployee(userId) {
  const cfg = getEmployeeConfig();
  if (!cfg?.detailsUrlTemplate) return;

  try {
    closeAllRowDropdownMenus();
    const res = await fetch(urlFromTemplate(cfg.detailsUrlTemplate, userId), {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error('Failed to load employee.');
    const data = await res.json().catch(() => ({}));

    editTargetUserId = userId;
    editTargetEmployeeMeta = {
      employee_id: data.employee_id || '',
      email: data.email || '',
    };
    document.getElementById('editUserId').value = String(userId);
    document.getElementById('editFullName').value = `${data.first_name || ''} ${data.last_name || ''}`.trim();
    document.getElementById('editEmail').value = data.email || '';
    document.getElementById('editPhone').value = data.phone || '';
    document.getElementById('editRole').value = data.position_id ? String(data.position_id) : '';

    validateEmployeeFields('edit');
    openModal('editEmployeeModal');
  } catch (e) {
    showToast('error', 'Error', e.message || 'Could not open employee.');
  }
}

function openDeleteEmployee(userId, employeeId, email) {
  closeAllRowDropdownMenus();
  pendingEmployeeDelete = { userId, employeeId: employeeId || '', email: email || '' };
  const label = document.getElementById('deleteEmployeeLabel');
  if (label) label.textContent = `${pendingEmployeeDelete.employeeId} (${pendingEmployeeDelete.email})`.trim();
  openModal('deleteEmployeeModal');
}

function cancelDeleteEmployee() {
  pendingEmployeeDelete = null;
  closeModal('deleteEmployeeModal');
}

function confirmDeleteEmployee() {
  const cfg = getEmployeeConfig();
  if (!cfg?.deleteUrlTemplate || !pendingEmployeeDelete?.userId) return;
  const form = document.getElementById('deleteEmployeeForm');
  if (!form) return;
  form.action = urlFromTemplate(cfg.deleteUrlTemplate, pendingEmployeeDelete.userId);
  pendingEmployeeDelete = null;
  form.submit();
}

async function saveEmployeeEdits() {
  const cfg = getEmployeeConfig();
  const userId = editTargetUserId || document.getElementById('editUserId')?.value;
  if (!cfg?.updateUrlTemplate || !userId) return;

  if (!validateEmployeeFields('edit')) return;

  const fullName = document.getElementById('editFullName')?.value.trim() || '';
  const email = document.getElementById('editEmail')?.value.trim() || '';
  const phone = document.getElementById('editPhone')?.value.trim() || '';
  const position = document.getElementById('editRole')?.value || '';

  try {
    const payload = await postForm(urlFromTemplate(cfg.updateUrlTemplate, userId), {
      full_name: fullName,
      email,
      phone,
      position,
    });
    const emp = payload.employee;
    if (!emp) throw new Error('Update failed.');

    const row = document.querySelector(`.employee-row[data-user-id="${emp.id}"]`);
    if (row) {
      row.dataset.role = emp.position_id ? String(emp.position_id) : '';
      const cells = row.querySelectorAll('td');
      if (cells[2]) cells[2].textContent = emp.full_name || '';
      if (cells[3]) {
        if (emp.position) cells[3].innerHTML = `<span class="badge badge-default">${emp.position}</span>`;
        else cells[3].innerHTML = `<span class="text-sm text-muted">—</span>`;
      }
      if (cells[4]) cells[4].textContent = emp.email || '';
      if (cells[5]) cells[5].textContent = emp.phone || '—';
    }

    closeModal('editEmployeeModal');
    applyEmployeeFilters();
    showToast('success', 'Employee updated', 'Saved.');
  } catch (e) {
    const msg =
      typeof e?.message === 'string' && e.message
        ? e.message
        : 'Could not save changes.';
    showToast('error', 'Could not update employee', msg);
  }
}

// ---------- Reset password ----------
let resetTarget = { label: null, url: null };

function openResetPassword(empId, login, url) {
  closeAllRowDropdownMenus();
  resetTarget = { label: `${empId} (${login})`, url };
  const labelEl = document.getElementById('resetEmployeeLabel');
  if (labelEl) labelEl.textContent = resetTarget.label;
  openModal('resetPasswordModal');
}

function cancelResetPassword() {
  resetTarget = { label: null, url: null };
  closeModal('resetPasswordModal');
}

function confirmResetPassword() {
  if (!resetTarget.url) return;
  const form = document.getElementById('resetPasswordForm');
  if (!form) return;
  form.action = resetTarget.url;
  form.submit();
}

// ---------- Roles management (DB-backed) ----------
function getRolesConfig() {
  const el = document.getElementById('managerEmployeesPage');
  if (!el) return null;
  return {
    createUrl: el.dataset.positionCreateUrl,
    updateUrlTemplate: el.dataset.positionUpdateUrlTemplate,
    deleteUrlTemplate: el.dataset.positionDeleteUrlTemplate,
  };
}

function urlFromTemplate(template, id) {
  return template.replace(/\/0\//, `/${id}/`);
}

async function postForm(url, data) {
  const csrf = window.getCsrfToken?.();
  const body = new URLSearchParams(data);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      ...(csrf ? { 'X-CSRFToken': csrf } : {}),
      Accept: 'application/json',
    },
    body,
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const firstFormError =
      payload?.errors && typeof payload.errors === 'object'
        ? Object.values(payload.errors)
            .flat()
            .map((x) => (typeof x === 'string' ? x : x?.message || ''))
            .filter(Boolean)[0]
        : '';
    const msg = payload.error || firstFormError || 'Request failed.';
    throw new Error(msg);
  }
  return payload;
}

function upsertRoleOption(selectId, roleId, roleName) {
  const select = document.getElementById(selectId);
  if (!select) return;
  let opt = Array.from(select.options).find((o) => String(o.value) === String(roleId));
  if (!opt) {
    opt = document.createElement('option');
    opt.value = String(roleId);
    select.appendChild(opt);
  }
  opt.textContent = roleName;
}

function removeRoleOption(selectId, roleId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  Array.from(select.options)
    .filter((o) => String(o.value) === String(roleId))
    .forEach((o) => o.remove());
}

async function addRole() {
  const cfg = getRolesConfig();
  if (!cfg) return;

  const input = document.getElementById('newRoleName');
  const name = input?.value.trim() || '';
  if (!name) {
    showToast('error', 'Role name required', 'Please enter a role name.');
    return;
  }

  try {
    const payload = await postForm(cfg.createUrl, { name, is_active: 'on' });
    const roleId = payload.id;

    const tr = document.createElement('tr');
    tr.dataset.positionId = String(roleId);
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

    upsertRoleOption('roleFilter', roleId, name);
    upsertRoleOption('addRole', roleId, name);
    upsertRoleOption('editRole', roleId, name);

    if (input) input.value = '';
    showToast('success', 'Role added', `${name} added.`);
  } catch (e) {
    showToast('error', 'Could not add role', e.message);
  }
}

async function renameRole(btn) {
  const cfg = getRolesConfig();
  if (!cfg) return;

  const tr = btn.closest('tr');
  const roleId = tr?.dataset.positionId;
  const current = tr?.querySelector('.role-name')?.textContent || '';
  const next = prompt('Rename role:', current);
  if (!next || !roleId) return;

  try {
    await postForm(urlFromTemplate(cfg.updateUrlTemplate, roleId), { name: next, is_active: 'on' });
    tr.querySelector('.role-name').textContent = next;

    upsertRoleOption('roleFilter', roleId, next);
    upsertRoleOption('addRole', roleId, next);
    upsertRoleOption('editRole', roleId, next);
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
  pendingRoleDelete = { roleId: String(roleId), roleName, tr };

  const nameEl = document.getElementById('deleteRoleName');
  if (nameEl) nameEl.textContent = roleName;
  openModal('deleteRoleModal');
}

function cancelDeleteRole() {
  pendingRoleDelete = null;
  closeModal('deleteRoleModal');
}

async function confirmDeleteRole() {
  const cfg = getRolesConfig();
  const target = pendingRoleDelete;
  if (!cfg || !target?.roleId) return;

  try {
    await postForm(urlFromTemplate(cfg.deleteUrlTemplate, target.roleId), {});
    target.tr?.remove();
    removeRoleOption('roleFilter', target.roleId);
    removeRoleOption('addRole', target.roleId);
    removeRoleOption('editRole', target.roleId);

    const esc = window.CSS?.escape ? window.CSS.escape : (s) => String(s).replace(/["\\]/g, '\\$&');
    const deletedRadio = document.querySelector(
      `#roleFilterMulti input[type="radio"][name="employeeRoleChoice"][value="${esc(target.roleId)}"]`,
    );
    const deletedLabel = deletedRadio?.closest?.('label');
    if (deletedLabel) deletedLabel.remove();
    if (deletedRadio?.checked) setEmployeeRoleFilter('all');
    else updateRoleFilterMultiLabel();

    pendingRoleDelete = null;
    closeModal('deleteRoleModal');
    showToast('success', 'Role deleted', 'Deleted.');
  } catch (e) {
    showToast('error', 'Cannot delete role', e.message);
  }
}

function initManagerEmployees() {
  updateRoleFilterMultiLabel();
  applyEmployeeFilters();

  const addForm = document.getElementById('addEmployeeForm');
  if (addForm && !addForm.dataset.validationBound) {
    addForm.dataset.validationBound = '1';
    addForm.addEventListener('submit', (e) => {
      const ok = validateEmployeeFields('add');
      if (!ok) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
  }

  const roleInput = document.getElementById('newRoleName');
  if (roleInput && !roleInput.dataset.enterBound) {
    roleInput.dataset.enterBound = '1';
    roleInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      addRole();
    });
  }

  const deleteModal = document.getElementById('deleteRoleModal');
  if (deleteModal && !deleteModal.dataset.bound) {
    deleteModal.dataset.bound = '1';
    deleteModal.addEventListener('click', (e) => {
      if (e.target === deleteModal) pendingRoleDelete = null;
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initManagerEmployees);
} else {
  initManagerEmployees();
}
