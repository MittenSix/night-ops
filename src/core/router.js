import { DEFAULT_ROUTE, normalizeRoute, resolveRoute, routeTitle } from './routes.js';

export function routeFromLocation(location) {
  return normalizeRoute(location.hash || DEFAULT_ROUTE);
}

export function historyAction(currentRoute, nextRoute, replace = false) {
  const current = String(currentRoute || '').replace(/^#\/?/, '').split(/[?&]/, 1)[0];
  const next = normalizeRoute(nextRoute);
  if (current === next) return 'none';
  return replace ? 'replace' : 'push';
}

export function createRouter({
  window,
  render,
  isAuthenticated,
  onResolved = () => {}
}) {
  let intendedRoute = null;
  let started = false;

  function commitUrl(route, replace) {
    const action = historyAction(window.location.hash, route, replace);
    if (action === 'none') return;
    window.history[action === 'replace' ? 'replaceState' : 'pushState'](null, '', `#${route}`);
  }

  function navigate(route, { replace = false, rememberIntent = true } = {}) {
    const resolved = resolveRoute(route, isAuthenticated());
    if (resolved.preview && rememberIntent) intendedRoute = resolved.intended;
    if (!resolved.preview && resolved.requested !== 'settings') intendedRoute = null;

    commitUrl(resolved.requested, replace);
    window.document.title = routeTitle(resolved.requested);
    render(resolved);
    onResolved(resolved);
    return resolved;
  }

  function handleHistory() {
    navigate(routeFromLocation(window.location), { replace: true });
  }

  function start() {
    if (started) return;
    started = true;
    window.addEventListener('hashchange', handleHistory);
    window.addEventListener('popstate', handleHistory);
    navigate(routeFromLocation(window.location), { replace: true });
  }

  function authChanged(authenticated) {
    if (authenticated) {
      const destination = intendedRoute || routeFromLocation(window.location);
      intendedRoute = null;
      return navigate(destination, { replace: true, rememberIntent: false });
    }
    return navigate(routeFromLocation(window.location), { replace: true });
  }

  function destroy() {
    window.removeEventListener('hashchange', handleHistory);
    window.removeEventListener('popstate', handleHistory);
    started = false;
  }

  return { start, navigate, authChanged, destroy, getIntendedRoute: () => intendedRoute };
}
