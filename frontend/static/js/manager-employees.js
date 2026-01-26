/**
 * Manager Employees Page
 * Employee CRUD, role management, and filtering
 */
const ROLE_SELECT_IDS = ['roleFilter', 'addRole', 'editRole'];

// Use global getById from app.js
const getById = window.getById || ((id) => document.getElementById(id));

function getPageData() {
  const page = getById('managerEmployeesPage');
  return page ? page.dataset : null;
}

function closeAllDropdowns() {
  const menus = document.querySelectorAll('.dropdown-menu');
  for (let i = 0; i < menus.length; i++) {
    menus[i].classList.remove('open');
  }
}

function openWithDropdownClose(modalId) {
  closeAllDropdowns();
  openModal(modalId);
}

function cancelAndClose(modalId, cleanup) {
  if (cleanup) cleanup();
  closeModal(modalId);
}

// Filtering
function applyFilters() {
  let searchInput = getById('employeeSearch');
  let roleSelect = getById('roleFilter');

  let query = searchInput ? (searchInput.value || '').trim().toLowerCase() : '';
  let role = roleSelect ? (roleSelect.value || 'all') : 'all';

  let rows = document.querySelectorAll('.employee-row');
  for (let i = 0; i < rows.length; i++) {
    let row = rows[i];
    let matchesRole = (role === 'all' || row.dataset.role === role);
    let matchesSearch = !query || row.innerText.toLowerCase().indexOf(query) >= 0;
    row.style.display = (matchesRole && matchesSearch) ? '' : 'none';
  }
}

// Global alias for HTML onclick handlers
window.applyEmployeeFilters = applyFilters;

function updateRoleFilterLabel() {
  let label = getById('roleFilterMultiLabel');
  if (!label) return;

  let checked = document.querySelector('#roleFilterMulti input[name="employeeRoleChoice"]:checked');

  if (!checked || checked.value === 'all' || checked.value === '') {
    label.textContent = 'All';
  } else {
    let parent = checked.parentElement;
    label.textContent = parent ? (parent.textContent || '').trim() : 'Role';
  }
}

function setRoleFilter(value) {
  let select = getById('roleFilter');
  if (select) {
    select.value = value || 'all';
  }
  updateRoleFilterLabel();
  applyFilters();

  if (window.closeAllMultiselects) {
    window.closeAllMultiselects();
  }
}

// Form validation
let currentEditId = null;
let pendingDelete = null;

function countDigits(value) {
  let matches = String(value || '').match(/\d/g);
  return matches ? matches.length : 0;
}

function setFieldError(inputId, errorId, message) {
  let input = getById(inputId);
  let errorEl = getById(errorId);

  if (input) {
    input.classList.toggle('form-error', !!message);
  }
  if (errorEl) {
    errorEl.textContent = message || '';
    errorEl.classList.toggle('hidden', !message);
  }
}

function validateEmployeeForm(prefix) {
  let errors = {};
  let fields = ['FullName', 'Email', 'Phone', 'Role'];

  // Clear previous errors
  for (let i = 0; i < fields.length; i++) {
    setFieldError(prefix + fields[i], prefix + fields[i] + 'Error', null);
  }

  // Get values
  let nameInput = getById(prefix + 'FullName');
  let emailInput = getById(prefix + 'Email');
  let phoneInput = getById(prefix + 'Phone');
  let roleInput = getById(prefix + 'Role');

  let name = nameInput ? nameInput.value.trim() : '';
  let email = emailInput ? emailInput.value.trim() : '';
  let phone = phoneInput ? phoneInput.value.trim() : '';
  let role = roleInput ? roleInput.value : '';

  // Validate
  if (!name) {
    errors.FullName = 'Full name is required.';
  }

  if (!email) {
    errors.Email = 'Email is required.';
  } else if (emailInput && !emailInput.checkValidity()) {
    errors.Email = 'Enter a valid email address.';
  }

  if (!phone) {
    errors.Phone = 'Phone is required.';
  } else if (countDigits(phone) < 7) {
    errors.Phone = 'Enter a valid phone number.';
  }

  if (!role) {
    errors.Role = 'Role is required.';
  }

  // Show errors
  for (let field in errors) {
    setFieldError(prefix + field, prefix + field + 'Error', errors[field]);
  }

  return Object.keys(errors).length === 0;
}

// Employee editing
async function openEditEmployee(userId) {
  let pageData = getPageData();
  let url = pageData ? pageData.employeeDetailsUrlTemplate : null;
  if (!url) return;

  closeAllDropdowns();

  try {
    let response = await fetch(urlFromTemplate(url, userId), {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      throw new Error('Failed to load employee.');
    }

    let data = await response.json();

    currentEditId = userId;

    let userIdInput = getById('editUserId');
    if (userIdInput) userIdInput.value = userId;

    let fullName = ((data.first_name || '') + ' ' + (data.last_name || '')).trim();
    let nameInput = getById('editFullName');
    if (nameInput) nameInput.value = fullName;

    let emailInput = getById('editEmail');
    if (emailInput) emailInput.value = data.email || '';

    let phoneInput = getById('editPhone');
    if (phoneInput) phoneInput.value = data.phone || '';

    let roleInput = getById('editRole');
    if (roleInput) roleInput.value = data.position_id != null ? data.position_id : '';

    validateEmployeeForm('edit');
    openModal('editEmployeeModal');
  } catch (error) {
    showToast('error', 'Error', error.message || 'Could not open employee.');
  }
}

function openDeleteEmployee(userId, employeeId, email) {
  pendingDelete = {
    userId: userId,
    employeeId: employeeId || '',
    email: email || ''
  };

  let label = getById('deleteEmployeeLabel');
  if (label) {
    label.textContent = (pendingDelete.employeeId + ' (' + pendingDelete.email + ')').trim();
  }

  openWithDropdownClose('deleteEmployeeModal');
}

function cancelDeleteEmployee() {
  cancelAndClose('deleteEmployeeModal', function () {
    pendingDelete = null;
  });
}

function confirmDeleteEmployee() {
  let pageData = getPageData();
  let url = pageData ? pageData.employeeDeleteUrlTemplate : null;
  let form = getById('deleteEmployeeForm');

  if (!url || !form || !pendingDelete || !pendingDelete.userId) return;

  form.action = urlFromTemplate(url, pendingDelete.userId);
  pendingDelete = null;
  form.submit();
}

async function saveEmployeeEdits() {
  let pageData = getPageData();
  let url = pageData ? pageData.employeeUpdateUrlTemplate : null;

  if (!url || !currentEditId) return;
  if (!validateEmployeeForm('edit')) return;

  function getValue(id) {
    let input = getById(id);
    return input ? input.value.trim() : '';
  }

  try {
    let payload = await postFormJson(urlFromTemplate(url, currentEditId), {
      full_name: getValue('editFullName'),
      email: getValue('editEmail'),
      phone: getValue('editPhone'),
      position: getValue('editRole')
    });

    let employee = payload.employee;
    if (!employee) {
      throw new Error('Update failed.');
    }

    // Update table row
    let row = document.querySelector('.employee-row[data-user-id="' + employee.id + '"]');
    if (row) {
      row.dataset.role = employee.position_id != null ? employee.position_id : '';

      let cells = row.querySelectorAll('td');
      if (cells[2]) cells[2].textContent = employee.full_name || '';

      if (cells[3]) {
        if (employee.position) {
          cells[3].innerHTML = '<span class="badge badge-default">' + employee.position + '</span>';
        } else {
          cells[3].innerHTML = '<span class="text-sm text-muted">—</span>';
        }
      }

      if (cells[4]) cells[4].textContent = employee.email || '';
      if (cells[5]) cells[5].textContent = employee.phone || '—';
    }

    closeModal('editEmployeeModal');
    applyFilters();
    showToast('success', 'Employee updated', 'Saved.');
  } catch (error) {
    showToast('error', 'Could not update employee', error.message || 'Could not save changes.');
  }
}

// Password reset
let pendingResetUrl = null;

function openResetPassword(employeeId, login, url) {
  pendingResetUrl = url;

  let label = getById('resetEmployeeLabel');
  if (label) {
    label.textContent = employeeId + ' (' + login + ')';
  }

  openWithDropdownClose('resetPasswordModal');
}

function cancelResetPassword() {
  cancelAndClose('resetPasswordModal', function () {
    pendingResetUrl = null;
  });
}

function confirmResetPassword() {
  let form = getById('resetPasswordForm');
  if (!form || !pendingResetUrl) return;

  form.action = pendingResetUrl;
  form.submit();
}

// Role management helpers
function updateRoleSelects(roleId, roleName) {
  let roleIdStr = String(roleId);

  for (let i = 0; i < ROLE_SELECT_IDS.length; i++) {
    let selectId = ROLE_SELECT_IDS[i];
    let select = getById(selectId);
    if (!select) continue;

    let existingOption = select.querySelector('option[value="' + roleIdStr + '"]');

    if (roleName === null) {
      // Remove option
      if (existingOption) {
        existingOption.remove();
      }
    } else {
      // Add or update option
      if (!existingOption) {
        existingOption = document.createElement('option');
        existingOption.value = roleIdStr;
        select.appendChild(existingOption);
      }
      existingOption.textContent = roleName;
    }
  }
}

async function addRole() {
  let pageData = getPageData();
  let url = pageData ? pageData.positionCreateUrl : null;
  if (!url) return;

  let nameInput = getById('newRoleName');
  let name = nameInput ? nameInput.value.trim() : '';

  if (!name) {
    showToast('error', 'Role name required', 'Please enter a role name.');
    return;
  }

  try {
    let result = await postFormJson(url, { name: name, is_active: 'on' });
    let roleId = result.id;

    // Add table row
    let row = document.createElement('tr');
    row.dataset.positionId = roleId;
    row.innerHTML = '<td class="role-name"></td>' +
      '<td class="role-actions-cell">' +
      '<button class="btn btn-outline btn-sm" type="button" onclick="renameRole(this)">Rename</button>' +
      '<button class="btn btn-ghost btn-icon" type="button" onclick="deleteRole(this)" aria-label="Delete role" title="Delete" style="color:var(--destructive)">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>' +
      '</svg></button></td>';

    let nameCell = row.querySelector('.role-name');
    if (nameCell) nameCell.textContent = name;

    let tbody = getById('roleTbody');
    if (tbody) tbody.appendChild(row);

    updateRoleSelects(roleId, name);

    if (nameInput) nameInput.value = '';

    showToast('success', 'Role added', name + ' added.');
  } catch (error) {
    showToast('error', 'Could not add role', error.message);
  }
}

async function renameRole(button) {
  let pageData = getPageData();
  let url = pageData ? pageData.positionUpdateUrlTemplate : null;
  if (!url) return;

  let row = button.closest('tr');
  let roleId = row ? row.dataset.positionId : null;
  let nameCell = row ? row.querySelector('.role-name') : null;
  let currentName = nameCell ? nameCell.textContent : '';

  let newName = prompt('Rename role:', currentName);
  if (!newName || !roleId) return;

  try {
    await postFormJson(urlFromTemplate(url, roleId), {
      name: newName,
      is_active: 'on'
    });

    if (nameCell) nameCell.textContent = newName;
    updateRoleSelects(roleId, newName);

    showToast('success', 'Role renamed', 'Updated.');
  } catch (error) {
    showToast('error', 'Could not rename role', error.message);
  }
}

let pendingRoleDelete = null;

function deleteRole(button) {
  let row = button.closest('tr');
  let roleId = row ? row.dataset.positionId : null;
  let nameCell = row ? row.querySelector('.role-name') : null;
  let roleName = nameCell ? nameCell.textContent : 'Role';

  if (!roleId) return;

  pendingRoleDelete = {
    roleId: roleId,
    roleName: roleName,
    row: row
  };

  let nameEl = getById('deleteRoleName');
  if (nameEl) nameEl.textContent = roleName;

  openModal('deleteRoleModal');
}

function cancelDeleteRole() {
  cancelAndClose('deleteRoleModal', function () {
    pendingRoleDelete = null;
  });
}

async function confirmDeleteRole() {
  let pageData = getPageData();
  let url = pageData ? pageData.positionDeleteUrlTemplate : null;

  if (!url || !pendingRoleDelete || !pendingRoleDelete.roleId) return;

  try {
    await postFormJson(urlFromTemplate(url, pendingRoleDelete.roleId), {});

    // Remove table row
    if (pendingRoleDelete.row) {
      pendingRoleDelete.row.remove();
    }

    // Update selects
    updateRoleSelects(pendingRoleDelete.roleId, null);

    // Remove from filter multiselect
    let escapedId = pendingRoleDelete.roleId.replace(/["\\]/g, '\\$&');
    let radio = document.querySelector('#roleFilterMulti input[name="employeeRoleChoice"][value="' + escapedId + '"]');

    if (radio) {
      let radioLabel = radio.closest('label');
      if (radioLabel) radioLabel.remove();

      if (radio.checked) {
        setRoleFilter('all');
      } else {
        updateRoleFilterLabel();
      }
    }

    pendingRoleDelete = null;
    closeModal('deleteRoleModal');
    showToast('success', 'Role deleted', 'Deleted.');
  } catch (error) {
    showToast('error', 'Cannot delete role', error.message);
  }
}

// Event binding helper
function bindOnce(element, key, setupFn) {
  if (!element || element.dataset[key]) return;
  element.dataset[key] = '1';
  setupFn(element);
}

// Initialize
function init() {
  updateRoleFilterLabel();
  applyFilters();

  // Wire add employee form validation
  bindOnce(getById('addEmployeeForm'), 'validated', function (form) {
    form.addEventListener('submit', function (event) {
      if (!validateEmployeeForm('add')) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
  });

  // Wire new role input enter key
  bindOnce(getById('newRoleName'), 'enterWired', function (input) {
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        addRole();
      }
    });
  });

  // Wire delete role modal backdrop click
  bindOnce(getById('deleteRoleModal'), 'backdropWired', function (modal) {
    modal.addEventListener('click', function (event) {
      if (event.target === modal) {
        pendingRoleDelete = null;
      }
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
