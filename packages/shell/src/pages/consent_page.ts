import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { SmorgElement } from '@smorg/ui'
import { installApp, listApps, type AppInfo } from '../api.js'
import { navigate } from '../router.js'

@customElement('smorg-consent-page')
export class ConsentPage extends SmorgElement {
  @property() slug = ''

  @state() private app: AppInfo | null = null
  @state() private error = ''
  @state() private busy = false

  connectedCallback() {
    super.connectedCallback()
    void this.load()
  }

  private async load() {
    const result = await listApps()
    this.app = result.data?.find((a) => a.slug === this.slug) ?? null
    if (!this.app) {
      this.error = 'App not found'
    }
  }

  private consentText(app: AppInfo): string {
    if (!app.uses.length) {
      return `${ app.name } does not use shared Core data.`
    }
    const labels = app.uses.map((u) => u.charAt(0).toUpperCase() + u.slice(1))
    return `${ app.name } will use your ${ labels.join(' and ') }.`
  }

  private async accept() {
    this.busy = true
    this.error = ''
    const result = await installApp(this.slug)
    this.busy = false
    if (!result.ok) {
      this.error = result.error?.message ?? 'Install failed'
      return
    }
    navigate(`/apps/${ this.slug }`)
  }

  render() {
    if (!this.app) {
      return html`<div class="p-6">${ this.error || 'Loading…' }</div>`
    }

    return html`
      <div class="p-6 max-w-lg mx-auto">
        <h1 class="text-3xl font-bold mb-4">Add ${ this.app.name }</h1>
        <p class="mb-6">${ this.consentText(this.app) }</p>
        ${ this.error ? html`<p class="text-error mb-4">${ this.error }</p>` : null }
        <div class="flex gap-3">
          <button class="btn btn-primary" ?disabled=${ this.busy } @click=${ () => this.accept() }>
            Accept
          </button>
          <button class="btn btn-ghost" @click=${ () => navigate('/gallery') }>
            Cancel
          </button>
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'smorg-consent-page': ConsentPage
  }
}
