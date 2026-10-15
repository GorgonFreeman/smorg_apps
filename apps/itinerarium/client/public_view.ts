import { html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { SmorgElement } from '@smorg/ui'
import { getPublicTrip, type DocMeta, type Trip, type TripEvent } from './api.js'
import { renderNotes } from './markdown.js'
import {
  dayKeyInZone,
  formatDayLabel,
  formatInZone,
} from './time_format.js'

@customElement('itinerarium-public-view')
export class PublicView extends SmorgElement {
  @property() token = ''

  @state() private trip: Trip | null = null
  @state() private events: TripEvent[] = []
  @state() private documents: DocMeta[] = []
  @state() private error = ''
  @state() private detail: TripEvent | null = null
  @state() private centred = false

  connectedCallback() {
    super.connectedCallback()
    void this.reload()
  }

  protected updated(changed: Map<string, unknown>) {
    if (changed.has('token') && this.token) {
      void this.reload()
    }
    if (!this.centred && this.trip) {
      requestAnimationFrame(() => {
        const el = this.renderRoot.querySelector('[data-event-block]') as HTMLElement | null
        el?.scrollIntoView({ block: 'center' })
        this.centred = true
      })
    }
  }

  private async reload() {
    if (!this.token) {
      return
    }
    const result = await getPublicTrip(this.token)
    if (!result.ok || !result.data) {
      this.error = result.error?.message ?? 'Share link not found'
      return
    }
    this.error = ''
    this.trip = result.data.trip
    this.events = result.data.events
    this.documents = result.data.documents
    this.centred = false
  }

  private docsFor(eventId: string) {
    return this.documents.filter((d) => d.eventId === eventId)
  }

  render() {
    if (this.error) {
      return html`<div class="p-8 max-w-lg mx-auto"><p class="text-error">${ this.error }</p></div>`
    }
    if (!this.trip) {
      return html`<div class="p-8">Loading…</div>`
    }

    const tz = this.trip.timezone
    let lastDay: string | null = null
    let lastTimedDay: string | null = this.trip.startDate

    return html`
      <div class="min-h-screen bg-base-200">
        <header class="border-b border-base-300 bg-base-100 px-4 py-4">
          <p class="text-xs uppercase tracking-wide opacity-50">Itinerarium · shared itinerary</p>
          <h1 class="text-2xl font-bold">${ this.trip.name }</h1>
          <p class="text-sm opacity-70">View only</p>
        </header>
        <div class="p-4 sm:p-6 max-w-2xl mx-auto relative pl-8 flex flex-col gap-3">
          <div class="absolute left-[11px] top-2 bottom-2 w-[3px] rounded-full bg-teal-700/40"></div>
          ${ this.events.map((event) => {
            const day = event.startAt ? dayKeyInZone(event.startAt, tz) : lastTimedDay
            if (event.startAt) {
              lastTimedDay = dayKeyInZone(event.startAt, tz)
            }
            const dayHeader = day && day !== lastDay
              ? html`<div class="text-xs font-semibold uppercase tracking-wide opacity-60 z-10">${ formatDayLabel(day, tz) }</div>`
              : nothing
            if (day) {
              lastDay = day
            }
            return html`
              ${ dayHeader }
              <button
                data-event-block
                class="text-left rounded-xl border border-base-300 bg-base-100 px-4 py-3 z-10 hover:border-teal-600"
                @click=${ () => { this.detail = event } }
              >
                ${ event.startAt ? html`
                  <div class="text-xs font-medium text-teal-700">
                    ${ formatInZone(event.startAt, tz) }
                  </div>
                ` : html`<div class="text-xs opacity-50">No time</div>` }
                <div class="font-semibold">${ event.title }</div>
                ${ event.placeName ? html`<div class="text-sm opacity-70">${ event.placeName }</div>` : nothing }
              </button>
            `
          }) }
        </div>
      </div>

      ${ this.detail ? html`
        <div class="modal modal-open">
          <div class="modal-box">
            <h3 class="font-bold text-lg">${ this.detail.title }</h3>
            <div class="mt-4">${ renderNotes(this.detail.notes) }</div>
            <ul class="mt-4 space-y-1">
              ${ this.docsFor(this.detail.id).map((doc) => html`
                <li>
                  ${ doc.driveWebViewLink
          ? html`<a class="link" href=${ doc.driveWebViewLink } target="_blank" rel="noopener">${ doc.fileName }</a>`
          : doc.fileName }
                </li>
              `) }
            </ul>
            <div class="modal-action">
              <button class="btn" @click=${ () => { this.detail = null } }>Close</button>
            </div>
          </div>
          <div class="modal-backdrop" @click=${ () => { this.detail = null } }></div>
        </div>
      ` : nothing }
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'itinerarium-public-view': PublicView
  }
}
