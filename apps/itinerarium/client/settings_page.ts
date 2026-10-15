import { html, nothing } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { SmorgElement } from '@smorg/ui'
import { clearDriveSettings, getSettings, saveDriveSettings } from './api.js'
import { appNavigate } from './nav.js'

@customElement('itinerarium-settings')
export class SettingsPage extends SmorgElement {
  @state() private configured = false
  @state() private clientEmail: string | null = null
  @state() private json = ''
  @state() private error = ''
  @state() private message = ''

  connectedCallback() {
    super.connectedCallback()
    void this.reload()
  }

  private async reload() {
    const result = await getSettings()
    if (!result.ok || !result.data) {
      this.error = result.error?.message ?? 'Could not load settings'
      return
    }
    this.configured = result.data.configured
    this.clientEmail = result.data.clientEmail
  }

  private async save(event: Event) {
    event.preventDefault()
    this.error = ''
    this.message = ''
    const result = await saveDriveSettings(this.json)
    if (!result.ok || !result.data) {
      this.error = result.error?.message ?? 'Save failed'
      return
    }
    this.configured = result.data.configured
    this.clientEmail = result.data.clientEmail
    this.json = ''
    this.message = 'Drive credentials saved'
  }

  private async clear() {
    if (!confirm('Remove stored Drive credentials?')) {
      return
    }
    const result = await clearDriveSettings()
    if (!result.ok) {
      this.error = result.error?.message ?? 'Could not clear'
      return
    }
    this.configured = false
    this.clientEmail = null
    this.message = 'Credentials cleared'
  }

  render() {
    return html`
      <div class="p-6 max-w-xl mx-auto">
        <button class="btn btn-ghost btn-sm mb-2 -ml-2" @click=${ () => appNavigate('/apps/itinerarium') }>
          ← Trips
        </button>
        <h1 class="text-2xl font-bold mb-4">Settings</h1>

        ${ this.error ? html`<p class="text-error mb-3">${ this.error }</p>` : nothing }
        ${ this.message ? html`<p class="text-success mb-3">${ this.message }</p>` : nothing }

        <section class="space-y-3">
          <h2 class="font-semibold text-lg">Google Drive</h2>
          <p class="text-sm opacity-70">
            Paste a service account JSON key. Share a Drive folder with the service account email
            so uploads can land there. Files are stored in the service account’s Drive if no folder
            is shared.
          </p>
          ${ this.configured ? html`
            <p class="text-sm">
              Status: Connected
              ${ this.clientEmail ? html` as <code class="text-xs">${ this.clientEmail }</code>` : nothing }
            </p>
          ` : html`<p class="text-sm opacity-60">Status: Not configured</p>` }

          <form @submit=${ (e: Event) => void this.save(e) } class="space-y-3">
            <label class="form-control">
              <span class="label-text">Service account JSON</span>
              <textarea class="textarea textarea-bordered font-mono text-xs" rows="8"
                .value=${ this.json }
                @input=${ (e: Event) => { this.json = (e.target as HTMLTextAreaElement).value } }
                placeholder='{ "type": "service_account", ... }'></textarea>
            </label>
            <div class="flex gap-2">
              <button type="submit" class="btn btn-primary" ?disabled=${ !this.json.trim() }>Save</button>
              ${ this.configured ? html`
                <button type="button" class="btn btn-outline btn-error" @click=${ () => void this.clear() }>
                  Clear
                </button>
              ` : nothing }
            </div>
          </form>
        </section>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'itinerarium-settings': SettingsPage
  }
}
