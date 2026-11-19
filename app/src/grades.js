// Colour grades: gradient-map (duotone) looks applied per panel via a luminance
// lookup table, plus a warm overlay tint. Each grade is a list of [stop, hex]
// colour stops from shadow to highlight, a blend strength, and an overlay.

/** The grades the editor offers, in picker order. `none` keeps the photo natural. */
export const GRADES = {
  none: {
    label: 'Original',
    swatch: '#8d76ad',
    stops: null,
    strength: 0,
    overlay: null,
  },
  sunset: {
    label: 'Vice Sunset',
    swatch: 'linear-gradient(90deg,#2a0f4a,#ff2e88,#ff9a3d)',
    stops: [
      [0.0, '#160a2e'],
      [0.35, '#7a1e6e'],
      [0.62, '#ff2e88'],
      [0.82, '#ff9a3d'],
      [1.0, '#ffe9a8'],
    ],
    strength: 0.78,
    overlay: { from: 'rgba(255,110,60,0)', to: 'rgba(255,60,140,0.22)' },
  },
  neon: {
    label: 'Neon Nights',
    swatch: 'linear-gradient(90deg,#050510,#1b2a6b,#00e5ff)',
    stops: [
      [0.0, '#04040f'],
      [0.3, '#141a4d'],
      [0.55, '#1b6fd4'],
      [0.8, '#00e5ff'],
      [1.0, '#ff2ea6'],
    ],
    strength: 0.82,
    overlay: { from: 'rgba(0,229,255,0)', to: 'rgba(255,46,166,0.20)' },
  },
  dusk: {
    label: 'Palm Dusk',
    swatch: 'linear-gradient(90deg,#062a2a,#0f766e,#ff6b4a)',
    stops: [
      [0.0, '#041f1f'],
      [0.35, '#0f5e55'],
      [0.62, '#2fa08a'],
      [0.85, '#ff6b4a'],
      [1.0, '#ffd9a0'],
    ],
    strength: 0.75,
    overlay: { from: 'rgba(15,118,110,0)', to: 'rgba(255,107,74,0.18)' },
  },
  noir: {
    label: 'Mono Noir',
    swatch: 'linear-gradient(90deg,#000,#666,#fff)',
    stops: [
      [0.0, '#000000'],
      [0.4, '#3a3a3a'],
      [0.75, '#b8b8b8'],
      [1.0, '#ffffff'],
    ],
    strength: 0.9,
    overlay: null,
  },
};

export const GRADE_IDS = ['none', 'sunset', 'neon', 'dusk', 'noir'];

/** Parses a #rrggbb colour into [r, g, b]. */
function parseHex(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** Builds a 256-entry [r, g, b] lookup table for a grade's gradient stops. */
export function buildGradeLookup(grade) {
  const table = new Array(256);
  const stops = grade.stops.map(([t, hex]) => [t, parseHex(hex)]);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let a = stops[0];
    let b = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s++) {
      if (t >= stops[s][0] && t <= stops[s + 1][0]) { a = stops[s]; b = stops[s + 1]; break; }
    }
    const span = b[0] - a[0] || 1;
    const f = Math.min(1, Math.max(0, (t - a[0]) / span));
    table[i] = [
      Math.round(a[1][0] + (b[1][0] - a[1][0]) * f),
      Math.round(a[1][1] + (b[1][1] - a[1][1]) * f),
      Math.round(a[1][2] + (b[1][2] - a[1][2]) * f),
    ];
  }
  return table;
}

/**
 * Applies a grade in place to an ImageData block: luminance through the
 * gradient map, blended back toward the original photo by `strength`.
 */
export function applyGradeToImageData(imageData, lookup, strength) {
  const d = imageData.data;
  const s = strength;
  const inv = 1 - s;
  for (let i = 0; i < d.length; i += 4) {
    const lum = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
    const g = lookup[lum];
    d[i] = Math.round(d[i] * inv + g[0] * s);
    d[i + 1] = Math.round(d[i + 1] * inv + g[1] * s);
    d[i + 2] = Math.round(d[i + 2] * inv + g[2] * s);
  }
}
