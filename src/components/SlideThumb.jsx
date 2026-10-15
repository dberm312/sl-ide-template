import { PAGE } from './page.js';

// A page rendered small — used by the sorter grid, the rail and the viewer.
// `zoom` (not transform) so the child's layout reflows
// exactly as it does at full size; a transform would scale a wrong layout.
export default function SlideThumb({ Component, componentProps = {}, widthPx = 240 }) {
  return (
    <div
      className="thumb"
      style={{ width: widthPx, height: widthPx * (PAGE.h / PAGE.w), overflow: 'hidden' }}
    >
      <div style={{ zoom: widthPx / PAGE.w }}>
        <Component {...componentProps} />
      </div>
    </div>
  );
}
