// Cover layouts: each one splits the cover into panels. Rects are fractions of
// the cover (x, y, w, h) with a small gap between panels, so every layout works
// at any export size. `panels` is the number of photo slots the layout uses.

const GAP = 0.014;

/** All layouts the editor offers, in picker order. */
export const LAYOUTS = {
  hero: {
    label: 'Hero + 3',
    panels: 4,
    rects: () => {
      const smallH = 1 - 0.62 - GAP;
      const smallW = (1 - 2 * GAP) / 3;
      return [
        [0, 0, 1, 0.62],
        [0, 0.62 + GAP, smallW, smallH],
        [smallW + GAP, 0.62 + GAP, smallW, smallH],
        [2 * (smallW + GAP), 0.62 + GAP, smallW, smallH],
      ];
    },
  },
  grid: {
    label: '2 × 2 Grid',
    panels: 4,
    rects: () => {
      const w = (1 - GAP) / 2;
      const h = (1 - GAP) / 2;
      return [
        [0, 0, w, h],
        [w + GAP, 0, w, h],
        [0, h + GAP, w, h],
        [w + GAP, h + GAP, w, h],
      ];
    },
  },
  nine: {
    label: '9-Panel Cover',
    panels: 9,
    rects: () => {
      const cell = (1 - 2 * GAP) / 3;
      const rects = [];
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          rects.push([col * (cell + GAP), row * (cell + GAP), cell, cell]);
        }
      }
      return rects;
    },
  },
  full: {
    label: 'Full Bleed',
    panels: 1,
    rects: () => [[0, 0, 1, 1]],
  },
  duo: {
    label: 'Split Duo',
    panels: 2,
    rects: () => {
      const w = (1 - GAP) / 2;
      return [[0, 0, w, 1], [w + GAP, 0, w, 1]];
    },
  },
};

export const LAYOUT_IDS = ['hero', 'grid', 'nine', 'full', 'duo'];

/** Export sizes the app offers (width x height in pixels). */
export const SIZES = {
  square: { label: 'Square · 1080 × 1080', w: 1080, h: 1080 },
  portrait: { label: 'Portrait · 1080 × 1350', w: 1080, h: 1350 },
  wide: { label: 'Wide · 1920 × 1080', w: 1920, h: 1080 },
};

export const SIZE_IDS = ['square', 'portrait', 'wide'];

/** Returns the panel rect (fractions) for a layout id and panel index. */
export function panelRect(layoutId, index) {
  return LAYOUTS[layoutId].rects()[index];
}
