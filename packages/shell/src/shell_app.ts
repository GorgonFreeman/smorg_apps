import { html, nothing } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { setSharedStyles, SmorgElement } from '@smorg/ui'
import styles from './styles.css?inline'
import { getMe, logout, type User } from './api.js'

setSharedStyles(styles)
import { navigate, parseRoute, type Route } from './router.js'
import './pages/login_page.ts'
import './pages/hub_page.ts'
import './pages/gallery_page.ts'
import './pages/consent_page.ts'
import './pages/app_host.ts'
import './pages/public_itinerarium_page.ts'

@customElement('smorg-shell')
export class ShellApp extends SmorgElement {
  @state() private user: User | null = null
  @state() private loading = true
  @state() private route: Route = parseRoute()

  connectedCallback() {
    super.connectedCallback()
    window.addEventListener('popstate', this.onPopState)
    void this.bootstrap()
  }

  disconnectedCallback() {
    window.removeEventListener('popstate', this.onPopState)
    super.disconnectedCallback()
  }

  private onPopState = () => {
    this.route = parseRoute()
    void this.ensureAuth()
  }

  private async bootstrap() {
    await this.ensureAuth()
    this.loading = false
  }

  private async ensureAuth() {
    const me = await getMe()
    this.user = me.ok && me.data ? me.data : null
    const onLogin = this.route.name === 'login'
    const publicRoute = this.route.name === 'publicItinerarium'
    if (!this.user && !onLogin && !publicRoute) {
      navigate('/login')
      this.route = parseRoute()
      return
    }
    if (this.user && onLogin) {
      navigate('/hub')
      this.route = parseRoute()
    }
  }

  private async onLogout() {
    await logout()
    this.user = null
    navigate('/login')
    this.route = parseRoute()
  }

  private onAuthed = (user: User) => {
    this.user = user
    navigate('/hub')
    this.route = parseRoute()
  }

  render() {
    if (this.loading) {
      return html`<div class="p-8">Loading…</div>`
    }

    const showNav = this.user
      && this.route.name !== 'login'
      && this.route.name !== 'publicItinerarium'

    return html`
      <div class="min-h-screen flex flex-col">
        ${ showNav ? html`
          <header class="navbar bg-base-100 border-b border-base-300 px-4">
            <div class="flex-1 gap-4">
              <button class="btn btn-ghost text-xl" @click=${ () => navigate('/hub') }>
                Smorg
              </button>
              <button class="btn btn-ghost btn-sm" @click=${ () => navigate('/hub') }>Hub</button>
              <button class="btn btn-ghost btn-sm" @click=${ () => navigate('/gallery') }>Gallery</button>
            </div>
            <div class="flex-none gap-2 items-center">
              <span class="text-sm opacity-70">${ this.user?.email }</span>
              <button class="btn btn-outline btn-sm" @click=${ () => this.onLogout() }>
                Log out
              </button>
            </div>
          </header>
        ` : nothing }

        <main class="flex-1">
          ${ this.renderPage() }
        </main>
      </div>
    `
  }

  private renderPage() {
    switch (this.route.name) {
      case 'login':
        return html`<smorg-login-page .onAuthed=${ this.onAuthed }></smorg-login-page>`
      case 'hub':
        return html`<smorg-hub-page></smorg-hub-page>`
      case 'gallery':
        return html`<smorg-gallery-page></smorg-gallery-page>`
      case 'consent':
        return html`<smorg-consent-page slug=${ this.route.slug }></smorg-consent-page>`
      case 'app':
        return html`
          <smorg-app-host
            slug=${ this.route.slug }
            .user=${ this.user }
          ></smorg-app-host>
        `
      case 'publicItinerarium':
        return html`
          <smorg-public-itinerarium-page token=${ this.route.token }></smorg-public-itinerarium-page>
        `
      default:
        return nothing
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'smorg-shell': ShellApp
  }
}
