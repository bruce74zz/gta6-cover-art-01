// Draws the whole cover onto a canvas: photo panels with per-panel colour
// grades, film grain, vignette, big Anton title lettering with a Pacifico
// subtitle, and an optional corner badge. Pure canvas 2D — no network, no libs.
import { GRADES, buildGradeLookup, applyGradeToImageData } from './grades.js';
import { LAYOUTS, panelRect } from './layouts.js';

const gradeLookups = new Map();
function lookupFor(gradeId) {
  if (!gradeLookups.has(gradeId)) gradeLookups.set(gradeId, buildGradeLookup(GRADES[gradeId]));
  return gradeLookups.get(gradeId);
}

let grainPattern = null;
/** A reusable 128x128 noise tile for the film-grain overlay. */
function getGrainPattern(ctx) {
  if (grainPattern) return grainPattern;
  const tile = document.createElement('canvas');
  tile.width = 128; tile.height = 128;
  const tctx = tile.getContext('2d');
  const img = tctx.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 96 + Math.floor(Math.random() * 160);
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  tctx.putImageData(img, 0, 0);
  grainPattern = ctx.createPattern(tile, 'repeat');
  return grainPattern;
}

/**
 * Draws one photo into a panel rect (pixel coords), cover-fit with the panel's
 * zoom and pan, then applies the panel's colour grade.
 */
function drawPanel(ctx, photo, panel, px, py, pw, ph) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, pw, ph);
  ctx.clip();
  if (!photo) {
    const g = ctx.createLinearGradient(px, py, px + pw, py + ph);
    g.addColorStop(0, '#3b1a5e');
    g.addColorStop(1, '#1a0b2e');
    ctx.fillStyle = g;
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.setLineDash([pw * 0.03, pw * 0.02]);
    ctx.lineWidth = Math.max(2, pw * 0.006);
    ctx.strokeRect(px + pw * 0.04, py + ph * 0.04, pw * 0.92, ph * 0.92);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `${Math.max(14, pw * 0.055)}px Anton, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+ ADD PHOTO', px + pw / 2, py + ph / 2);
    ctx.restore();
    return;
  }

  // Render the photo (with grade) on a temp canvas at panel resolution.
  const temp = document.createElement('canvas');
  temp.width = Math.max(2, Math.round(pw));
  temp.height = Math.max(2, Math.round(ph));
  const tctx = temp.getContext('2d');
  const iw = photo.naturalWidth;
  const ih = photo.naturalHeight;
  const base = Math.max(pw / iw, ph / ih);
  const scale = base * (panel.zoom || 1);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (pw - dw) / 2 + (panel.ox || 0) * pw;
  const dy = (ph - dh) / 2 + (panel.oy || 0) * ph;
  tctx.drawImage(photo, dx, dy, dw, dh);

  const grade = GRADES[panel.grade] || GRADES.none;
  if (grade.stops) {
    const data = tctx.getImageData(0, 0, temp.width, temp.height);
    applyGradeToImageData(data, lookupFor(panel.grade), grade.strength);
    tctx.putImageData(data, 0, 0);
  }
  if (grade.overlay) {
    const og = tctx.createLinearGradient(0, 0, 0, temp.height);
    og.addColorStop(0, grade.overlay.from);
    og.addColorStop(1, grade.overlay.to);
    tctx.fillStyle = og;
    tctx.fillRect(0, 0, temp.width, temp.height);
  }
  ctx.drawImage(temp, px, py);
  ctx.restore();
}

/** Wraps `text` into at most two lines that fit `maxWidth` at `fontPx`. */
function wrapTitle(ctx, text, maxWidth, fontPx) {
  ctx.font = `${fontPx}px Anton, sans-serif`;
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width <= maxWidth || !line) line = trial;
    else { lines.push(line); line = word; }
    if (lines.length === 2) break;
  }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}

/** Draws the big title and the script subtitle, fitted to the cover width. */
function drawLettering(ctx, state, W, H) {
  const title = (state.title || '').trim().toUpperCase();
  const subtitle = (state.subtitle || '').trim();
  if (!title && !subtitle) return;

  const maxWidth = W * 0.94;
  let fontPx = Math.round(H * 0.115);
  let lines = title ? wrapTitle(ctx, title, maxWidth, fontPx) : [];
  while (lines.length && ctx.measureText(lines.reduce((a, b) => (a.length > b.length ? a : b))).width > maxWidth && fontPx > 16) {
    fontPx -= 4;
    lines = wrapTitle(ctx, title, maxWidth, fontPx);
  }

  const titleBottom = (state.titleY / 100) * H; // baseline of the last title line
  const lineHeight = fontPx * 1.02;
  const titleTop = titleBottom - lines.length * lineHeight;

  // Subtitle sits just above the title in Pacifico script.
  if (subtitle) {
    let subPx = Math.round(fontPx * 0.42);
    ctx.font = `${subPx}px Pacifico, cursive`;
    while (ctx.measureText(subtitle).width > maxWidth * 0.9 && subPx > 12) {
      subPx -= 2;
      ctx.font = `${subPx}px Pacifico, cursive`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = subPx * 0.25;
    ctx.shadowOffsetY = subPx * 0.06;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(subtitle, W / 2, titleTop - subPx * 0.28);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }

  if (!lines.length) return;
  const fill = ctx.createLinearGradient(0, titleTop, 0, titleBottom);
  fill.addColorStop(0, '#ffe95e');
  fill.addColorStop(0.45, '#ff9a3d');
  fill.addColorStop(1, '#ff2e88');
  ctx.font = `${fontPx}px Anton, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(20,0,40,0.75)';
  ctx.shadowBlur = fontPx * 0.12;
  ctx.shadowOffsetY = fontPx * 0.05;
  lines.forEach((line, i) => {
    const y = titleBottom - (lines.length - 1 - i) * lineHeight;
    ctx.strokeStyle = '#1c0a33';
    ctx.lineWidth = Math.max(3, fontPx * 0.085);
    ctx.strokeText(line, W / 2, y);
    ctx.fillStyle = fill;
    ctx.fillText(line, W / 2, y);
  });
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

/** Draws the corner badge/sticker. `badge` is 'star' | 'est' | 'palm' | 'none'. */
function drawBadge(ctx, badge, W, H) {
  if (!badge || badge === 'none') return;
  const s = Math.min(W, H);
  const cx = W - s * 0.085;
  const cy = s * 0.085;
  const r = s * 0.068;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (badge === 'star') {
    ctx.rotate(-0.12);
    ctx.beginPath();
    const spikes = 12;
    for (let i = 0; i < spikes * 2; i++) {
      const rad = i % 2 === 0 ? r : r * 0.78;
      const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * rad;
      const y = Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = '#ffe95e';
    ctx.strokeStyle = '#1c0a33';
    ctx.lineWidth = Math.max(3, r * 0.08);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1c0a33';
    ctx.font = `${Math.round(r * 0.52)}px Anton, sans-serif`;
    ctx.fillText('VICE', 0, -r * 0.12);
    ctx.font = `${Math.round(r * 0.3)}px Anton, sans-serif`;
    ctx.fillText('★ ★ ★', 0, r * 0.38);
  } else if (badge === 'est') {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ff2e88';
    ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.07);
    ctx.strokeStyle = '#ffe95e';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.round(r * 0.34)}px Anton, sans-serif`;
    ctx.fillText('EST.', 0, -r * 0.22);
    ctx.font = `${Math.round(r * 0.42)}px Anton, sans-serif`;
    ctx.fillText('2026', 0, r * 0.28);
  } else if (badge === 'palm') {
    ctx.rotate(-0.1);
    const w = r * 2.1;
    const h = r * 1.15;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, h * 0.28);
    const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    g.addColorStop(0, '#00e5ff');
    g.addColorStop(1, '#ff2ea6');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.06);
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.round(r * 0.5)}px Anton, sans-serif`;
    ctx.fillText('PALM CITY', 0, 0);
  }
  ctx.restore();
}

/**
 * Draws the cover described by `state` onto `canvas` at the state's export
 * size. `photos` is the array of loaded images; a panel's `photo` is an index
 * into it (or null).
 */
export function drawCover(canvas, state, photos) {
  const { w: W, h: H } = state.size;
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  const ctx = canvas.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#2b103f');
  bg.addColorStop(1, '#12081f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const layout = LAYOUTS[state.layout] || LAYOUTS.hero;
  const count = layout.panels;
  for (let i = 0; i < count; i++) {
    const [fx, fy, fw, fh] = panelRect(state.layout, i);
    const px = fx * W;
    const py = fy * H;
    const pw = fw * W;
    const ph = fh * H;
    const panel = state.panels[i] || { photo: null, grade: 'sunset', zoom: 1, ox: 0, oy: 0 };
    const photo = panel.photo == null ? null : photos[panel.photo] || null;
    drawPanel(ctx, photo, panel, px, py, pw, ph);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(2, W * 0.004);
    ctx.strokeRect(px, py, pw, ph);
  }

  // Sunset wash over the whole cover, strongest at the bottom behind the type.
  const wash = ctx.createLinearGradient(0, H * 0.45, 0, H);
  wash.addColorStop(0, 'rgba(255,46,136,0)');
  wash.addColorStop(1, 'rgba(120,10,90,0.28)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);

  if (state.vignette) {
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(10,0,20,0)');
    vg.addColorStop(1, 'rgba(10,0,20,0.42)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }
  if (state.grain) {
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = getGrainPattern(ctx);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // Soft scrim behind the lettering band so the title stays readable over
  // bright photos, fading out well above the title.
  const scrimTop = Math.max(0, (state.titleY / 100) * H - H * 0.34);
  const scrim = ctx.createLinearGradient(0, scrimTop, 0, H);
  scrim.addColorStop(0, 'rgba(12,0,28,0)');
  scrim.addColorStop(1, 'rgba(12,0,28,0.38)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, scrimTop, W, H - scrimTop);

  drawLettering(ctx, state, W, H);
  drawBadge(ctx, state.badge, W, H);
}

/** Renders the cover at full export resolution and returns a PNG blob. */
export function exportCoverPNG(state, photos) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    drawCover(canvas, state, photos);
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}
