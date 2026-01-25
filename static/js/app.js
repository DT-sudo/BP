(function () {
  // === Cookie & CSRF Utilities ===
  function getCookie(name) {
    for (const cookie of (document.cookie || '').split(';')) {
      const trimmed = cookie.trim();
      if (trimmed.startsWith(`${name}=`)) {
        return decodeURIComponent(trimmed.substring(name.length + 1));
      }
    }
    return null;
  }

  window.getCsrfToken = () =>
    getCookie('csrftoken') ||
    document.querySelector('input[name="csrfmiddlewaretoken"]')?.value ||
    '';

  window.urlFromTemplate = function urlFromTemplate(template, id) {
    const tpl = String(template || '');
    const safeId = String(id ?? '').trim();
    if (!tpl || !safeId) return tpl;
    return tpl.includes('/0/') ? tpl.replace('/0/', `/${safeId}/`) : tpl;
  };

  // === Fetch Utilities ===
  async function parseJsonResponse(res) {
    const payload = await res.json().catch(() => ({}));
    if (res.ok) return payload;

    const firstFormError =
      payload?.errors && typeof payload.errors === 'object'
        ? Object.values(payload.errors)
            .flat()
            .map((x) => (typeof x === 'string' ? x : x?.message || ''))
            .filter(Boolean)[0]
        : '';

    throw new Error(payload.error || firstFormError || 'Request failed.');
  }

  window.postFormJson = async function postFormJson(url, data) {
    const csrf = window.getCsrfToken?.();
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        ...(csrf && { 'X-CSRFToken': csrf }),
        Accept: 'application/json',
      },
      body: new URLSearchParams(data || {}),
    });
    return parseJsonResponse(res);
  };

  // === Toast Notifications ===
  window.showToast = function showToast(type, title, desc) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type || ''}`.trim();
    toast.innerHTML = `
      <div class="toast-dot" aria-hidden="true"></div>
      <div>
        <div class="toast-title">${title || ''}</div>
        ${desc ? `<div class="toast-desc">${desc}</div>` : ''}
      </div>
    `;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), type === 'error' ? 5000 : 3000);
  };

  // === Modal Utilities ===
  function getOverlayZIndex(overlay) {
    const n = parseInt(getComputedStyle(overlay).zIndex, 10);
    return Number.isFinite(n) ? n : 0;
  }

  function getOpenModalOverlays() {
    return [...document.querySelectorAll('.modal-overlay:not(.hidden)')];
  }

  function topModalZIndex() {
    return getOpenModalOverlays().reduce(
      (max, overlay) => Math.max(max, getOverlayZIndex(overlay)),
      5000
    );
  }

  window.openModal = function openModal(modalId) {
    const el = document.getElementById(modalId);
    if (!el) return;
    if (el.classList.contains('modal-overlay')) {
      el.style.zIndex = topModalZIndex() + 1;
    }
    el.classList.remove('hidden');
  };

  window.closeModal = function closeModal(modalId) {
    document.getElementById(modalId)?.classList.add('hidden');
  };

  // === Logout Confirmation ===
  let pendingLogoutHref = null;

  function ensureLogoutConfirmModal() {
    if (document.getElementById('logoutConfirmModal')) return;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay hidden';
    overlay.id = 'logoutConfirmModal';
    overlay.innerHTML = `
      <div class="modal" style="max-width: 480px;">
        <div class="modal-header">
          <h2 class="modal-title">Confirm logout</h2>
          <button class="modal-close" type="button" aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="18" x2="6" y1="6" y2="18"/>
              <line x1="6" x2="18" y1="6" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">
          <p class="text-sm">Are you really want to log out?</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" type="button" id="logoutConfirmNo">No</button>
          <button class="btn btn-primary" type="button" id="logoutConfirmYes">Yes</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const closeLogoutModal = () => {
      pendingLogoutHref = null;
      window.closeModal?.('logoutConfirmModal');
    };

    overlay.querySelector('.modal-close')?.addEventListener('click', closeLogoutModal);
    overlay.querySelector('#logoutConfirmNo')?.addEventListener('click', closeLogoutModal);
    overlay.querySelector('#logoutConfirmYes')?.addEventListener('click', () => {
      const href = pendingLogoutHref;
      pendingLogoutHref = null;
      if (href) window.location.assign(href);
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) pendingLogoutHref = null;
    });
  }

  function wireModalOverlayClose() {
    for (const overlay of document.querySelectorAll('.modal-overlay')) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.add('hidden');
      });
    }
  }

  function wireLogoutConfirm() {
    document.addEventListener('click', (e) => {
      const a = e.target.closest?.('a');
      const href = a?.getAttribute('href');
      if (!href?.includes('/logout')) return;
      e.preventDefault();
      e.stopPropagation();
      pendingLogoutHref = href;
      window.openModal?.('logoutConfirmModal');
    });
  }

  // === Dropdown Utilities ===
  function resetDropdownMenu(menu) {
    if (!menu) return;
    menu.classList.remove('dropdown-menu-fixed');
    menu.style.position = '';
    menu.style.top = '';
    menu.style.left = '';
    menu.style.right = '';
  }

  function cleanupDropdownScroll(dropdown) {
    if (dropdown?._closeOnScroll) {
      window.removeEventListener('scroll', dropdown._closeOnScroll, true);
      dropdown._closeOnScroll = null;
    }
  }

  window.toggleDropdown = function toggleDropdown(button) {
    const dropdown = button.closest?.('.dropdown') || button.parentElement;
    const menu = dropdown?.querySelector('.dropdown-menu');
    if (!menu) return;

    // Close other dropdowns
    for (const m of document.querySelectorAll('.dropdown-menu')) {
      if (m !== menu) m.classList.remove('open');
    }

    const willOpen = !menu.classList.contains('open');
    menu.classList.toggle('open', willOpen);

    if (dropdown.classList.contains('dropdown-fixed')) {
      if (willOpen) {
        const rect = button.getBoundingClientRect();
        const vw = innerWidth || document.documentElement.clientWidth || 0;
        const menuWidth = Math.max(menu.offsetWidth || 0, 160);
        const margin = 8;
        const left = Math.min(Math.max(margin, rect.right - menuWidth), vw - menuWidth - margin);

        menu.classList.add('dropdown-menu-fixed');
        Object.assign(menu.style, {
          position: 'fixed',
          top: `${Math.round(rect.bottom + 6)}px`,
          left: `${Math.round(left)}px`,
          right: 'auto',
        });

        const closeOnScroll = () => menu.classList.contains('open') && menu.classList.remove('open');
        dropdown._closeOnScroll = closeOnScroll;
        addEventListener('scroll', closeOnScroll, true);
      } else {
        resetDropdownMenu(menu);
        cleanupDropdownScroll(dropdown);
      }
    }
  };

  window.toggleUserMenu = window.toggleDropdown;

  // === Multiselect Utilities ===
  function emitMultiselectEvent(type, el, reason = 'programmatic') {
    el && document.dispatchEvent(
      new CustomEvent(type, { detail: { id: el.id || '', el, reason } })
    );
  }

  function setMultiOpenState(el, open, reason = 'programmatic') {
    if (!el) return;
    const action = open ? 'open' : 'close';
    emitMultiselectEvent(`multiselect:will${action}`, el, reason);
    el.classList.toggle('open', open);
    el.querySelector('.multiselect-trigger')?.setAttribute('aria-expanded', String(open));
    emitMultiselectEvent(`multiselect:did${action}`, el, reason);
  }

  window.closeAllMultiselects = function closeAllMultiselects(reason) {
    for (const ms of document.querySelectorAll('.multiselect.open')) {
      setMultiOpenState(ms, false, reason);
    }
  };

  window.toggleMulti = function toggleMulti(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const willOpen = !el.classList.contains('open');
    if (willOpen) window.closeAllMultiselects?.('switch');
    setMultiOpenState(el, willOpen, 'toggle');
  };

  function wireMultiselectAutoClose() {
    document.addEventListener('click', (e) => {
      if (!e.target.closest?.('.multiselect')) window.closeAllMultiselects?.('auto-close');
    });
  }

  function closeTopModalOverlay() {
    const overlays = getOpenModalOverlays();
    if (!overlays.length) return false;
    const top = overlays.reduce((a, b) => (getOverlayZIndex(b) > getOverlayZIndex(a) ? b : a));
    top.classList.add('hidden');
    return true;
  }

  function wireEscapeClose() {
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;

      // Priority: multiselects > modals
      if (document.querySelector('.multiselect.open')) {
        window.closeAllMultiselects?.('escape');
        e.preventDefault();
        return;
      }

      if (closeTopModalOverlay()) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
  }

  function wireDropdownAutoClose() {
    document.addEventListener('click', (e) => {
      if (e.target.closest('.dropdown')) return;
      for (const menu of document.querySelectorAll('.dropdown-menu')) {
        menu.classList.remove('open');
        if (menu.classList.contains('dropdown-menu-fixed')) {
          resetDropdownMenu(menu);
          cleanupDropdownScroll(menu.closest('.dropdown'));
        }
      }
    });
  }

  function wireDjangoMessages() {
    const list = document.getElementById('djangoMessages');
    if (!list) return;

    for (const li of list.querySelectorAll('li')) {
      const level = (li.dataset.level || 'info').split(' ')[0];
      window.showToast?.(level, level.charAt(0).toUpperCase() + level.slice(1), li.dataset.text || '');
    }
    list.remove();
  }

  function wireStickyOffsets() {
    const header = document.querySelector('.header');
    if (!header) return;

    const sync = () => {
      document.documentElement.style.setProperty(
        '--header-sticky-height',
        `${header.getBoundingClientRect().height}px`
      );
    };

    sync();
    addEventListener('load', sync, { once: true });

    let resizeTimer;
    addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(sync, 50);
    });
  }

  window.copyText = async function copyText(elementId) {
    const text = (document.getElementById(elementId)?.textContent || '').trim();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const t = document.createElement('textarea');
      t.value = text;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
  };

  // === Initialization ===
  function init() {
    ensureLogoutConfirmModal();
    wireModalOverlayClose();
    wireEscapeClose();
    wireLogoutConfirm();
    wireDropdownAutoClose();
    wireMultiselectAutoClose();
    wireDjangoMessages();
    wireStickyOffsets();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
