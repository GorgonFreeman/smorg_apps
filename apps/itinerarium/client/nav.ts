export function appNavigate(path: string) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export type AppView =
  | { name: 'list' }
  | { name: 'settings' }
  | { name: 'trip', tripId: string }

export function parseAppPath(pathname = window.location.pathname): AppView {
  const base = '/apps/itinerarium'
  if (!pathname.startsWith(base)) {
    return { name: 'list' }
  }
  const rest = pathname.slice(base.length).replace(/\/$/, '') || ''
  if (rest === '/settings') {
    return { name: 'settings' }
  }
  const trip = rest.match(/^\/trips\/([^/]+)$/)
  if (trip) {
    return { name: 'trip', tripId: decodeURIComponent(trip[1]) }
  }
  return { name: 'list' }
}
