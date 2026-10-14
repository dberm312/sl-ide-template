// A slide rendered small — used by the sorter grid.
// `zoom` (not transform) so the child's layout reflows
// exactly as it does at full size; a transform would scale a wrong layout.
export default function SlideThumb({ Component, componentProps = {}, widthPx = 240 }) {
  return (
    <div
      className="thumb"
      style={{ width: widthPx, height: widthPx * (720 / 1280), overflow: 'hidden' }}
    >
      <div style={{ zoom: widthPx / 1280 }}>
        <Component {...componentProps} />
      </div>
    </div>
  );
}
