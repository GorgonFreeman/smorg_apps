import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { SmorgElement } from '@smorg/ui'
import { listInstalled, type AppInfo } from '../api.js'
import {
  HUB_BLOB_DEFAULT_COLOR,
  HUB_BLOB_PATH,
  HUB_BLOB_VIEWBOX,
} from '../hub_blob.js'
import { navigate } from '../router.js'

@customElement('smorg-hub-page')
export class HubPage extends SmorgElement {
  @state() private apps: AppInfo[] = []
  @state() private error = ''

  connectedCallback() {
    super.connectedCallback()
    void this.load()
  }

  private async load() {
    const result = await listInstalled()
    if (!result.ok || !result.data) {
      this.error = result.error?.message ?? 'Could not load apps'
      return
    }
    this.apps = result.data
  }

  render() {
    return html`
      <div class="p-6 max-w-5xl mx-auto">
        <div class="flex items-end justify-between gap-4 mb-8">
          <div>
            <h1 class="text-3xl font-bold">Hub</h1>
            <p class="opacity-70">Your installed apps</p>
          </div>
          <button class="btn btn-primary" @click=${ () => navigate('/gallery') }>
            Gallery
          </button>
        </div>

        ${ this.error ? html`<p class="text-error">${ this.error }</p>` : null }

        <div class="flex flex-wrap gap-6">
          ${ this.apps.map((app) => {
            const fill = app.slug === 'core'
              ? (app.color || HUB_BLOB_DEFAULT_COLOR)
              : (app.color || '#9CA3AF')
            return html`
              <button
                class="flex flex-col items-center gap-2"
                @click=${ () => navigate(`/apps/${ app.slug }`) }
              >
                ${ app.slug === 'core' ? html`
                  <svg
                    width="128"
                    height="86"
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
                ` : html`
                  <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
                    <circle cx="48" cy="48" r="44" fill=${ fill } />
                    <text
                      x="48"
                      y="52"
                      text-anchor="middle"
                      fill="white"
                      font-size="12"
                      font-family="system-ui, sans-serif"
                    >${ app.name }</text>
                  </svg>
                ` }
                <span class="font-medium">${ app.name }</span>
              </button>
            `
          }) }
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'smorg-hub-page': HubPage
  }
}
