import { html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { SmorgElement } from '@smorg/ui'
import {
  addDocument,
  createEvent,
  createShare,
  deleteEvent,
  getShare,
  getSettings,
  getTrip,
  listEvents,
  removeDocument,
  revokeShare,
  updateEvent,
  type DocMeta,
  type ShareLink,
  type Trip,
  type TripEvent,
} from './api.js'
import { deleteLocalBlob, fileToBase64, getLocalBlob, putLocalBlob } from './local_docs.js'
import { renderNotes } from './markdown.js'
import { appNavigate } from './nav.js'
import {
  dayKeyInZone,
  formatDayLabel,
  formatInZone,
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from './time_format.js'

type EventForm = {
  title: string
  placeName: string
  placeUrl: string
  startLocal: string
  endLocal: string
  durationMinutes: string
  notes: string
  preferDuration: boolean
}

function blankForm(): EventForm {
  return {
    title: '',
    placeName: '',
    placeUrl: '',
    startLocal: '',
    endLocal: '',
    durationMinutes: '',
    notes: '',
    preferDuration: false,
  }
}

type TimelineItem =
  | { kind: 'day', key: string, label: string }
  | { kind: 'now' }
  | { kind: 'event', event: TripEvent }

@customElement('itinerarium-timeline')
export class TimelinePage extends SmorgElement {
  @property() tripId = ''

  @state() private trip: Trip | null = null
  @state() private events: TripEvent[] = []
  @state() private documents: DocMeta[] = []
  @state() private error = ''
  @state() private editing = false
  @state() private formOpen = false
  @state() private formEvent: TripEvent | null = null
  @state() private insertAt: number | null = null
  @state() private form = blankForm()
  @state() private detail: TripEvent | null = null
  @state() private shareOpen = false
  @state() private share: ShareLink | null = null
  @state() private driveConfigured = false
  @state() private centred = false

  connectedCallback() {
    super.connectedCallback()
    void this.reload()
  }

  protected updated(changed: Map<string, unknown>) {
    if (changed.has('tripId') && this.tripId) {
      this.centred = false
      void this.reload()
    }
    if (!this.centred && this.events.length >= 0 && this.trip) {
      requestAnimationFrame(() => this.centreOnNow())
    }
  }

  private async reload() {
    if (!this.tripId) {
      return
    }
    const [tripResult, eventsResult, settingsResult] = await Promise.all([
      getTrip(this.tripId),
      listEvents(this.tripId),
      getSettings(),
    ])
    if (!tripResult.ok || !tripResult.data) {
      this.error = tripResult.error?.message ?? 'Trip not found'
      return
    }
    if (!eventsResult.ok || !eventsResult.data) {
      this.error = eventsResult.error?.message ?? 'Could not load events'
      return
    }
    this.error = ''
    this.trip = tripResult.data
    this.events = eventsResult.data.events
    this.documents = eventsResult.data.documents
    this.driveConfigured = settingsResult.ok && !!settingsResult.data?.configured
    this.centred = false
  }

  private centreOnNow() {
    const marker = this.renderRoot.querySelector('[data-now-marker]') as HTMLElement | null
    const nearest = this.renderRoot.querySelector('[data-event-block]') as HTMLElement | null
    const target = marker ?? nearest
    if (target) {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
    this.centred = true
  }

  private docsFor(eventId: string) {
    return this.documents.filter((d) => d.eventId === eventId)
  }

  private buildItems(): TimelineItem[] {
    const tz = this.trip?.timezone ?? 'UTC'
    const items: TimelineItem[] = []
    let lastDay: string | null = null
    let lastTimedDay: string | null = this.trip?.startDate ?? null
    const now = Date.now()
    let nowPlaced = false

    const showNow = this.shouldShowNow(now)

    for (const event of this.events) {
      const day = event.startAt
        ? dayKeyInZone(event.startAt, tz)
        : lastTimedDay
      if (event.startAt) {
        lastTimedDay = dayKeyInZone(event.startAt, tz)
      }
      if (day && day !== lastDay) {
        items.push({ kind: 'day', key: day, label: formatDayLabel(day, tz) })
        lastDay = day
      }

      if (showNow && !nowPlaced && event.startAt && new Date(event.startAt).getTime() > now) {
        items.push({ kind: 'now' })
        nowPlaced = true
      }

      items.push({ kind: 'event', event })
    }

    if (showNow && !nowPlaced) {
      items.push({ kind: 'now' })
    }

    return items
  }

  private shouldShowNow(nowMs: number): boolean {
    if (!this.trip) {
      return false
    }
    const start = this.trip.startDate ? Date.parse(`${ this.trip.startDate }T00:00:00`) : null
    const end = this.trip.endDate ? Date.parse(`${ this.trip.endDate }T23:59:59`) : null
    if (start != null && end != null) {
      return nowMs >= start && nowMs <= end
    }
    if (this.events.some((e) => e.startAt)) {
      const times = this.events.filter((e) => e.startAt).map((e) => new Date(e.startAt!).getTime())
      const min = Math.min(...times)
      const max = Math.max(...times)
      return nowMs >= min - 12 * 3600_000 && nowMs <= max + 12 * 3600_000
    }
    return false
  }

  private openCreate(insertAt: number) {
    this.formEvent = null
    this.insertAt = insertAt
    this.form = blankForm()
    this.formOpen = true
  }

  private openEdit(event: TripEvent) {
    this.formEvent = event
    this.insertAt = null
    this.form = {
      title: event.title,
      placeName: event.placeName ?? '',
      placeUrl: event.placeUrl ?? '',
      startLocal: toDatetimeLocalValue(event.startAt),
      endLocal: toDatetimeLocalValue(event.endAt),
      durationMinutes: event.durationMinutes != null ? String(event.durationMinutes) : '',
      notes: event.notes ?? '',
      preferDuration: false,
    }
    this.formOpen = true
    this.detail = null
  }

  private closeForm() {
    this.formOpen = false
    this.formEvent = null
    this.insertAt = null
  }

  private onDurationInput(value: string) {
    this.form = { ...this.form, durationMinutes: value, preferDuration: true }
    if (!this.form.startLocal || !value) {
      return
    }
    const start = fromDatetimeLocalValue(this.form.startLocal)
    if (!start) {
      return
    }
    const mins = Number(value)
    if (!Number.isFinite(mins)) {
      return
    }
    const end = new Date(new Date(start).getTime() + mins * 60_000)
    this.form = {
      ...this.form,
      durationMinutes: value,
      preferDuration: true,
      endLocal: toDatetimeLocalValue(end.toISOString()),
    }
  }

  private onEndInput(value: string) {
    this.form = { ...this.form, endLocal: value, preferDuration: false }
    if (!this.form.startLocal || !value) {
      return
    }
    const start = fromDatetimeLocalValue(this.form.startLocal)
    const end = fromDatetimeLocalValue(value)
    if (!start || !end) {
      return
    }
    const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000)
    this.form = {
      ...this.form,
      endLocal: value,
      preferDuration: false,
      durationMinutes: mins >= 0 ? String(mins) : '',
    }
  }

  private async saveForm(event: Event) {
    event.preventDefault()
    const payload = {
      title: this.form.title,
      placeName: this.form.placeName || null,
      placeUrl: this.form.placeUrl || null,
      startAt: fromDatetimeLocalValue(this.form.startLocal),
      endAt: fromDatetimeLocalValue(this.form.endLocal),
      durationMinutes: this.form.durationMinutes === ''
        ? null
        : Number(this.form.durationMinutes),
      notes: this.form.notes || null,
      preferDuration: this.form.preferDuration,
      insertAt: this.insertAt,
    }
    const result = this.formEvent
      ? await updateEvent(this.formEvent.id, payload)
      : await createEvent(this.tripId, payload)
    if (!result.ok) {
      this.error = result.error?.message ?? 'Save failed'
      return
    }
    this.closeForm()
    await this.reload()
  }

  private async removeEvent() {
    if (!this.formEvent) {
      return
    }
    if (!confirm(`Delete “${ this.formEvent.title }”?`)) {
      return
    }
    const result = await deleteEvent(this.formEvent.id)
    if (!result.ok) {
      this.error = result.error?.message ?? 'Delete failed'
      return
    }
    this.closeForm()
    await this.reload()
  }

  private async onAddFile(fileList: FileList | null) {
    if (!fileList?.[0] || !this.formEvent) {
      return
    }
    const file = fileList[0]
    if (file.size > 20 * 1024 * 1024) {
      this.error = 'File exceeds 20 MB limit'
      return
    }

    let storage: 'local' | 'drive' = 'local'
    if (this.driveConfigured) {
      const choice = confirm('OK = upload to Google Drive, Cancel = keep on this device only')
      storage = choice ? 'drive' : 'local'
    }

    if (storage === 'drive') {
      const contentBase64 = await fileToBase64(file)
      const result = await addDocument(this.formEvent.id, {
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        storage: 'drive',
        contentBase64,
      })
      if (!result.ok) {
        this.error = result.error?.message ?? 'Upload failed'
        return
      }
    } else {
      const result = await addDocument(this.formEvent.id, {
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        storage: 'local',
        byteSize: file.size,
      })
      if (!result.ok || !result.data) {
        this.error = result.error?.message ?? 'Save failed'
        return
      }
      const key = result.data.localKey ?? result.data.id
      await putLocalBlob(key, file)
    }
    await this.reload()
    if (this.formEvent) {
      const refreshed = this.events.find((e) => e.id === this.formEvent!.id)
      if (refreshed) {
        this.formEvent = refreshed
      }
    }
  }

  private async onRemoveDoc(doc: DocMeta) {
    if (!confirm(`Remove ${ doc.fileName }?`)) {
      return
    }
    const result = await removeDocument(doc.id)
    if (!result.ok) {
      this.error = result.error?.message ?? 'Could not remove document'
      return
    }
    if (doc.storage === 'local' && doc.localKey) {
      await deleteLocalBlob(doc.localKey)
    }
    await this.reload()
  }

  private async openLocalDoc(doc: DocMeta) {
    const key = doc.localKey ?? doc.id
    const blob = await getLocalBlob(key)
    if (!blob) {
      this.error = 'File not found on this device'
      return
    }
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
  }

  private async openShare() {
    this.shareOpen = true
    const result = await getShare(this.tripId)
    if (result.ok) {
      this.share = result.data ?? null
    }
  }

  private async ensureShare() {
    const result = await createShare(this.tripId)
    if (!result.ok || !result.data) {
      this.error = result.error?.message ?? 'Could not create share link'
      return
    }
    this.share = result.data
  }

  private async copyShare() {
    if (!this.share) {
      await this.ensureShare()
    }
    if (!this.share) {
      return
    }
    await navigator.clipboard.writeText(this.share.url)
  }

  private async onRevokeShare() {
    const result = await revokeShare(this.tripId)
    if (!result.ok) {
      this.error = result.error?.message ?? 'Could not revoke link'
      return
    }
    this.share = null
  }

  render() {
    if (!this.trip) {
      return html`
        <div class="p-6">
          ${ this.error ? html`<p class="text-error">${ this.error }</p>` : html`Loading…` }
          <button class="btn btn-ghost mt-4" @click=${ () => appNavigate('/apps/itinerarium') }>
            ← Trips
          </button>
        </div>
      `
    }

    const items = this.buildItems()
    const gap = this.editing ? 'gap-6' : 'gap-3'

    return html`
      <div class="p-4 sm:p-6 max-w-2xl mx-auto">
        <div class="flex flex-wrap items-start justify-between gap-3 mb-6">
          <div>
            <button class="btn btn-ghost btn-sm mb-1 -ml-2" @click=${ () => appNavigate('/apps/itinerarium') }>
              ← Trips
            </button>
            <h1 class="text-2xl font-bold">${ this.trip.name }</h1>
            <p class="text-sm opacity-70">${ this.trip.timezone }</p>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-ghost btn-sm" @click=${ () => void this.openShare() }>Share</button>
            ${ this.editing
        ? html`<button class="btn btn-primary btn-sm" @click=${ () => { this.editing = false } }>Done</button>`
        : html`<button class="btn btn-primary btn-sm" @click=${ () => { this.editing = true } }>Edit</button>` }
          </div>
        </div>

        ${ this.error ? html`<p class="text-error mb-4">${ this.error }</p>` : nothing }

        <div class="relative pl-8 ${ gap } flex flex-col">
          <div class="absolute left-[11px] top-2 bottom-2 w-[3px] rounded-full bg-teal-700/40"></div>

          ${ this.editing ? html`
            <button class="btn btn-circle btn-sm btn-outline z-10 self-start -ml-1"
              title="Add event" @click=${ () => this.openCreate(0) }>+</button>
          ` : nothing }

          ${ items.map((item) => {
            if (item.kind === 'day') {
              return html`
                <div class="text-xs font-semibold uppercase tracking-wide opacity-60 z-10 bg-base-100 w-fit px-1">
                  ${ item.label }
                </div>
              `
            }
            if (item.kind === 'now') {
              return html`
                <div data-now-marker class="flex items-center gap-2 z-10 -ml-8 pl-0">
                  <div class="w-8 flex justify-center">
                    <div class="w-2.5 h-2.5 rounded-full bg-rose-500 ring-4 ring-rose-500/20"></div>
                  </div>
                  <span class="text-xs font-medium text-rose-600">now</span>
                </div>
              `
            }
            const event = item.event
            const idx = this.events.findIndex((e) => e.id === event.id)
            return html`
              <div class="relative z-10">
                <div
                  data-event-block
                  class="rounded-xl border border-base-300 bg-base-100 px-4 py-3 shadow-sm cursor-pointer hover:border-teal-600"
                  @click=${ () => {
                    if (!this.editing) {
                      this.detail = event
                    }
                  } }
                >
                  <div class="flex items-start justify-between gap-2">
                    <div>
                      ${ event.startAt ? html`
                        <div class="text-xs font-medium text-teal-700">
                          ${ formatInZone(event.startAt, this.trip!.timezone) }
                          ${ event.endAt ? html` – ${ formatInZone(event.endAt, this.trip!.timezone) }` : nothing }
                        </div>
                      ` : html`<div class="text-xs opacity-50">No time</div>` }
                      <div class="font-semibold">${ event.title }</div>
                      ${ event.placeName ? html`<div class="text-sm opacity-70">${ event.placeName }</div>` : nothing }
                    </div>
                    ${ this.editing ? html`
                      <button class="btn btn-ghost btn-xs" @click=${ (e: Event) => {
                        e.stopPropagation()
                        this.openEdit(event)
                      } }>Edit</button>
                    ` : nothing }
                  </div>
                </div>
                ${ this.editing ? html`
                  <button class="btn btn-circle btn-sm btn-outline mt-3"
                    @click=${ () => this.openCreate(idx + 1) }>+</button>
                ` : nothing }
              </div>
            `
          }) }
        </div>
      </div>

      ${ this.detail ? this.renderDetail() : nothing }
      ${ this.formOpen ? this.renderForm() : nothing }
      ${ this.shareOpen ? this.renderShare() : nothing }
    `
  }

  private renderDetail() {
    const event = this.detail!
    const docs = this.docsFor(event.id)
    return html`
      <div class="modal modal-open">
        <div class="modal-box">
          <h3 class="font-bold text-lg">${ event.title }</h3>
          ${ event.startAt ? html`
            <p class="text-sm opacity-70 mt-1">
              ${ formatInZone(event.startAt, this.trip!.timezone, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }) }
            </p>
          ` : nothing }
          ${ event.placeName ? html`
            <p class="mt-2">
              ${ event.placeUrl
          ? html`<a class="link link-primary" href=${ event.placeUrl } target="_blank" rel="noopener">${ event.placeName }</a>`
          : event.placeName }
            </p>
          ` : nothing }
          <div class="mt-4">${ renderNotes(event.notes) }</div>
          ${ docs.length ? html`
            <ul class="mt-4 space-y-1">
              ${ docs.map((doc) => html`
                <li>
                  ${ doc.storage === 'drive' && doc.driveWebViewLink
          ? html`<a class="link" href=${ doc.driveWebViewLink } target="_blank" rel="noopener">${ doc.fileName }</a>`
          : html`<button class="link" @click=${ () => void this.openLocalDoc(doc) }>${ doc.fileName }</button>` }
                  <span class="text-xs opacity-50 ml-1">${ doc.storage }</span>
                </li>
              `) }
            </ul>
          ` : nothing }
          <div class="modal-action">
            <button class="btn" @click=${ () => { this.detail = null } }>Close</button>
          </div>
        </div>
        <div class="modal-backdrop" @click=${ () => { this.detail = null } }></div>
      </div>
    `
  }

  private renderForm() {
    const docs = this.formEvent ? this.docsFor(this.formEvent.id) : []
    return html`
      <div class="modal modal-open">
        <div class="modal-box max-w-lg">
          <h3 class="font-bold text-lg mb-3">${ this.formEvent ? 'Edit event' : 'New event' }</h3>
          <form class="space-y-3" @submit=${ (e: Event) => void this.saveForm(e) }>
            <label class="form-control">
              <span class="label-text">Title</span>
              <input class="input input-bordered" required .value=${ this.form.title }
                @input=${ (e: Event) => { this.form = { ...this.form, title: (e.target as HTMLInputElement).value } } } />
            </label>
            <label class="form-control">
              <span class="label-text">Place</span>
              <input class="input input-bordered" .value=${ this.form.placeName }
                @input=${ (e: Event) => { this.form = { ...this.form, placeName: (e.target as HTMLInputElement).value } } } />
            </label>
            <label class="form-control">
              <span class="label-text">Place link</span>
              <input class="input input-bordered" .value=${ this.form.placeUrl }
                @input=${ (e: Event) => { this.form = { ...this.form, placeUrl: (e.target as HTMLInputElement).value } } } />
            </label>
            <label class="form-control">
              <span class="label-text">Start</span>
              <input type="datetime-local" class="input input-bordered" .value=${ this.form.startLocal }
                @input=${ (e: Event) => { this.form = { ...this.form, startLocal: (e.target as HTMLInputElement).value } } } />
            </label>
            <div class="grid grid-cols-2 gap-3">
              <label class="form-control">
                <span class="label-text">End</span>
                <input type="datetime-local" class="input input-bordered" .value=${ this.form.endLocal }
                  @input=${ (e: Event) => this.onEndInput((e.target as HTMLInputElement).value) } />
              </label>
              <label class="form-control">
                <span class="label-text">Duration (minutes)</span>
                <input type="number" min="0" class="input input-bordered" .value=${ this.form.durationMinutes }
                  @input=${ (e: Event) => this.onDurationInput((e.target as HTMLInputElement).value) } />
              </label>
            </div>
            <label class="form-control">
              <span class="label-text">Notes</span>
              <textarea class="textarea textarea-bordered" rows="4" .value=${ this.form.notes }
                @input=${ (e: Event) => { this.form = { ...this.form, notes: (e.target as HTMLTextAreaElement).value } } }></textarea>
            </label>

            ${ this.formEvent ? html`
              <div>
                <div class="label-text mb-1">Documents</div>
                <ul class="space-y-1 mb-2">
                  ${ docs.map((doc) => html`
                    <li class="flex justify-between gap-2 text-sm">
                      <span>${ doc.fileName } <span class="opacity-50">(${ doc.storage })</span></span>
                      <button type="button" class="btn btn-ghost btn-xs text-error"
                        @click=${ () => void this.onRemoveDoc(doc) }>Remove</button>
                    </li>
                  `) }
                </ul>
                <input type="file" class="file-input file-input-bordered file-input-sm w-full"
                  @change=${ (e: Event) => {
                    const input = e.target as HTMLInputElement
                    void this.onAddFile(input.files)
                    input.value = ''
                  } } />
              </div>
            ` : html`<p class="text-sm opacity-60">Save the event to attach documents.</p>` }

            <div class="modal-action flex-wrap">
              ${ this.formEvent ? html`
                <button type="button" class="btn btn-error btn-outline mr-auto"
                  @click=${ () => void this.removeEvent() }>Delete</button>
              ` : nothing }
              <button type="button" class="btn" @click=${ () => this.closeForm() }>Cancel</button>
              <button type="submit" class="btn btn-primary">Save</button>
            </div>
          </form>
        </div>
        <div class="modal-backdrop" @click=${ () => this.closeForm() }></div>
      </div>
    `
  }

  private renderShare() {
    return html`
      <div class="modal modal-open">
        <div class="modal-box">
          <h3 class="font-bold text-lg">Share trip</h3>
          <p class="text-sm opacity-70 mt-2">
            Anyone with the link can view this trip (no login). Local files stay on your device;
            Drive links are included when available.
          </p>
          ${ this.share ? html`
            <input class="input input-bordered w-full mt-4 text-sm" readonly .value=${ this.share.url } />
          ` : html`<p class="mt-4 text-sm opacity-60">No active link yet.</p>` }
          <div class="modal-action flex-wrap gap-2">
            <button class="btn btn-primary" @click=${ () => void this.copyShare() }>
              ${ this.share ? 'Copy link' : 'Create & copy link' }
            </button>
            ${ this.share ? html`
              <button class="btn btn-error btn-outline" @click=${ () => void this.onRevokeShare() }>
                Revoke link
              </button>
            ` : nothing }
            <button class="btn" @click=${ () => { this.shareOpen = false } }>Close</button>
          </div>
        </div>
        <div class="modal-backdrop" @click=${ () => { this.shareOpen = false } }></div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'itinerarium-timeline': TimelinePage
  }
}
