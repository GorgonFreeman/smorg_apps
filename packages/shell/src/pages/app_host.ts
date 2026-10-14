import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { SmorgElement } from '@smorg/ui'
import type { User } from '../api.js'

type AppModule = {
  mount: (host: HTMLElement, ctx: { user: User | null }) => void | Promise<void>
}

const loaders: Record<string, () => Promise<AppModule>> = {
  core: () => import('@smorg/core/client'),
}

@customElement('smorg-app-host')
export class AppHost extends SmorgElement {
  @property() slug = ''
  @property({ attribute: false }) user: User | null = null

  @state() private error = ''

  private mountedFor = ''

  protected updated() {
    if (this.slug && this.slug !== this.mountedFor) {
      void this.mountApp()
    }
  }

  private async mountApp() {
    this.mountedFor = this.slug
    this.error = ''
    const load = loaders[this.slug]
    if (!load) {
      this.error = `Unknown app: ${ this.slug }`
      return
    }
    const host = this.renderRoot.querySelector('#app-root') as HTMLElement | null
    if (!host) {
      return
    }
    host.replaceChildren()
    try {
      const mod = await load()
      await mod.mount(host, { user: this.user })
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Failed to load app'
    }
  }

  render() {
    return html`
      <div class="p-0">
        ${ this.error ? html`<p class="p-6 text-error">${ this.error }</p>` : null }
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
