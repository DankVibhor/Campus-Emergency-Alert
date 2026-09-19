/**
 * Creator attribution.
 *
 * Rendered once, here, as the last thing inside <main> in the root layout -
 * not duplicated per page - so it appears at the end of every page's content
 * automatically. `pb-nav` on <main> already reserves space for the fixed
 * Call Security / bottom nav bar, so this sits above that bar rather than
 * underneath or behind it, and never overlaps an emergency action.
 */
export default function CreatorFooter() {
  return (
    <footer className="px-safe py-6 text-center">
      <p className="text-xs font-medium text-slate-400">
        Made with <span aria-hidden="true">❤️</span>
        <span className="sr-only">love</span> Vibhor Mehta
      </p>
    </footer>
  );
}
