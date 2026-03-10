const getById = window.getById || ((id) => document.getElementById(id));

function getPageData() {
  const page = getById('managerEmployeesPage');
  return page ? page.dataset : null;
}

function closeAllDropdowns() {
  for (const m of document.querySelectorAll('.dropdown-menu')) m.classList.remove('open');
}

function openWithDropdownClose(modalId) {
  closeAllDropdowns();
  openModal(modalId);
}

let pendingDelete = null;
let pendingResetUrl = null;

function openEditEmployee(userId) {
  closeAllDropdowns();

  const pageData = getPageData();
  const updateUrlTemplate = pageData ? pageData.employeeUpdateUrlTemplate : '';
  const form = getById('editEmployeeForm');
  const row = document.querySelector(`.employee-row[data-user-id="${userId}"]`);
  if (!updateUrlTemplate || !form || !row) {
    showToast('error', 'Error', 'Could not open employee.');
    return;
  }

  form.action = urlFromTemplate(updateUrlTemplate, userId);

  const nameInput = getById('editFullName');
  if (nameInput) nameInput.value = (row.dataset.fullName || '').trim();

  const emailInput = getById('editEmail');
  if (emailInput) emailInput.value = row.dataset.email || '';

  const positionInput = getById('editPosition');
  if (positionInput) positionInput.value = row.dataset.position || '';

  openModal('editEmployeeModal');
}

function openDeleteEmployee(userId, employeeId, email) {
  pendingDelete = {
    userId: userId,
    employeeId: employeeId || '',
    email: email || '',
  };

  const label = getById('deleteEmployeeLabel');
  if (label) {
    label.textContent = `${pendingDelete.employeeId} (${pendingDelete.email})`.trim();
  }

  openWithDropdownClose('deleteEmployeeModal');
}

function cancelDeleteEmployee() {
  pendingDelete = null;
  closeModal('deleteEmployeeModal');
}

function confirmDeleteEmployee() {
  const url = getPageData()?.employeeDeleteUrlTemplate || '';
  const form = getById('deleteEmployeeForm');

  if (!url || !form || !pendingDelete || !pendingDelete.userId) return;

  form.action = urlFromTemplate(url, pendingDelete.userId);
  pendingDelete = null;
  form.submit();
}

function openResetPassword(employeeId, login, url) {
  pendingResetUrl = url;

  const label = getById('resetEmployeeLabel');
  if (label) {
    label.textContent = `${employeeId} (${login})`;
  }

  openWithDropdownClose('resetPasswordModal');
}

function cancelResetPassword() {
  pendingResetUrl = null;
  closeModal('resetPasswordModal');
}

function confirmResetPassword() {
  const form = getById('resetPasswordForm');
  if (!form || !pendingResetUrl) return;

  form.action = pendingResetUrl;
  form.submit();
}

function wireTemplateActions() {
  document.addEventListener('click', function (event) {
    const actionEl = event.target.closest('[data-action]');
    if (!actionEl) return;

    const action = actionEl.dataset.action || '';
    if (!action) return;

    if (action === 'open-modal') {
      const modalId = actionEl.dataset.modalId || '';
      if (modalId) openWithDropdownClose(modalId);
      return;
    }

    if (action === 'close-modal') {
      const modalId = actionEl.dataset.modalId || '';
      if (modalId) closeModal(modalId);
      return;
    }

    if (action === 'toggle-dropdown') {
      toggleDropdown(actionEl);
      return;
    }

    if (action === 'edit-employee') {
      const userId = parseInt(actionEl.dataset.userId || '', 10);
      if (Number.isFinite(userId)) openEditEmployee(userId);
      return;
    }

    if (action === 'reset-password') {
      openResetPassword(
        actionEl.dataset.employeeId || '',
        actionEl.dataset.login || '',
        actionEl.dataset.url || '',
      );
      return;
    }

    if (action === 'delete-employee') {
      const userId = parseInt(actionEl.dataset.userId || '', 10);
      if (Number.isFinite(userId)) {
        openDeleteEmployee(userId, actionEl.dataset.employeeId || '', actionEl.dataset.email || '');
      }
      return;
    }

    if (action === 'copy-text') {
      const targetId = actionEl.dataset.copyTarget || '';
      if (targetId) copyText(targetId);
    }
  });

  document.addEventListener('submit', function (event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    const question = form.dataset.confirm;
    if (!question) return;

    if (!window.confirm(question)) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireTemplateActions);
} else {
  wireTemplateActions();
}
