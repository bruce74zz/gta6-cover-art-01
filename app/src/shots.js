// Fixed scenes for screenshots and headless checks.
//   ?shot=cover  — cover only, full-frame (controls hidden).
//   ?shot=editor — the editor with a sample photo loaded.
//   ?shot=exporttest — renders the full-resolution export offscreen and stores
//     its size on window.__exportInfo (no download, for automated checks).
// Shared query params: photo=pier|boulevard|both, caption, subtitle, layout,
// grade (applies to every panel), size=square|portrait|wide, badge, titleY.
// window.__shotReady is set once the scene is painted.
import { LAYOUTS, SIZES } from './layouts.js';
import { GRADE_IDS } from './grades.js';

function assignPhotos(app, which) {
  const count = LAYOUTS[app.state().layout].panels;
  const panels = app.state().panels.map((p) => ({ ...p }));
  for (let i = 0; i < count; i++) {
    if (which === 'pier') panels[i].photo = 0;
    else if (which === 'boulevard') panels[i].photo = 1;
    else panels[i].photo = i % 2; // 'both': alternate the two samples
  }
  return panels;
}

export async function runShot(shot, query, app) {
  await app.loadSamples();

  const patch = {};
  const layout = query.get('layout');
  if (layout && LAYOUTS[layout]) patch.layout = layout;
  const size = query.get('size');
  if (size && SIZES[size]) { patch.sizeId = size; patch.size = { ...SIZES[size] }; }
  const caption = query.get('caption');
  if (caption !== null) patch.title = caption;
  const subtitle = query.get('subtitle');
  if (subtitle !== null) patch.subtitle = subtitle;
  const titleY = query.get('titleY');
  if (titleY !== null && Number.isFinite(Number(titleY))) patch.titleY = Number(titleY);
  const badge = query.get('badge');
  if (badge) patch.badge = badge;
  const panY = query.get('oy');
  const zoom = query.get('zoom');

  // Apply layout/size/text first so panel assignment uses the right layout.
  app.setState(patch);
  const grade = query.get('grade');
  const panels = assignPhotos(app, query.get('photo') ?? 'both');
  if (grade && GRADE_IDS.includes(grade)) {
    for (const p of panels) p.grade = grade;
  }
  // Optional framing for a shot: oy shifts every panel's crop toward the top
  // of the photo (positive values), zoom scales every panel's photo.
  if (panY !== null && Number.isFinite(Number(panY))) {
    for (const p of panels) p.oy = Number(panY);
  }
  if (zoom !== null && Number.isFinite(Number(zoom))) {
    for (const p of panels) p.zoom = Number(zoom);
  }
  app.setState({ panels });

  if (shot === 'cover') document.body.classList.add('shot-cover');
  if (shot === 'editor') document.body.classList.add('shot-editor');

  if (shot === 'exporttest') {
    window.__exportInfo = await app.exportInfo();
  }

  app.redraw();
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__shotReady = true; }));
}
