import { html, nothing } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { SmorgElement } from '@smorg/ui'
import { createTrip, listTrips, type Trip } from './api.js'
import { appNavigate } from './nav.js'
import { formatDateRange } from './time_format.js'

@customElement('itinerarium-trips-list')
export class TripsList extends SmorgElement {
  @state() private trips: Trip[] = []
  @state() private error = ''
  @state() private creating = false
  @state() private name = ''
  @state() private startDate = ''
  @state() private endDate = ''

  connectedCallback() {
    super.connectedCallback()
    void this.reload()
  }

  private async reload() {
    const result = await listTrips()
    if (!result.ok || !result.data) {
      this.error = result.error?.message ?? 'Could not load trips'
      return
    }
    this.error = ''
    this.trips = result.data
  }

  private async saveTrip(event: Event) {
    event.preventDefault()
    const result = await createTrip({
      name: this.name,
      startDate: this.startDate || null,
      endDate: this.endDate || null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    })
    if (!result.ok || !result.data) {
      this.error = result.error?.message ?? 'Could not create trip'
      return
    }
    this.creating = false
    this.name = ''
    this.startDate = ''
    this.endDate = ''
    appNavigate(`/apps/itinerarium/trips/${ result.data.id }`)
  }

  render() {
    return html`
      <div class="p-6 max-w-4xl mx-auto">
        <div class="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 class="text-3xl font-bold">Itinerarium</h1>
            <p class="opacity-70">Your trips</p>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-ghost btn-sm" @click=${ () => appNavigate('/apps/itinerarium/settings') }>
              Settings
            </button>
            <button class="btn btn-primary" @click=${ () => { this.creating = true } }>
              New trip
            </button>
          </div>
        </div>

        ${ this.error ? html`<p class="text-error mb-4">${ this.error }</p>` : nothing }

        ${ this.creating ? html`
          <form class="border border-base-300 rounded-lg p-4 mb-6 bg-base-100 space-y-3"
            @submit=${ (e: Event) => void this.saveTrip(e) }>
            <h2 class="font-semibold text-lg">New trip</h2>
            <label class="form-control">
              <span class="label-text">Name</span>
              <input class="input input-bordered" required .value=${ this.name }
                @input=${ (e: Event) => { this.name = (e.target as HTMLInputElement).value } } />
            </label>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label class="form-control">
                <span class="label-text">Start date</span>
                <input type="date" class="input input-bordered" .value=${ this.startDate }
                  @input=${ (e: Event) => { this.startDate = (e.target as HTMLInputElement).value } } />
              </label>
              <label class="form-control">
                <span class="label-text">End date</span>
                <input type="date" class="input input-bordered" .value=${ this.endDate }
                  @input=${ (e: Event) => { this.endDate = (e.target as HTMLInputElement).value } } />
              </label>
            </div>
            <div class="flex gap-2 justify-end">
              <button type="button" class="btn btn-ghost" @click=${ () => { this.creating = false } }>
                Cancel
              </button>
              <button type="submit" class="btn btn-primary">Create</button>
            </div>
          </form>
        ` : nothing }

        ${ this.trips.length === 0 && !this.creating ? html`
          <div class="text-center py-16 opacity-70">
            <p class="mb-4">No trips yet</p>
            <button class="btn btn-primary" @click=${ () => { this.creating = true } }>
              New trip
            </button>
          </div>
        ` : html`
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            ${ this.trips.map((trip) => html`
              <button
                class="text-left rounded-xl border border-base-300 bg-base-100 p-5 hover:border-teal-600 transition-colors"
                @click=${ () => appNavigate(`/apps/itinerarium/trips/${ trip.id }`) }
              >
                <div class="font-semibold text-lg mb-1">${ trip.name }</div>
                <div class="text-sm opacity-70">${ formatDateRange(trip.startDate, trip.endDate) }</div>
                <div class="text-sm opacity-70 mt-2">${ trip.eventCount ?? 0 } events</div>
              </button>
            `) }
          </div>
        ` }
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'itinerarium-trips-list': TripsList
  }
}
