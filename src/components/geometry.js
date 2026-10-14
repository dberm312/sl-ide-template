import { PX_PER_IN } from '../deck/content.js';

// Region boxes are [x, y, w, h] in inches; the page is 1280 px wide, 96 px/in.
export function box([x, y, w, h]) {
  return {
    left: Math.round(x * PX_PER_IN * 10) / 10,
    top: Math.round(y * PX_PER_IN * 10) / 10,
    width: Math.round(w * PX_PER_IN * 10) / 10,
    height: Math.round(h * PX_PER_IN * 10) / 10,
  };
}
