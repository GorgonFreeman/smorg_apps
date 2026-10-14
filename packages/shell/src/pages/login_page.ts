import { html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { SmorgElement } from '@smorg/ui'
import { requestCode, verifyCode, type User } from '../api.js'

@customElement('smorg-login-page')
export class LoginPage extends SmorgElement {
  @property({ attribute: false }) onAuthed?: (user: User) => void

  @state() private email = ''
  @state() private code = ''
  @state() private step: 'email' | 'code' = 'email'
  @state() private message = ''
  @state() private error = ''
  @state() private busy = false

  private async sendCode(event: Event) {
    event.preventDefault()
    this.busy = true
    this.error = ''
    const result = await requestCode(this.email)
    this.busy = false
    if (!result.ok) {
      this.error = result.error?.message ?? 'Could not send code'
      return
    }
    this.message = 'If that email is valid, a code is on its way'
    this.step = 'code'
  }

  private async verify(event: Event) {
    event.preventDefault()
    this.busy = true
    this.error = ''
    const result = await verifyCode(this.email, this.code)
    this.busy = false
    if (!result.ok || !result.data?.user) {
      this.error = result.error?.message ?? 'Invalid code'
      return
    }
    this.onAuthed?.(result.data.user)
  }

  render() {
    return html`
      <div class="hero min-h-screen">
        <div class="hero-content flex-col">
          <h1 class="text-4xl font-bold">Smorg Apps</h1>
          <p class="opacity-70">Sign in with a one-time code</p>

          ${ this.step === 'email' ? html`
            <form class="card bg-base-100 w-full max-w-sm shadow-none border border-base-300" @submit=${ this.sendCode }>
              <div class="card-body gap-3">
                <label class="form-control w-full">
                  <span class="label-text">Email</span>
                  <input
                    class="input input-bordered w-full"
                    type="email"
                    required
                    .value=${ this.email }
                    @input=${ (e: Event) => { this.email = (e.target as HTMLInputElement).value } }
                  />
                </label>
                ${ this.error ? html`<p class="text-error text-sm">${ this.error }</p>` : null }
                <button class="btn btn-primary" ?disabled=${ this.busy }>
                  ${ this.busy ? 'Sending…' : 'Send code' }
                </button>
              </div>
            </form>
          ` : html`
            <form class="card bg-base-100 w-full max-w-sm shadow-none border border-base-300" @submit=${ this.verify }>
              <div class="card-body gap-3">
                <p class="text-sm opacity-70">${ this.message }</p>
                <label class="form-control w-full">
                  <span class="label-text">Code</span>
                  <input
                    class="input input-bordered w-full"
                    inputmode="numeric"
                    autocomplete="one-time-code"
                    required
                    .value=${ this.code }
                    @input=${ (e: Event) => { this.code = (e.target as HTMLInputElement).value } }
                  />
                </label>
                ${ this.error ? html`<p class="text-error text-sm">${ this.error }</p>` : null }
                <button class="btn btn-primary" ?disabled=${ this.busy }>
                  ${ this.busy ? 'Checking…' : 'Verify' }
                </button>
                <button
                  type="button"
                  class="btn btn-ghost btn-sm"
                  @click=${ () => { this.step = 'email'; this.error = '' } }
                >
                  Use a different email
                </button>
              </div>
            </form>
          ` }
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'smorg-login-page': LoginPage
  }
}
