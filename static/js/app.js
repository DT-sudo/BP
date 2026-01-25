(function () {
  function getCookie(name) {
    const cookies = document.cookie ? document.cookie.split(';') : [];
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.startsWith(name + '=')) {
        return decodeURIComponent(cookie.substring(name.length + 1));
      }
    }
    return null;
  }

  window.getCsrfToken = function getCsrfToken() {
    return (
      getCookie('csrftoken') ||
      document.querySelector('input[name="csrfmiddlewaretoken"]')?.value ||
      ''
    );
  };

  window.urlFromTemplate = function urlFromTemplate(template, id) {
    const tpl = String(template || '');
    const safeId = String(id ?? '').trim();
    if (!tpl || !safeId) return tpl;
    if (tpl.includes('/0/')) return tpl.replace(/\/0\//, `/${safeId}/`);
    return tpl;
  };

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

    const msg = payload.error || firstFormError || 'Request failed.';
    throw new Error(msg);
  }

  window.fetchJson = async function fetchJson(url, options) {
    const res = await fetch(url, {
      ...(options || {}),
      headers: {
        Accept: 'application/json',
        ...(options?.headers || {}),
      },
    });
    return parseJsonResponse(res);
  };

  window.postFormJson = async function postFormJson(url, data) {
    const csrf = window.getCsrfToken?.();
    const body = new URLSearchParams(data || {});
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        ...(csrf ? { 'X-CSRFToken': csrf } : {}),
        Accept: 'application/json',
      },
      body,
    });
    return parseJsonResponse(res);
  };

  function getToastContainer() {
    return document.getElementById('toastContainer');
  }

  window.showToast = function showToast(type, title, desc) {
    const container = getToastContainer();
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

  function numericZIndex(value, fallback) {
    const n = parseInt(String(value || ''), 10);
    if (Number.isFinite(n)) return n;
    return fallback;
  }

  function topModalZIndex() {
    let z = 5000;
    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
      if (overlay.classList.contains('hidden')) return;
      z = Math.max(z, numericZIndex(window.getComputedStyle(overlay).zIndex, 0));
    });
    return z;
  }

  window.openModal = function openModal(modalId) {
    const el = document.getElementById(modalId);
    if (!el) return;
    if (el.classList.contains('modal-overlay')) {
      el.style.zIndex = String(topModalZIndex() + 1);
    }
    el.classList.remove('hidden');
  };

  window.closeModal = function closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (!el) return;
    el.classList.add('hidden');
  };

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

    overlay.querySelector('.modal-close')?.addEventListener('click', () => {
      pendingLogoutHref = null;
      window.closeModal?.('logoutConfirmModal');
    });

    overlay.querySelector('#logoutConfirmNo')?.addEventListener('click', () => {
      pendingLogoutHref = null;
      window.closeModal?.('logoutConfirmModal');
    });

    overlay.querySelector('#logoutConfirmYes')?.addEventListener('click', () => {
      const href = pendingLogoutHref;
      pendingLogoutHref = null;
      if (!href) return;
      window.location.assign(href);
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) pendingLogoutHref = null;
    });
  }

  function wireModalOverlayClose() {
    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.add('hidden');
      });
    });
  }

  function wireLogoutConfirm() {
    document.addEventListener('click', (e) => {
      const a = e.target.closest?.('a');
      if (!a) return;
      const href = a.getAttribute('href') || '';
      if (!href) return;
      if (!href.includes('/logout')) return;
      e.preventDefault();
      e.stopPropagation();
      pendingLogoutHref = href;
      window.openModal?.('logoutConfirmModal');
    });
  }

  window.toggleDropdown = function toggleDropdown(button) {
    const dropdown = button.closest ? button.closest('.dropdown') : button.parentElement;
    if (!dropdown) return;

    const menu = dropdown.querySelector('.dropdown-menu');
    if (!menu) return;

    document.querySelectorAll('.dropdown-menu').forEach((m) => {
      if (m !== menu) m.classList.remove('open');
    });

    const willOpen = !menu.classList.contains('open');
    menu.classList.toggle('open', willOpen);

    if (dropdown.classList.contains('dropdown-fixed')) {
      if (willOpen) {
        const rect = button.getBoundingClientRect();
        const vw = window.innerWidth || document.documentElement.clientWidth || 0;
        const menuWidth = Math.max(menu.offsetWidth || 0, 160);
        const margin = 8;
        const left = Math.min(Math.max(margin, rect.right - menuWidth), Math.max(margin, vw - menuWidth - margin));

        menu.classList.add('dropdown-menu-fixed');
        menu.style.position = 'fixed';
        menu.style.top = `${Math.round(rect.bottom + 6)}px`;
        menu.style.left = `${Math.round(left)}px`;
        menu.style.right = 'auto';

        const closeOnScroll = (e) => {
          if (!menu.classList.contains('open')) return;
          menu.classList.remove('open');
        };
        dropdown._closeOnScroll = closeOnScroll;
        window.addEventListener('scroll', closeOnScroll, true);
      } else {
        menu.classList.remove('dropdown-menu-fixed');
        menu.style.position = '';
        menu.style.top = '';
        menu.style.left = '';
        menu.style.right = '';
        if (dropdown._closeOnScroll) {
          window.removeEventListener('scroll', dropdown._closeOnScroll, true);
          dropdown._closeOnScroll = null;
        }
      }
    }
  };

  window.toggleUserMenu = window.toggleDropdown;

  function emitMultiselectEvent(type, el, reason) {
    if (!el) return;
    document.dispatchEvent(
      new CustomEvent(type, {
        detail: {
          id: el.id || '',
          el,
          reason: reason || 'programmatic',
        },
      }),
    );
  }

  function setMultiOpen(el, open) {
    if (!el) return;
    el.classList.toggle('open', open);
    const trigger = el.querySelector('.multiselect-trigger');
    trigger?.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  window.closeAllMultiselects = function closeAllMultiselects(reason) {
    const why = reason || 'programmatic';
    document.querySelectorAll('.multiselect.open').forEach((ms) => {
      emitMultiselectEvent('multiselect:willclose', ms, why);
      setMultiOpen(ms, false);
      emitMultiselectEvent('multiselect:didclose', ms, why);
    });
  };

  window.toggleMulti = function toggleMulti(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const willOpen = !el.classList.contains('open');
    if (willOpen) {
      window.closeAllMultiselects?.('switch');
      emitMultiselectEvent('multiselect:willopen', el, 'toggle');
      setMultiOpen(el, true);
      emitMultiselectEvent('multiselect:didopen', el, 'toggle');
    } else {
      emitMultiselectEvent('multiselect:willclose', el, 'toggle');
      setMultiOpen(el, false);
      emitMultiselectEvent('multiselect:didclose', el, 'toggle');
    }
  };

  function wireMultiselectAutoClose() {
    document.addEventListener('click', (e) => {
      if (e.target.closest?.('.multiselect')) return;
      window.closeAllMultiselects?.('auto-close');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      window.closeAllMultiselects?.('escape');
    });
  }

  function closeTopModalOverlay() {
    const overlays = Array.from(document.querySelectorAll('.modal-overlay')).filter(
      (el) => !el.classList.contains('hidden'),
    );
    if (!overlays.length) return false;
    let top = overlays[0];
    let topZ = numericZIndex(window.getComputedStyle(top).zIndex, 0);
    overlays.forEach((overlay) => {
      const z = numericZIndex(window.getComputedStyle(overlay).zIndex, 0);
      if (z > topZ) {
        top = overlay;
        topZ = z;
      }
    });
    top.classList.add('hidden');
    return true;
  }

  function wireModalEscapeClose() {
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;

      const hasOpenMultiselect = !!document.querySelector('.multiselect.open');
      if (hasOpenMultiselect) {
        window.closeAllMultiselects?.('escape');
        e.preventDefault();
        return;
      }

      const closed = closeTopModalOverlay();
      if (closed) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
  }

  function wireDropdownAutoClose() {
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.dropdown')) {
        document.querySelectorAll('.dropdown-menu').forEach((menu) => {
          menu.classList.remove('open');
          if (menu.classList.contains('dropdown-menu-fixed')) {
            const dd = menu.closest('.dropdown');
            menu.classList.remove('dropdown-menu-fixed');
            menu.style.position = '';
            menu.style.top = '';
            menu.style.left = '';
            menu.style.right = '';
            if (dd && dd._closeOnScroll) {
              window.removeEventListener('scroll', dd._closeOnScroll, true);
              dd._closeOnScroll = null;
            }
          }
        });
      }
    });
  }

  function wireDjangoMessages() {
    const list = document.getElementById('djangoMessages');
    if (!list) return;

    list.querySelectorAll('li').forEach((li) => {
      const level = (li.dataset.level || 'info').split(' ')[0];
      const text = li.dataset.text || '';

      const title = level.charAt(0).toUpperCase() + level.slice(1);
      window.showToast?.(level, title, text);
    });

    list.remove();
  }

  function wireStickyOffsets() {
    const root = document.documentElement;
    const header = document.querySelector('.header');
    if (!root || !header) return;

    const sync = () => {
      const height = header.getBoundingClientRect().height;
      root.style.setProperty('--header-sticky-height', `${height}px`);
    };

    sync();
    window.addEventListener('load', sync, { once: true });

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(sync, 50);
    });
  }

  window.copyText = async function copyText(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const text = (el.innerText || el.textContent || '').trim();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const t = document.createElement('textarea');
      t.value = text;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      document.body.removeChild(t);
    }
  };

  function init() {
    ensureLogoutConfirmModal();
    wireModalOverlayClose();
    wireModalEscapeClose();
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
