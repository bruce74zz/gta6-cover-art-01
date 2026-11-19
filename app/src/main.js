// Wires the Neon Vice editor: photo tray, layout/grade/size pickers, lettering,
// canvas drag-to-crop, undo/redo, and one-click PNG export. Also exposes the
// shot hooks (./shots.js) that set up fixed scenes for screenshots.
import { drawCover, exportCoverPNG } from './cover.js';
import { GRADES, GRADE_IDS } from './grades.js';
import { LAYOUTS, LAYOUT_IDS, SIZES, SIZE_IDS, panelRect } from './layouts.js';
import { runShot } from './shots.js';

const canvas = document.getElementById('cover');
const statusEl = document.getElementById('status');
const TITLE_IDEAS = [
  'Sunset Heist', 'Neon Nights', 'Boulevard Queen', 'Palm Shadows',
  'Midnight Drive', 'Vice City Lights', 'Golden Hour Getaway', 'Ocean Drive',
];

/** A fresh editor state: 9 panel slots (layouts use the first N they need). */
function defaultState() {
  const grades = ['sunset', 'neon', 'dusk', 'sunset', 'neon', 'dusk', 'sunset', 'neon', 'dusk'];
  return {
    layout: 'hero',
    sizeId: 'square',
    size: { ...SIZES.square },
    title: 'Sunset Heist',
    subtitle: 'welcome to the sunshine state',
    titleY: 84,
    badge: 'star',
    grain: true,
    vignette: true,
    selected: 0,
    panels: Array.from({ length: 9 }, (_, i) => ({ photo: null, grade: grades[i], zoom: 1, ox: 0, oy: 0 })),
  };
}

let state = defaultState();
let photos = []; // loaded HTMLImageElements, in tray order

// ---------- history (undo / redo) ----------
let history = [];
let historyIndex = -1;
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');

function snapshot() {
  return JSON.stringify({ ...state, size: { ...state.size } });
}
function pushHistory() {
  history = history.slice(0, historyIndex + 1);
  history.push(snapshot());
  historyIndex = history.length - 1;
  if (history.length > 60) { history.shift(); historyIndex--; }
  syncHistoryButtons();
}
function applySnapshot(json) {
  const saved = JSON.parse(json);
  state = { ...saved, size: { ...saved.size } };
  syncAllControls();
  redraw();
}
function syncHistoryButtons() {
  undoBtn.disabled = historyIndex <= 0;
  redoBtn.disabled = historyIndex >= history.length - 1;
}
undoBtn.addEventListener('click', () => {
  if (historyIndex <= 0) return;
  historyIndex--;
  applySnapshot(history[historyIndex]);
});
redoBtn.addEventListener('click', () => {
  if (historyIndex >= history.length - 1) return;
  historyIndex++;
  applySnapshot(history[historyIndex]);
});

// ---------- rendering ----------
function redraw() {
  drawCover(canvas, state, photos);
  drawSelectionOutline();
}

/** Pink dashed outline around the selected panel, drawn over the cover. */
function drawSelectionOutline() {
  if (document.body.classList.contains('shot-cover')) return;
  const layout = LAYOUTS[state.layout];
  if (state.selected >= layout.panels) return;
  const ctx = canvas.getContext('2d');
  const { w: W, h: H } = state.size;
  const [fx, fy, fw, fh] = panelRect(state.layout, state.selected);
  const px = fx * W, py = fy * H, pw = fw * W, ph = fh * H;
  ctx.save();
  ctx.strokeStyle = '#ff2e88';
  ctx.lineWidth = Math.max(3, W * 0.006);
  ctx.setLineDash([W * 0.02, W * 0.012]);
  ctx.strokeRect(px + 2, py + 2, pw - 4, ph - 4);
  ctx.setLineDash([]);
  ctx.fillStyle = '#ff2e88';
  const label = `PANEL ${state.selected + 1}`;
  ctx.font = `${Math.max(16, W * 0.022)}px Anton, sans-serif`;
  const tw = ctx.measureText(label).width;
  const bx = px + 6;
  const by = py + 6;
  ctx.fillRect(bx, by, tw + 16, Math.max(22, W * 0.032));
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, bx + 8, by + Math.max(22, W * 0.032) / 2 + 1);
  ctx.restore();
}

// ---------- pickers ----------
function buildPicker(container, ids, labels, current, onPick) {
  container.innerHTML = '';
  ids.forEach((id) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pick';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', String(id === current));
    btn.dataset.value = id;
    btn.innerHTML = labels[id] || id;
    btn.addEventListener('click', () => {
      onPick(id);
      container.querySelectorAll('.pick').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === id)));
    });
    container.appendChild(btn);
  });
}

const layoutPicker = document.getElementById('layoutPicker');
const gradePicker = document.getElementById('gradePicker');
const sizePicker = document.getElementById('sizePicker');

function rebuildLayoutPicker() {
  buildPicker(layoutPicker, LAYOUT_IDS, Object.fromEntries(LAYOUT_IDS.map((id) => [id, LAYOUTS[id].label])), state.layout, (id) => {
    state.layout = id;
    if (state.selected >= LAYOUTS[id].panels) state.selected = 0;
    pushHistory();
    redraw();
  });
}
function rebuildGradePicker() {
  const labels = {};
  for (const id of GRADE_IDS) {
    labels[id] = `<span class="swatch" style="background:${GRADES[id].swatch}"></span>${GRADES[id].label}`;
  }
  const current = state.panels[state.selected]?.grade || 'sunset';
  buildPicker(gradePicker, GRADE_IDS, labels, current, (id) => {
    state.panels[state.selected].grade = id;
    pushHistory();
    redraw();
  });
}
function rebuildSizePicker() {
  buildPicker(sizePicker, SIZE_IDS, Object.fromEntries(SIZE_IDS.map((id) => [id, SIZES[id].label])), state.sizeId, (id) => {
    state.sizeId = id;
    state.size = { ...SIZES[id] };
    pushHistory();
    redraw();
  });
}

// ---------- photo tray ----------
const tray = document.getElementById('photoTray');

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function rebuildTray() {
  tray.innerHTML = '';
  photos.forEach((img, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'thumb';
    btn.title = img.dataset.name || `Photo ${i + 1}`;
    btn.setAttribute('role', 'option');
    btn.setAttribute('aria-selected', String(state.panels[state.selected]?.photo === i));
    const thumb = document.createElement('img');
    thumb.src = img.src;
    thumb.alt = btn.title;
    thumb.className = 'thumb';
    thumb.style.border = 'none';
    btn.appendChild(thumb);
    btn.addEventListener('click', () => {
      state.panels[state.selected].photo = i;
      pushHistory();
      redraw();
      rebuildTray();
    });
    tray.appendChild(btn);
  });
}

async function addPhotoFile(file) {
  const img = await loadImage(URL.createObjectURL(file));
  img.dataset.name = file.name;
  photos.push(img);
  return photos.length - 1;
}

document.getElementById('photoFiles').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  if (!files.length) return;
  for (const file of files) await addPhotoFile(file);
  // Put the first new photo into the selected panel if it is empty.
  const firstNew = photos.length - files.length;
  if (state.panels[state.selected].photo == null) state.panels[state.selected].photo = firstNew;
  pushHistory();
  rebuildTray();
  redraw();
  statusEl.textContent = `${files.length} photo${files.length > 1 ? 's' : ''} added.`;
  e.target.value = '';
});

async function loadSamplePhotos() {
  const [pier, boulevard] = await Promise.all([
    loadImage('samples/pier.jpg'),
    loadImage('samples/boulevard.jpg'),
  ]);
  pier.dataset.name = 'Pier sample';
  boulevard.dataset.name = 'Boulevard sample';
  photos = [pier, boulevard];
  return photos;
}

document.getElementById('useSamples').addEventListener('click', async () => {
  await loadSamplePhotos();
  state.panels.forEach((p, i) => { p.photo = i % 2; });
  pushHistory();
  rebuildTray();
  redraw();
  statusEl.textContent = 'Sample photos loaded.';
});

document.getElementById('fillAll').addEventListener('click', () => {
  if (!photos.length) { statusEl.textContent = 'Add a photo first.'; return; }
  const layout = LAYOUTS[state.layout];
  for (let i = 0; i < layout.panels; i++) state.panels[i].photo = i % photos.length;
  pushHistory();
  rebuildTray();
  redraw();
  statusEl.textContent = 'Every panel filled.';
});

// ---------- lettering controls ----------
const titleInput = document.getElementById('titleInput');
const subtitleInput = document.getElementById('subtitleInput');
const titleYInput = document.getElementById('titleY');
const badgeSelect = document.getElementById('badgeSelect');

titleInput.addEventListener('input', () => { state.title = titleInput.value; redraw(); });
titleInput.addEventListener('change', pushHistory);
subtitleInput.addEventListener('input', () => { state.subtitle = subtitleInput.value; redraw(); });
subtitleInput.addEventListener('change', pushHistory);
titleYInput.addEventListener('input', () => { state.titleY = Number(titleYInput.value); redraw(); });
titleYInput.addEventListener('change', pushHistory);
badgeSelect.addEventListener('change', () => { state.badge = badgeSelect.value; pushHistory(); redraw(); });
document.getElementById('grainToggle').addEventListener('change', (e) => { state.grain = e.target.checked; pushHistory(); redraw(); });
document.getElementById('vignetteToggle').addEventListener('change', (e) => { state.vignette = e.target.checked; pushHistory(); redraw(); });

let ideaIndex = 0;
document.getElementById('titleIdea').addEventListener('click', () => {
  ideaIndex = (ideaIndex + 1) % TITLE_IDEAS.length;
  state.title = TITLE_IDEAS[ideaIndex];
  titleInput.value = state.title;
  pushHistory();
  redraw();
});

// ---------- canvas interaction: select, drag to crop, wheel to zoom, drag title ----------
function canvasPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    fx: (e.clientX - rect.left) / rect.width,
    fy: (e.clientY - rect.top) / rect.height,
  };
}

function hitPanel(fx, fy) {
  const layout = LAYOUTS[state.layout];
  for (let i = 0; i < layout.panels; i++) {
    const [x, y, w, h] = panelRect(state.layout, i);
    if (fx >= x && fx <= x + w && fy >= y && fy <= y + h) return i;
  }
  return -1;
}

let drag = null; // { mode: 'pan' | 'title', panel, startX, startY, ox, oy, titleY }

canvas.addEventListener('pointerdown', (e) => {
  const { fx, fy } = canvasPoint(e);
  const titleBottom = state.titleY / 100;
  const titleBandTop = titleBottom - 0.17;
  if (state.title && fy >= titleBandTop && fy <= titleBottom + 0.02 && fx >= 0.03 && fx <= 0.97) {
    drag = { mode: 'title', startY: fy, titleY: state.titleY };
  } else {
    const panelIndex = hitPanel(fx, fy);
    if (panelIndex < 0) return;
    state.selected = panelIndex;
    rebuildGradePicker();
    rebuildTray();
    redraw();
    const panel = state.panels[panelIndex];
    drag = { mode: 'pan', panel: panelIndex, startX: fx, startY: fy, ox: panel.ox, oy: panel.oy };
  }
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const { fx, fy } = canvasPoint(e);
  if (drag.mode === 'title') {
    state.titleY = Math.min(94, Math.max(55, drag.titleY + (fy - drag.startY) * 100));
    titleYInput.value = String(Math.round(state.titleY));
  } else {
    const [x, y, w, h] = panelRect(state.layout, drag.panel);
    const panel = state.panels[drag.panel];
    panel.ox = Math.min(0.6, Math.max(-0.6, drag.ox + (fx - drag.startX) / w));
    panel.oy = Math.min(0.6, Math.max(-0.6, drag.oy + (fy - drag.startY) / h));
  }
  redraw();
});

canvas.addEventListener('pointerup', () => {
  if (!drag) return;
  drag = null;
  pushHistory();
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const { fx, fy } = canvasPoint(e);
  const panelIndex = hitPanel(fx, fy);
  if (panelIndex < 0) return;
  state.selected = panelIndex;
  const panel = state.panels[panelIndex];
  panel.zoom = Math.min(4, Math.max(1, panel.zoom * Math.exp(-e.deltaY * 0.0012)));
  rebuildGradePicker();
  redraw();
}, { passive: false });

// ---------- export ----------
document.getElementById('exportBtn').addEventListener('click', async () => {
  statusEl.textContent = 'Rendering PNG…';
  const blob = await exportCoverPNG(state, photos);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `neon-vice-cover-${state.size.w}x${state.size.h}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
  statusEl.textContent = `Saved ${a.download} (${Math.round(blob.size / 1024)} KB).`;
});

// ---------- controls sync ----------
function syncAllControls() {
  titleInput.value = state.title;
  subtitleInput.value = state.subtitle;
  titleYInput.value = String(Math.round(state.titleY));
  badgeSelect.value = state.badge;
  document.getElementById('grainToggle').checked = state.grain;
  document.getElementById('vignetteToggle').checked = state.vignette;
  rebuildLayoutPicker();
  rebuildGradePicker();
  rebuildSizePicker();
  rebuildTray();
}

// ---------- shot-mode API (used by shots.js) ----------
const appApi = {
  state: () => state,
  photos: () => photos,
  setState(patch) {
    state = { ...state, ...patch, size: { ...(patch.size || state.size) } };
    if (patch.panels) state.panels = patch.panels;
    syncAllControls();
    redraw();
  },
  async loadSamples() {
    await loadSamplePhotos();
    return photos;
  },
  redraw,
  async exportInfo() {
    const blob = await exportCoverPNG(state, photos);
    return { bytes: blob.size, width: state.size.w, height: state.size.h, type: blob.type };
  },
};

// ---------- boot ----------
async function boot() {
  rebuildLayoutPicker();
  rebuildGradePicker();
  rebuildSizePicker();
  try {
    await Promise.all([
      document.fonts.load('100px Anton'),
      document.fonts.load('60px Pacifico'),
      document.fonts.ready,
    ]);
  } catch { /* fall back to system fonts if a font file fails to load */ }
  window.__fontsReady = true;

  const query = new URLSearchParams(location.search);
  const shot = query.get('shot');
  if (shot) {
    await runShot(shot, query, appApi);
  } else {
    await loadSamplePhotos();
    state.panels.forEach((p, i) => { p.photo = i % 2; });
    rebuildTray();
    redraw();
  }
  pushHistory();
}

boot();
