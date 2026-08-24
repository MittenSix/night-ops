export const ROUTES = Object.freeze({
  home: { title: 'Night Ops Training', public: true, nav: 'Home' },
  training: { title: 'Training · Night Ops', public: false, nav: 'Training' },
  skill: { title: 'Skill lesson · Night Ops', public: false, parent: 'training' },
  packing: { title: 'Packing list · Night Ops', public: false, nav: 'Packing list' },
  progress: { title: 'My progress · Night Ops', public: false, nav: 'My progress' },
  leader: { title: 'Night Ops team · Night Ops', public: false, nav: 'Night Ops leads' },
  about: { title: 'About · Night Ops', public: true, nav: 'About Night Ops' },
  settings: { title: 'Account · Night Ops', public: true, nav: 'Account' }
});

export const DEFAULT_ROUTE = 'home';

export function normalizeRoute(value) {
  const route = String(value || '').replace(/^#\/?/, '').split(/[?&]/, 1)[0];
  return Object.hasOwn(ROUTES, route) ? route : DEFAULT_ROUTE;
}

export function canonicalPreviewRoute(route) {
  const normalized = normalizeRoute(route);
  return ROUTES[normalized].parent || normalized;
}

export function routeTitle(route) {
  return ROUTES[normalizeRoute(route)].title;
}

export function resolveRoute(route, authenticated) {
  const requested = normalizeRoute(route);
  const definition = ROUTES[requested];
  if (authenticated || definition.public) {
    return { requested, rendered: requested, preview: false, intended: null };
  }

  const intended = canonicalPreviewRoute(requested);
  return { requested: intended, rendered: 'access', preview: true, intended };
}
