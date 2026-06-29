/** Skip the next Suppliers-tab focus reset (e.g. after sharing an order and opening chat). */
let skipNextFocusReset = false;

export function requestSkipSuppliersTabFocusReset(): void {
  skipNextFocusReset = true;
}

export function consumeSkipSuppliersTabFocusReset(): boolean {
  if (!skipNextFocusReset) return false;
  skipNextFocusReset = false;
  return true;
}
