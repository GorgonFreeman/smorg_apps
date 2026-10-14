export type Route =
  | { name: 'login' }
  | { name: 'hub' }
  | { name: 'gallery' }
  | { name: 'consent', slug: string }
  | { name: 'app', slug: string, rest: string }

export function parseRoute(pathname = window.location.pathname): Route {
  if (pathname === '/login') {
    return { name: 'login' }
  }
  if (pathname === '/' || pathname === '/hub') {
    return { name: 'hub' }
  }
  if (pathname === '/gallery') {
    return { name: 'gallery' }
  }
  const consent = pathname.match(/^\/gallery\/([^/]+)\/consent\/?$/)
  if (consent) {
    return { name: 'consent', slug: decodeURIComponent(consent[1]) }
  }
  const app = pathname.match(/^\/apps\/([^/]+)(\/.*)?$/)
  if (app) {
    return {
      name: 'app',
      slug: decodeURIComponent(app[1]),
      rest: app[2] ?? '',
    }
  }
  return { name: 'hub' }
}

export function navigate(path: string) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
