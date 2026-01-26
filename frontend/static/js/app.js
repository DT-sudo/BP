/**
 * Core Application Utilities
 * CSRF handling, fetch helpers, toasts, modals, dropdowns, multiselect
 */
(function () {
  function getById(id) {
    return document.getElementById(id);
  }
  window.getById = getById;

  function queryAll(selector) {
    return document.querySelectorAll(selector);
  }

  // Cookie utilities
  function getCookie(name) {
    for (const cookie of (document.cookie || '').split(';')) {
      const trimmed = cookie.trim();
      if (trimmed.startsWith(name + '=')) {
        return decodeURIComponent(trimmed.slice(name.length + 1));
      }
    }
    return null;
  }

  window.getCsrfToken = function () {
    const input = document.querySelector('input[name="csrfmiddlewaretoken"]');
    return getCookie('csrftoken') || (input ? input.value : '');
  };

  window.urlFromTemplate = function (template, id) {
    const tpl = String(template || '');
    const idStr = String(id != null ? id : '').trim();
    if (tpl && idStr && tpl.includes('/0/')) {
      return tpl.replace('/0/', '/' + idStr + '/');
    }
    return tpl;
  };

  // Fetch helpers
  async function parseJsonResponse(response) {
    const payload = await response.json().catch(function () { return {}; });

    if (response.ok) {
      return payload;
    }

    let errorMessage = '';
    if (payload && payload.errors && typeof payload.errors === 'object') {
      const messages = Object.values(payload.errors).flat();
      for (const item of messages) {
        if (typeof item === 'string' && item) {
          errorMessage = item;
          break;
        } else if (item && item.message) {
          errorMessage = item.message;
          break;
        }
      }
    }
    throw new Error(payload.error || errorMessage || 'Request failed.');
  }

  window.postFormJson = async function (url, data) {
    const csrfToken = window.getCsrfToken ? window.getCsrfToken() : '';
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'Accept': 'application/json'
    };
    if (csrfToken) {
      headers['X-CSRFToken'] = csrfToken;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: new URLSearchParams(data || {})
    });
    return parseJsonResponse(response);
  };

  // Toast notifications
  window.showToast = function (type, title, description) {
    const container = getById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast ' + (type || '');

    let html = '<div class="toast-dot" aria-hidden="true"></div>';
    html += '<div>';
    html += '<div class="toast-title">' + (title || '') + '</div>';
    if (description) {
      html += '<div class="toast-desc">' + description + '</div>';
    }
    html += '</div>';
    toast.innerHTML = html;

    container.appendChild(toast);

    const duration = (type === 'error') ? 5000 : 3000;
    setTimeout(function () {
      toast.remove();
    }, duration);
  };

  // Modal utilities
  function getZIndex(element) {
    const value = parseInt(getComputedStyle(element).zIndex, 10);
    return Number.isFinite(value) ? value : 0;
  }

  function getOpenOverlays() {
    return Array.from(queryAll('.modal-overlay:not(.hidden)'));
  }

  function getTopZIndex() {
    const overlays = getOpenOverlays();
    let maxZ = 5000;
    for (const overlay of overlays) {
      const z = getZIndex(overlay);
      if (z > maxZ) maxZ = z;
    }
    return maxZ;
  }

  window.openModal = function (id) {
    const element = getById(id);
    if (!element) return;

    if (element.classList.contains('modal-overlay')) {
      element.style.zIndex = getTopZIndex() + 1;
    }
    element.classList.remove('hidden');
  };

  window.closeModal = function (id) {
    const element = getById(id);
    if (element) {
      element.classList.add('hidden');
    }
  };

  // Logout confirmation modal
  let pendingLogoutHref = null;

  function ensureLogoutModal() {
    if (getById('logoutConfirmModal')) return;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay hidden';
    overlay.id = 'logoutConfirmModal';
    overlay.innerHTML = '<div class="modal" style="max-width:480px">' +
      '<div class="modal-header">' +
      '<h2 class="modal-title">Confirm logout</h2>' +
      '<button class="modal-close" type="button" aria-label="Close">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/>' +
      '</svg></button></div>' +
      '<div class="modal-body"><p class="text-sm">Are you really want to log out?</p></div>' +
      '<div class="modal-footer">' +
      '<button class="btn btn-outline" type="button" id="logoutConfirmNo">No</button>' +
      '<button class="btn btn-primary" type="button" id="logoutConfirmYes">Yes</button>' +
      '</div></div>';

    document.body.appendChild(overlay);

    function closeLogoutModal() {
      pendingLogoutHref = null;
      window.closeModal('logoutConfirmModal');
    }

    const closeBtn = overlay.querySelector('.modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeLogoutModal);

    const noBtn = overlay.querySelector('#logoutConfirmNo');
    if (noBtn) noBtn.addEventListener('click', closeLogoutModal);

    const yesBtn = overlay.querySelector('#logoutConfirmYes');
    if (yesBtn) {
      yesBtn.addEventListener('click', function () {
        const href = pendingLogoutHref;
        pendingLogoutHref = null;
        if (href) window.location.assign(href);
      });
    }

    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) {
        pendingLogoutHref = null;
      }
    });
  }

  function wireModalClose() {
    const overlays = queryAll('.modal-overlay');
    for (const overlay of overlays) {
      overlay.addEventListener('click', function (event) {
        if (event.target === overlay) {
          overlay.classList.add('hidden');
        }
      });
    }
  }

  function wireLogout() {
    document.addEventListener('click', function (event) {
      const link = event.target.closest ? event.target.closest('a') : null;
      if (!link) return;

      const href = link.getAttribute('href');
      if (!href || href.indexOf('/logout') === -1) return;

      event.preventDefault();
      event.stopPropagation();
      pendingLogoutHref = href;
      window.openModal('logoutConfirmModal');
    });
  }

  // Dropdown utilities
  function resetDropdownMenu(menu) {
    if (!menu) return;
    menu.classList.remove('dropdown-menu-fixed');
    menu.style.position = '';
    menu.style.top = '';
    menu.style.left = '';
    menu.style.right = '';
  }

  function cleanupScrollListener(dropdown) {
    if (dropdown && dropdown._closeOnScroll) {
      window.removeEventListener('scroll', dropdown._closeOnScroll, true);
      dropdown._closeOnScroll = null;
    }
  }

  window.toggleDropdown = function (button) {
    const dropdown = (button.closest ? button.closest('.dropdown') : null) || button.parentElement;
    const menu = dropdown ? dropdown.querySelector('.dropdown-menu') : null;
    if (!menu) return;

    // Close other dropdowns
    const allMenus = queryAll('.dropdown-menu');
    for (const otherMenu of allMenus) {
      if (otherMenu !== menu) {
        otherMenu.classList.remove('open');
      }
    }

    const willOpen = !menu.classList.contains('open');
    menu.classList.toggle('open', willOpen);

    if (dropdown.classList.contains('dropdown-fixed')) {
      if (willOpen) {
        const rect = button.getBoundingClientRect();
        const viewportWidth = innerWidth || document.documentElement.clientWidth || 0;
        const menuWidth = Math.max(menu.offsetWidth || 0, 160);
        const leftPosition = Math.min(Math.max(8, rect.right - menuWidth), viewportWidth - menuWidth - 8);

        menu.classList.add('dropdown-menu-fixed');
        menu.style.position = 'fixed';
        menu.style.top = Math.round(rect.bottom + 6) + 'px';
        menu.style.left = Math.round(leftPosition) + 'px';
        menu.style.right = 'auto';

        function closeOnScroll() {
          if (menu.classList.contains('open')) {
            menu.classList.remove('open');
          }
        }
        dropdown._closeOnScroll = closeOnScroll;
        addEventListener('scroll', closeOnScroll, true);
      } else {
        resetDropdownMenu(menu);
        cleanupScrollListener(dropdown);
      }
    }
  };

  window.toggleUserMenu = window.toggleDropdown;

  // Multiselect utilities
  function emitMultiselectEvent(eventType, element, reason) {
    if (!element) return;
    document.dispatchEvent(new CustomEvent(eventType, {
      detail: { id: element.id || '', el: element, reason: reason || 'programmatic' }
    }));
  }

  function setMultiselectOpen(element, isOpen, reason) {
    if (!element) return;

    const action = isOpen ? 'open' : 'close';
    emitMultiselectEvent('multiselect:will' + action, element, reason);
    element.classList.toggle('open', isOpen);

    const trigger = element.querySelector('.multiselect-trigger');
    if (trigger) {
      trigger.setAttribute('aria-expanded', String(isOpen));
    }

    emitMultiselectEvent('multiselect:did' + action, element, reason);
  }

  window.closeAllMultiselects = function (reason) {
    const multiselects = queryAll('.multiselect.open');
    for (const multiselect of multiselects) {
      setMultiselectOpen(multiselect, false, reason);
    }
  };

  window.toggleMulti = function (id) {
    const element = getById(id);
    if (!element) return;

    const willOpen = !element.classList.contains('open');
    if (willOpen) {
      window.closeAllMultiselects('switch');
    }
    setMultiselectOpen(element, willOpen, 'toggle');
  };

  function closeTopModal() {
    const overlays = getOpenOverlays();
    if (!overlays.length) return false;

    let topOverlay = overlays[0];
    let topZ = getZIndex(topOverlay);

    for (let i = 1; i < overlays.length; i++) {
      const z = getZIndex(overlays[i]);
      if (z > topZ) {
        topZ = z;
        topOverlay = overlays[i];
      }
    }

    topOverlay.classList.add('hidden');
    return true;
  }

  function wireEscape() {
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;

      // Close multiselects first
      if (document.querySelector('.multiselect.open')) {
        window.closeAllMultiselects('escape');
        event.preventDefault();
        return;
      }

      // Then close top modal
      if (closeTopModal()) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
  }

  function wireDropdownClose() {
    document.addEventListener('click', function (event) {
      if (event.target.closest('.dropdown')) return;

      const menus = queryAll('.dropdown-menu');
      for (const menu of menus) {
        menu.classList.remove('open');
        if (menu.classList.contains('dropdown-menu-fixed')) {
          resetDropdownMenu(menu);
          cleanupScrollListener(menu.closest('.dropdown'));
        }
      }
    });
  }

  function wireMultiselectClose() {
    document.addEventListener('click', function (event) {
      const closest = event.target.closest ? event.target.closest('.multiselect') : null;
      if (!closest) {
        window.closeAllMultiselects('auto-close');
      }
    });
  }

  function wireDjangoMessages() {
    const messageList = getById('djangoMessages');
    if (!messageList) return;

    const items = messageList.querySelectorAll('li');
    for (const item of items) {
      const level = (item.dataset.level || 'info').split(' ')[0];
      const title = level.charAt(0).toUpperCase() + level.slice(1);
      window.showToast(level, title, item.dataset.text || '');
    }
    messageList.remove();
  }

  function wireStickyHeader() {
    const header = document.querySelector('.header');
    if (!header) return;

    function syncHeight() {
      const height = header.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--header-sticky-height', height + 'px');
    }

    syncHeight();
    addEventListener('load', syncHeight, { once: true });

    let resizeTimer;
    addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(syncHeight, 50);
    });
  }

  window.copyText = async function (id) {
    const element = getById(id);
    const text = element ? (element.textContent || '').trim() : '';
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
  };

  // Initialize
  function init() {
    ensureLogoutModal();
    wireModalClose();
    wireEscape();
    wireLogout();
    wireDropdownClose();
    wireMultiselectClose();
    wireDjangoMessages();
    wireStickyHeader();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
