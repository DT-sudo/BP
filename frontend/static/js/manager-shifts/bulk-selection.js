/**
 * MANAGER SHIFTS - Bulk Selection
 * Multi-shift selection for bulk publish/delete operations
 */

(function() {
  'use strict';

  const Config = window.ManagerShiftsConfig || {};
const { getEl } = Config;

// State
let selectionMode = false;
const selectedShiftIds = new Set();
let selectionHistory = [];
let serverCanUndo = false;

function setServerCanUndo(value) {
  serverCanUndo = value;
}

function isSelectionMode() {
  return selectionMode;
}

function getSelectedShiftIds() {
  return selectedShiftIds;
}

function setSelectMode(on) {
  selectionMode = !!on;
  if (!selectionMode) {
    selectedShiftIds.clear();
    selectionHistory = [];
  }
  updateSelectionUI();
}

function updateSelectionUI() {
  const btn = getEl('selectModeBtn');
  if (btn) {
    btn.textContent = selectionMode ? 'Cancel' : 'Select';
    btn.classList.toggle('btn-primary', selectionMode);
    btn.classList.toggle('btn-outline', !selectionMode);
  }

  document.body?.classList?.toggle('selection-mode', selectionMode);

  const undoBtn = getEl('undoSelectBtn');
  if (undoBtn) {
    const canUndoNow = selectionMode ? selectionHistory.length > 0 || serverCanUndo : serverCanUndo;
    undoBtn.disabled = !canUndoNow;
  }

  if (!selectionMode) {
    document.querySelectorAll('.shift-chip-selected').forEach((chip) => chip.classList.remove('shift-chip-selected'));
    return;
  }

  const esc = window.CSS?.escape ? window.CSS.escape : (s) => String(s).replace(/["\\]/g, '\\$&');

  document.querySelectorAll('.shift-chip-selected').forEach((chip) => {
    const id = chip.dataset.shiftId;
    if (!id || !selectedShiftIds.has(String(id))) chip.classList.remove('shift-chip-selected');
  });

  selectedShiftIds.forEach((id) => {
    document.querySelectorAll(`.shift-chip[data-shift-id="${esc(id)}"]`).forEach((chip) => {
      chip.classList.add('shift-chip-selected');
    });
  });
}

function toggleChipSelected(chipEl) {
  const id = chipEl?.dataset?.shiftId;
  if (!id) return;
  selectionHistory.push(Array.from(selectedShiftIds));
  const key = String(id);
  if (selectedShiftIds.has(key)) selectedShiftIds.delete(key);
  else selectedShiftIds.add(key);
  chipEl.classList.toggle('shift-chip-selected', selectedShiftIds.has(key));
  updateSelectionUI();
}

function selectedIdsCsv() {
  return Array.from(selectedShiftIds).join(',');
}

// Global functions for HTML onclick handlers
window.toggleSelectMode = function toggleSelectMode() {
  setSelectMode(!selectionMode);
};

window.undoSelection = function undoSelection() {
  if (!selectionMode) return;
  const prev = selectionHistory.pop();
  if (!prev) {
    updateSelectionUI();
    return;
  }
  selectedShiftIds.clear();
  prev.forEach((id) => selectedShiftIds.add(String(id)));
  updateSelectionUI();
};

window.undoToolbar = function undoToolbar() {
  if (selectionMode && selectionHistory.length > 0) {
    window.undoSelection?.();
    return;
  }
  getEl('undoLastActionForm')?.submit();
};

window.toolbarPublish = function toolbarPublish() {
  if (selectionMode) {
    if (!selectedShiftIds.size) {
      showToast('error', 'Select shifts', 'Select one or more shifts first.');
      return;
    }
    const input = getEl('publishSelectedIds');
    const form = getEl('publishSelectedForm');
    if (!input || !form) return;
    input.value = selectedIdsCsv();
    form.submit();
    return;
  }
  getEl('publishAllDraftsForm')?.submit();
};

window.toolbarDelete = function toolbarDelete() {
  if (selectionMode) {
    if (!selectedShiftIds.size) {
      showToast('error', 'Select shifts', 'Select one or more shifts first.');
      return;
    }
    const input = getEl('deleteSelectedIds');
    if (input) input.value = selectedIdsCsv();
    openModal('deleteSelectedModal');
    return;
  }
  openModal('deleteDraftsModal');
};

function wireSelectionEscapeCancel() {
  if (window._managerShiftsSelectionEscapeBound) return;
  window._managerShiftsSelectionEscapeBound = true;

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!selectionMode) return;
    setSelectMode(false);
  });
}

window.ManagerShiftsBulkSelection = {
  setServerCanUndo,
  isSelectionMode,
  getSelectedShiftIds,
  setSelectMode,
  updateSelectionUI,
  toggleChipSelected,
  selectedIdsCsv,
  wireSelectionEscapeCancel,
};

})();
