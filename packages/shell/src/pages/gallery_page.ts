import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { SmorgElement } from '@smorg/ui'
import { listApps, listInstalled, type AppInfo } from '../api.js'
import { navigate } from '../router.js'

@customElement('smorg-gallery-page')
export class GalleryPage extends SmorgElement {
  @state() private apps: AppInfo[] = []
  @state() private installed = new Set<string>()
  @state() private error = ''

  connectedCallback() {
    super.connectedCallback()
    void this.load()
  }

  private async load() {
    const [all, mine] = await Promise.all([listApps(), listInstalled()])
    if (!all.ok || !all.data) {
      this.error = all.error?.message ?? 'Could not load gallery'
      return
    }
    this.apps = all.data
    this.installed = new Set((mine.data ?? []).map((a) => a.slug))
  }

  render() {
    return html`
      <div class="p-6 max-w-3xl mx-auto">
        <h1 class="text-3xl font-bold mb-2">Gallery</h1>
        <p class="opacity-70 mb-8">Every app on the platform</p>

        ${ this.error ? html`<p class="text-error">${ this.error }</p>` : null }

        <ul class="space-y-3">
          ${ this.apps.map((app) => {
            const isInstalled = this.installed.has(app.slug)
            return html`
              <li
                class="flex items-center justify-between gap-4 border border-base-300 rounded-lg px-4 py-3 bg-base-100 ${ isInstalled ? 'opacity-50' : '' }"
              >
                <button
                  class="text-left flex-1"
                  @click=${ () => navigate(`/apps/${ app.slug }`) }
                >
                  <span class="font-medium">
                    ${ app.name }${ isInstalled ? ' ✓' : '' }
                  </span>
                </button>
                ${ isInstalled
                  ? html`<span class="text-sm opacity-70">Installed</span>`
                  : html`
                    <button
                      class="btn btn-sm btn-primary"
                      @click=${ () => navigate(`/gallery/${ app.slug }/consent`) }
                    >
                      Add
                    </button>
                  ` }
              </li>
            `
          }) }
        </ul>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'smorg-gallery-page': GalleryPage
  }
}
