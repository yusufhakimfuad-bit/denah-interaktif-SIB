const $ = (s) => document.querySelector(s);

const state = {
  rooms: [],
  selected: null,
  scale: 1,
  x: 0,
  y: 0,
  pointers: new Map(),
  gesture: null,
  suppressClickUntil: 0,
  adminOpen: false,
  adminPhotoData: null,
  adminPhotoChanged: false
};

const viewport = $("#viewport");
const canvas = $("#canvas");
const search = $("#search");
const results = $("#results");
const infoName = $("#name");
const infoMeta = $("#meta");
const infoDescription = $("#desc");
const roomPanel = $("#roomPanel");
const closePanel = $("#closePanel");
const panelName = $("#panelName");
const panelMeta = $("#panelMeta");
const panelDescription = $("#panelDescription");
const roomPhotoImage = $("#roomPhotoImage");
const roomPhotoPlaceholder = $("#roomPhotoPlaceholder");

const adminToggle = $("#adminToggle");
const adminPanel = $("#adminPanel");
const closeAdmin = $("#closeAdmin");
const adminRoomSelect = $("#adminRoomSelect");
const adminName = $("#adminName");
const adminCategory = $("#adminCategory");
const adminFloor = $("#adminFloor");
const adminTeacher = $("#adminTeacher");
const adminCapacity = $("#adminCapacity");
const adminFacilities = $("#adminFacilities");
const adminDescription = $("#adminDescription");
const adminPhotoInput = $("#adminPhotoInput");
const adminPhotoPreview = $("#adminPhotoPreview");
const choosePhoto = $("#choosePhoto");
const removePhoto = $("#removePhoto");
const saveRoom = $("#saveRoom");
const exportData = $("#exportData");
const importData = $("#importData");
const importDataInput = $("#importDataInput");
const resetData = $("#resetData");
const adminStatus = $("#adminStatus");

const MIN_SCALE = 0.45;
const MAX_SCALE = 3.5;
const STORAGE_KEY = "sibInteractiveMapRoomsV1";

async function init() {
  const [roomsResponse, svgResponse] = await Promise.all([
    fetch("data/rooms.json"),
    fetch("map/sib-floor1.svg")
  ]);

  if (!roomsResponse.ok || !svgResponse.ok) {
    throw new Error("Gagal memuat data denah.");
  }

  const baseRooms = await roomsResponse.json();
  state.rooms = loadStoredRooms(baseRooms);
  const roomCount = $("#roomCount");
  if (roomCount) roomCount.textContent = `${state.rooms.length} RUANG`;
  canvas.innerHTML = await svgResponse.text();

  attachRoomEvents();
  renderResults(state.rooms);
  populateAdminRoomSelect();
  requestAnimationFrame(() => {
    centerAtDefault();
    applyTransform();
    if (state.rooms[0]) loadAdminRoom(state.rooms[0].id);
  });
}

function loadStoredRooms(baseRooms) {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return baseRooms;
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return baseRooms;
    const savedById = new Map(parsed.map((room) => [room.id, room]));
    return baseRooms.map((base) => ({ ...base, ...(savedById.get(base.id) || {}) }));
  } catch (error) {
    console.warn("Tidak dapat membaca data lokal:", error);
    return baseRooms;
  }
}

function saveRoomsToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.rooms));
}

function attachRoomEvents() {
  canvas.querySelectorAll(".room").forEach((roomEl) => {
    roomEl.addEventListener("click", (event) => {
      event.stopPropagation();
      if (performance.now() < state.suppressClickUntil) return;
      selectRoom(roomEl.dataset.roomId, false);
    });
  });
}

function renderResults(list) {
  results.innerHTML = "";

  if (!list.length) {
    results.innerHTML = '<div style="color:#68737d;font-size:14px">Ruangan tidak ditemukan.</div>';
    return;
  }

  list.forEach((room) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "result" + (room.id === state.selected ? " active" : "");
    button.dataset.id = room.id;
    button.innerHTML = `
      <b>${escapeHtml(room.name)}</b>
      <small>${escapeHtml(room.category)} • Lantai ${escapeHtml(room.floor)}</small>
    `;
    button.addEventListener("click", () => selectRoom(room.id, true));
    results.appendChild(button);
  });
}

function selectRoom(id, focusMap = false) {
  const room = state.rooms.find((item) => item.id === id);
  const roomEl = canvas.querySelector(`[data-room-id="${CSS.escape(id)}"]`);
  if (!room || !roomEl) return;

  state.selected = id;
  canvas.querySelectorAll(".room").forEach((element) => {
    element.classList.toggle("selected", element.dataset.roomId === id);
  });

  infoName.textContent = room.name;
  infoMeta.textContent = `${room.category} • Lantai ${room.floor}`;
  infoDescription.textContent = room.description || "Belum ada deskripsi.";

  panelName.textContent = room.name;
  panelMeta.textContent = buildPanelMeta(room);
  panelDescription.textContent = room.description || "Belum ada deskripsi.";

  if (room.image) {
    roomPhotoImage.src = room.image;
    roomPhotoImage.alt = `Foto ${room.name}`;
    roomPhotoImage.hidden = false;
    roomPhotoPlaceholder.hidden = true;
  } else {
    roomPhotoImage.removeAttribute("src");
    roomPhotoImage.alt = "";
    roomPhotoImage.hidden = true;
    roomPhotoPlaceholder.hidden = false;
  }

  roomPanel.classList.add("open");
  roomPanel.setAttribute("aria-hidden", "false");

  results.querySelectorAll(".result").forEach((element) => {
    element.classList.toggle("active", element.dataset.id === id);
  });

  if (focusMap) focusOnRoom(roomEl);
}

function buildPanelMeta(room) {
  const extras = [room.category, `Lantai ${room.floor}`];
  if (room.teacher) extras.push(`Wali: ${room.teacher}`);
  if (room.capacity) extras.push(`Kapasitas: ${room.capacity}`);
  return extras.join(" • ");
}

function getMapMetrics() {
  const svg = canvas.querySelector("svg");
  if (!svg) return null;
  const viewBox = svg.viewBox.baseVal;
  const rect = svg.getBoundingClientRect();
  const baseWidth = rect.width / Math.max(state.scale, 0.0001);
  const baseHeight = rect.height / Math.max(state.scale, 0.0001);
  const baseScale = baseWidth / (viewBox.width || 1950);
  return {
    svg,
    viewBoxWidth: viewBox.width || 1950,
    viewBoxHeight: viewBox.height || 950,
    baseScale,
    baseWidth,
    baseHeight
  };
}

function focusOnRoom(roomEl) {
  const metrics = getMapMetrics();
  if (!metrics) return;
  const box = roomEl.getBBox();
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const roomBaseWidth = box.width * metrics.baseScale;
  const roomBaseHeight = box.height * metrics.baseScale;
  const targetScale = clamp(
    Math.min(2.2, Math.max(1.05, 360 / Math.max(roomBaseWidth, roomBaseHeight))),
    MIN_SCALE,
    MAX_SCALE
  );
  state.scale = targetScale;
  state.x = viewport.clientWidth / 2 - centerX * metrics.baseScale * targetScale;
  state.y = viewport.clientHeight / 2 - centerY * metrics.baseScale * targetScale;
  clampPan();
  applyTransform();
}

function centerAtDefault() {
  const metrics = getMapMetrics();
  if (!metrics) return;
  state.scale = 1;
  state.x = (viewport.clientWidth - metrics.baseWidth) / 2;
  state.y = (viewport.clientHeight - metrics.baseHeight) / 2;
  clampPan();
}

function applyTransform() {
  clampPan();
  canvas.style.transform = `translate3d(${state.x}px, ${state.y}px, 0) scale(${state.scale})`;
}

function clampPan() {
  const metrics = getMapMetrics();
  if (!metrics) return;
  const renderedWidth = metrics.baseWidth * state.scale;
  const renderedHeight = metrics.baseHeight * state.scale;
  const viewportWidth = viewport.clientWidth;
  const viewportHeight = viewport.clientHeight;
  if (renderedWidth <= viewportWidth) state.x = (viewportWidth - renderedWidth) / 2;
  else state.x = clamp(state.x, viewportWidth - renderedWidth, 0);
  if (renderedHeight <= viewportHeight) state.y = (viewportHeight - renderedHeight) / 2;
  else state.y = clamp(state.y, viewportHeight - renderedHeight, 0);
}

function setZoom(nextScale, centerX = viewport.clientWidth / 2, centerY = viewport.clientHeight / 2) {
  const oldScale = state.scale;
  const newScale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
  if (newScale === oldScale) return;
  const ratio = newScale / oldScale;
  state.x = centerX - (centerX - state.x) * ratio;
  state.y = centerY - (centerY - state.y) * ratio;
  state.scale = newScale;
  applyTransform();
}

function resetView() {
  centerAtDefault();
  applyTransform();
}

function getPointerDistance(a, b) { return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }
function getPointerCenter(a, b) { return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }; }

function beginPan(pointer) {
  state.gesture = { type: "pan", pointerId: pointer.pointerId, startX: pointer.clientX, startY: pointer.clientY, startMapX: state.x, startMapY: state.y, moved: false };
}

function beginPinch() {
  const points = [...state.pointers.values()];
  if (points.length < 2) return;
  const a = points[0]; const b = points[1];
  const center = getPointerCenter(a, b); const rect = viewport.getBoundingClientRect();
  state.gesture = {
    type: "pinch",
    startDistance: Math.max(1, getPointerDistance(a, b)),
    startScale: state.scale,
    startCenterX: center.x,
    startCenterY: center.y,
    anchorX: (center.x - rect.left - state.x) / state.scale,
    anchorY: (center.y - rect.top - state.y) / state.scale,
    moved: false
  };
}

function closeRoomPanel() {
  roomPanel.classList.remove("open");
  roomPanel.setAttribute("aria-hidden", "true");
  state.selected = null;
  canvas.querySelectorAll(".room").forEach((element) => element.classList.remove("selected"));
  results.querySelectorAll(".result").forEach((element) => element.classList.remove("active"));
}

closePanel.addEventListener("click", (event) => { event.stopPropagation(); closeRoomPanel(); });
roomPhotoImage.addEventListener("error", () => { roomPhotoImage.hidden = true; roomPhotoPlaceholder.hidden = false; });

viewport.addEventListener("wheel", (event) => {
  event.preventDefault();
  const rect = viewport.getBoundingClientRect();
  setZoom(state.scale * (event.deltaY < 0 ? 1.1 : 0.9), event.clientX - rect.left, event.clientY - rect.top);
}, { passive: false });

viewport.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  state.pointers.set(event.pointerId, event);
  viewport.setPointerCapture(event.pointerId);
  if (state.pointers.size === 1) beginPan(event);
  else if (state.pointers.size === 2) { state.suppressClickUntil = performance.now() + 350; beginPinch(); }
});

viewport.addEventListener("pointermove", (event) => {
  if (!state.pointers.has(event.pointerId)) return;
  state.pointers.set(event.pointerId, event);
  if (state.pointers.size >= 2) {
    if (!state.gesture || state.gesture.type !== "pinch") beginPinch();
    const points = [...state.pointers.values()]; const a = points[0]; const b = points[1];
    const distance = Math.max(1, getPointerDistance(a, b)); const center = getPointerCenter(a, b);
    const rect = viewport.getBoundingClientRect(); const centerX = center.x - rect.left; const centerY = center.y - rect.top;
    const gesture = state.gesture; if (!gesture || gesture.type !== "pinch") return;
    if (Math.abs(distance - gesture.startDistance) > 4 || Math.hypot(centerX - (gesture.startCenterX - rect.left), centerY - (gesture.startCenterY - rect.top)) > 4) {
      gesture.moved = true; state.suppressClickUntil = performance.now() + 350;
    }
    state.scale = clamp(gesture.startScale * (distance / gesture.startDistance), MIN_SCALE, MAX_SCALE);
    state.x = centerX - gesture.anchorX * state.scale;
    state.y = centerY - gesture.anchorY * state.scale;
    clampPan(); applyTransform(); return;
  }
  if (!state.gesture || state.gesture.type !== "pan") return;
  const dx = event.clientX - state.gesture.startX; const dy = event.clientY - state.gesture.startY;
  if (Math.hypot(dx, dy) > 6) { state.gesture.moved = true; state.suppressClickUntil = performance.now() + 350; }
  state.x = state.gesture.startMapX + dx; state.y = state.gesture.startMapY + dy; applyTransform();
});

function endPointer(event) {
  const wasPinching = state.gesture?.type === "pinch"; const moved = state.gesture?.moved;
  state.pointers.delete(event.pointerId);
  if (state.pointers.size >= 2) { beginPinch(); return; }
  if (state.pointers.size === 1) { beginPan([...state.pointers.values()][0]); if (wasPinching || moved) state.suppressClickUntil = performance.now() + 350; return; }
  if (wasPinching || moved) state.suppressClickUntil = performance.now() + 350;
  state.gesture = null; viewport.classList.remove("dragging");
}
viewport.addEventListener("pointerup", endPointer);
viewport.addEventListener("pointercancel", endPointer);

$("#in").addEventListener("click", () => setZoom(state.scale * 1.2));
const fullscreenButton = $("#fullscreen");
fullscreenButton.addEventListener("click", async () => {
  const target = document.querySelector(".map");
  try { if (!document.fullscreenElement) { await target.requestFullscreen(); fullscreenButton.textContent = "⤢"; fullscreenButton.setAttribute("aria-label", "Keluar dari layar penuh"); } else { await document.exitFullscreen(); } } catch (error) { console.warn("Mode layar penuh tidak tersedia:", error); }
});
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement) { fullscreenButton.textContent = "⛶"; fullscreenButton.setAttribute("aria-label", "Layar penuh"); } requestAnimationFrame(() => { clampPan(); applyTransform(); }); });
$("#out").addEventListener("click", () => setZoom(state.scale / 1.2));
$("#reset").addEventListener("click", resetView);

search.addEventListener("input", () => {
  const query = search.value.trim().toLowerCase();
  renderResults(state.rooms.filter((room) => `${room.name} ${room.category} ${room.description} ${room.teacher || ""} ${room.facilities || ""}`.toLowerCase().includes(query)));
});

window.addEventListener("resize", () => { clampPan(); applyTransform(); });

// ------------------------- Local admin/editor mode -------------------------
adminToggle.addEventListener("click", () => toggleAdmin(true));
closeAdmin.addEventListener("click", () => toggleAdmin(false));
adminRoomSelect.addEventListener("change", () => loadAdminRoom(adminRoomSelect.value));
choosePhoto.addEventListener("click", () => adminPhotoInput.click());
removePhoto.addEventListener("click", () => {
  state.adminPhotoData = null;
  state.adminPhotoChanged = true;
  renderAdminPhoto(null);
  setAdminStatus("Foto akan dihapus saat disimpan.", "info");
});
adminPhotoInput.addEventListener("change", async () => {
  const file = adminPhotoInput.files?.[0];
  if (!file) return;
  try {
    state.adminPhotoData = await resizeImageToDataUrl(file, 1200, 900, 0.82);
    state.adminPhotoChanged = true;
    renderAdminPhoto(state.adminPhotoData);
    setAdminStatus("Foto siap disimpan.", "info");
  } catch (error) {
    setAdminStatus("Foto tidak dapat diproses.", "error");
  }
});
saveRoom.addEventListener("click", saveAdminRoom);
exportData.addEventListener("click", exportRoomData);
importData.addEventListener("click", () => importDataInput.click());
importDataInput.addEventListener("change", importRoomData);
resetData.addEventListener("click", resetLocalData);

function toggleAdmin(open) {
  state.adminOpen = open;
  adminPanel.classList.toggle("open", open);
  adminPanel.setAttribute("aria-hidden", String(!open));
  adminToggle.classList.toggle("active", open);
  if (open) {
    closeRoomPanel();
    populateAdminRoomSelect();
    const id = state.selected || adminRoomSelect.value || state.rooms[0]?.id;
    if (id) loadAdminRoom(id);
  }
}

function populateAdminRoomSelect() {
  adminRoomSelect.innerHTML = state.rooms.map((room) => `<option value="${escapeHtml(room.id)}">${escapeHtml(room.name)}</option>`).join("");
}

function loadAdminRoom(id) {
  const room = state.rooms.find((item) => item.id === id);
  if (!room) return;
  adminRoomSelect.value = room.id;
  adminName.value = room.name || "";
  adminCategory.value = room.category || "";
  adminFloor.value = room.floor ?? 1;
  adminTeacher.value = room.teacher || "";
  adminCapacity.value = room.capacity || "";
  adminFacilities.value = room.facilities || "";
  adminDescription.value = room.description || "";
  state.adminPhotoData = room.image || null;
  state.adminPhotoChanged = false;
  renderAdminPhoto(state.adminPhotoData);
  setAdminStatus("");
}

function renderAdminPhoto(src) {
  if (src) {
    adminPhotoPreview.innerHTML = `<img src="${src}" alt="Preview foto ruangan">`;
  } else {
    adminPhotoPreview.textContent = "Belum ada foto";
  }
}

function saveAdminRoom() {
  const room = state.rooms.find((item) => item.id === adminRoomSelect.value);
  if (!room) return;
  room.name = adminName.value.trim() || room.name;
  room.category = adminCategory.value.trim() || "Lainnya";
  room.floor = Number(adminFloor.value) || 1;
  room.teacher = adminTeacher.value.trim();
  room.capacity = adminCapacity.value.trim();
  room.facilities = adminFacilities.value.trim();
  room.description = adminDescription.value.trim() || "Belum ada deskripsi.";
  if (state.adminPhotoChanged) {
    if (state.adminPhotoData) room.image = state.adminPhotoData;
    else delete room.image;
  }
  saveRoomsToStorage();
  renderResults(state.rooms);
  populateAdminRoomSelect();
  adminRoomSelect.value = room.id;
  if (state.selected === room.id) selectRoom(room.id, false);
  setAdminStatus(`${room.name} berhasil disimpan di browser ini.`, "success");
}

function setAdminStatus(message, type = "") {
  adminStatus.textContent = message;
  adminStatus.className = `admin-status ${type}`.trim();
}

async function resizeImageToDataUrl(file, maxWidth, maxHeight, quality) {
  if (!file.type.startsWith("image/")) throw new Error("Bukan gambar");
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
  const width = Math.max(1, Math.round(bitmap.width * ratio));
  const height = Math.max(1, Math.round(bitmap.height * ratio));
  const offscreen = document.createElement("canvas");
  offscreen.width = width; offscreen.height = height;
  const context = offscreen.getContext("2d");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return offscreen.toDataURL("image/jpeg", quality);
}

function exportRoomData() {
  const blob = new Blob([JSON.stringify(state.rooms, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = "sib-room-data-backup.json"; link.click();
  URL.revokeObjectURL(url);
  setAdminStatus("Backup JSON diexport.", "success");
}

async function importRoomData(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!Array.isArray(imported)) throw new Error("Format tidak valid");
    const validIds = new Set(state.rooms.map((room) => room.id));
    const merged = state.rooms.map((room) => {
      const incoming = imported.find((item) => item.id === room.id);
      return incoming && validIds.has(incoming.id) ? { ...room, ...incoming } : room;
    });
    state.rooms = merged;
    saveRoomsToStorage();
    renderResults(state.rooms);
    populateAdminRoomSelect();
    loadAdminRoom(merged[0]?.id);
    if (state.selected) selectRoom(state.selected, false);
    setAdminStatus("Data berhasil diimport.", "success");
  } catch (error) {
    setAdminStatus("Import gagal. Pastikan file JSON berasal dari editor ini.", "error");
  }
}

function resetLocalData() {
  if (!confirm("Reset semua perubahan lokal dan kembali ke data awal?")) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character])); }

init().catch((error) => {
  console.error(error);
  canvas.innerHTML = '<div style="padding:24px;color:#a33">Denah gagal dimuat. Jalankan project menggunakan VS Code Live Server.</div>';
});
