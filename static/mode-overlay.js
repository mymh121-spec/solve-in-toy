const boardModes = new Map();

function renderShortcutOverlay() {
  const activeBoards = [...boardModes.entries()]
    .filter(([, mode]) => mode === "shortcut")
    .map(([board]) => board);
  const overlay = document.querySelector("#shortcutModeOverlay");
  if (!overlay) return;
  overlay.hidden = activeBoards.length === 0;
  const label = overlay.querySelector("[data-shortcut-boards]");
  if (label && activeBoards.length) {
    label.textContent = `${activeBoards.join(" + ")} · 키보드 입력 모드`;
  }
}

export function updateShortcutMode(packet) {
  if (!packet?.board || packet.mode_id == null) return;
  boardModes.set(packet.board, String(packet.mode_id).toLowerCase());
  renderShortcutOverlay();
}

export function updateShortcutSnapshot(boards) {
  Object.values(boards || {}).forEach(updateShortcutMode);
  renderShortcutOverlay();
}
