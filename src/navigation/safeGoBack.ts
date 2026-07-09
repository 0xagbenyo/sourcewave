type NavLike = {
  canGoBack?: () => boolean;
  goBack: () => void;
};

/** Pop the stack only when there is a route to return to — avoids blank/dark screens. */
export function safeGoBack(navigation: NavLike): boolean {
  if (navigation.canGoBack?.()) {
    navigation.goBack();
    return true;
  }
  return false;
}
