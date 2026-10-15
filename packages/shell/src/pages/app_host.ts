import { html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { SmorgElement } from '@smorg/ui'
import {
  installApp,
  listApps,
  listInstalled,
  type AppInfo,
  type User,
} from '../api.js'
import {
  HUB_BLOB_DEFAULT_COLOR,
  HUB_BLOB_PATH,
  HUB_BLOB_VIEWBOX,
} from '../hub_blob.js'

type AppModule = {
  mount: (host: HTMLElement, ctx: { user: User | null }) => void | Promise<void>
}

const loaders: Record<string, () => Promise<AppModule>> = {
  core: () => import('@smorg/core/client'),
  itinerarium: () => import('@smorg/itinerarium/client'),
}

@customElement('smorg-app-host')
export class AppHost extends SmorgElement {
  @property() slug = ''
  @property({ attribute: false }) user: User | null = null

  @state() private phase: 'loading' | 'needsInstall' | 'ready' | 'error' = 'loading'
  @state() private error = ''
  @state() private installing = false
  @state() private appInfo: AppInfo | null = null

  private mountedFor = ''

  protected updated(changed: Map<string, unknown>) {
    if (changed.has('slug') && this.slug) {
      void this.ensureApp()
    }
  }

  private async ensureApp() {
    this.mountedFor = ''
    this.phase = 'loading'
    this.error = ''
    this.appInfo = null

    const [installed, all] = await Promise.all([listInstalled(), listApps()])
    if (!installed.ok) {
      this.phase = 'error'
      this.error = installed.error?.message ?? 'Could not check installed apps'
      return
    }

    this.appInfo = (all.data ?? []).find((app) => app.slug === this.slug) ?? null

    const isInstalled = (installed.data ?? []).some((app) => app.slug === this.slug)
    if (!isInstalled) {
      this.phase = 'needsInstall'
      return
    }

    this.phase = 'ready'
    await this.mountApp()
  }

  private renderAppMark(app: AppInfo) {
    const fill = app.slug === 'core'
      ? (app.color || HUB_BLOB_DEFAULT_COLOR)
      : (app.color || '#9CA3AF')

    if (app.slug === 'core') {
      return html`
        <svg
          width="160"
          height="108"
          viewBox=${ HUB_BLOB_VIEWBOX }
          aria-hidden="true"
        >
          <path d=${ HUB_BLOB_PATH } fill=${ fill } />
          <text
            x="1000"
            y="720"
            text-anchor="middle"
            dominant-baseline="middle"
            fill="white"
            font-size="180"
            font-family="system-ui, sans-serif"
          >${ app.name }</text>
        </svg>
      `
    }

    return html`
      <svg width="128" height="128" viewBox="0 0 96 96" aria-hidden="true">
        <circle cx="48" cy="48" r="44" fill=${ fill } />
        <text
          x="48"
          y="52"
          text-anchor="middle"
          fill="white"
          font-size="11"
          font-family="system-ui, sans-serif"
        >${ app.name }</text>
      </svg>
    `
  }

  private async mountApp() {
    this.mountedFor = this.slug
    const load = loaders[this.slug]
    if (!load) {
      this.phase = 'error'
      this.error = `Unknown app: ${ this.slug }`
      return
    }
    await this.updateComplete
    const host = this.renderRoot.querySelector('#app-root') as HTMLElement | null
    if (!host) {
      return
    }
    host.replaceChildren()
    try {
      const mod = await load()
      await mod.mount(host, { user: this.user })
    } catch (error) {
      this.phase = 'error'
      this.error = error instanceof Error ? error.message : 'Failed to load app'
    }
  }

  private async onInstall() {
    this.installing = true
    this.error = ''
    const result = await installApp(this.slug)
    this.installing = false
    if (!result.ok) {
      this.error = result.error?.message ?? 'Install failed'
      return
    }
    this.phase = 'ready'
    await this.mountApp()
  }

  render() {
    if (this.phase === 'needsInstall') {
      const name = this.appInfo?.name ?? this.slug
      return html`
        <div class="min-h-[70vh] flex flex-col items-center justify-center gap-6">
          ${ this.appInfo ? this.renderAppMark(this.appInfo) : nothing }
          <p class="text-2xl font-semibold">${ name }</p>
          <button
            class="btn btn-primary"
            ?disabled=${ this.installing }
            @click=${ () => void this.onInstall() }
          >
            ${ this.installing ? 'Installing…' : 'Install' }
          </button>
          ${ this.error ? html`<p class="text-sm opacity-70">${ this.error }</p>` : nothing }
        </div>
      `
    }

    if (this.phase === 'loading') {
      return html`
        <div class="min-h-[70vh] flex items-center justify-center opacity-70">
          Loading…
        </div>
      `
    }

    if (this.phase === 'error') {
      return html`<p class="p-6 opacity-70">${ this.error }</p>`
    }

    return html`
      <div class="p-0">
        <div id="app-root"></div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'smorg-app-host': AppHost
  }
}
