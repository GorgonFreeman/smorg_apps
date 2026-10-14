import { html, nothing } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { SmorgElement } from '@smorg/ui'
import {
  createPerson,
  deletePerson,
  listPeople,
  updatePerson,
  type Person,
} from './people_api.js'

@customElement('core-people-app')
export class PeopleApp extends SmorgElement {
  @state() private people: Person[] = []
  @state() private q = ''
  @state() private error = ''
  @state() private editing: Person | null = null
  @state() private creating = false
  @state() private form = blankForm()

  connectedCallback() {
    super.connectedCallback()
    void this.reload()
  }

  private async reload() {
    const result = await listPeople(this.q)
    if (!result.ok || !result.data) {
      this.error = result.error?.message ?? 'Could not load people'
      return
    }
    this.error = ''
    this.people = result.data
  }

  private openCreate() {
    this.creating = true
    this.editing = null
    this.form = blankForm()
  }

  private openEdit(person: Person) {
    this.creating = false
    this.editing = person
    this.form = {
      handle: person.handle,
      firstName: person.firstName ?? '',
      middleName: person.middleName ?? '',
      lastName: person.lastName ?? '',
      email: person.email ?? '',
      phone: person.phone ?? '',
      notes: person.notes ?? '',
    }
  }

  private closeForm() {
    this.creating = false
    this.editing = null
  }

  private async save(event: Event) {
    event.preventDefault()
    const payload = {
      handle: this.form.handle,
      firstName: this.form.firstName,
      middleName: this.form.middleName,
      lastName: this.form.lastName,
      email: this.form.email,
      phone: this.form.phone,
      notes: this.form.notes,
    }
    const result = this.editing
      ? await updatePerson(this.editing.id, payload)
      : await createPerson(payload)
    if (!result.ok) {
      this.error = result.error?.message ?? 'Save failed'
      return
    }
    this.closeForm()
    await this.reload()
  }

  private async remove(person: Person) {
    if (!confirm(`Delete ${ person.handle }? This cannot be undone.`)) {
      return
    }
    const result = await deletePerson(person.id)
    if (!result.ok) {
      this.error = result.error?.message ?? 'Delete failed'
      return
    }
    await this.reload()
  }

  render() {
    const showForm = this.creating || this.editing

    return html`
      <div class="p-6 max-w-3xl mx-auto">
        <div class="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 class="text-3xl font-bold">People</h1>
            <p class="opacity-70">Shared contacts</p>
          </div>
          <button class="btn btn-primary" @click=${ () => this.openCreate() }>Add person</button>
        </div>

        <label class="form-control w-full mb-4">
          <input
            class="input input-bordered w-full"
            placeholder="Search…"
            .value=${ this.q }
            @input=${ (e: Event) => {
              this.q = (e.target as HTMLInputElement).value
              void this.reload()
            } }
          />
        </label>

        ${ this.error ? html`<p class="text-error mb-4">${ this.error }</p>` : nothing }

        ${ showForm ? this.renderForm() : nothing }

        <ul class="divide-y divide-base-300 border border-base-300 rounded-lg bg-base-100">
          ${ this.people.map((person) => html`
            <li class="flex items-center justify-between gap-3 px-4 py-3">
              <button class="text-left flex-1" @click=${ () => this.openEdit(person) }>
                <div class="font-medium">${ person.handle }</div>
                <div class="text-sm opacity-70">
                  ${ [person.firstName, person.lastName].filter(Boolean).join(' ') || '—' }
                </div>
              </button>
              <button class="btn btn-ghost btn-sm text-error" @click=${ () => this.remove(person) }>
                Delete
              </button>
            </li>
          `) }
          ${ this.people.length === 0
            ? html`<li class="px-4 py-6 opacity-70">No people yet</li>`
            : nothing }
        </ul>
      </div>
    `
  }

  private setFormField(key: keyof FormState, value: string) {
    this.form = { ...this.form, [key]: value }
  }

  private renderForm() {
    return html`
      <form class="border border-base-300 rounded-lg p-4 mb-6 bg-base-100 space-y-3" @submit=${ this.save }>
        <h2 class="font-semibold text-lg">${ this.editing ? 'Edit person' : 'New person' }</h2>
        ${ this.textField('Handle', 'handle', true) }
        ${ this.textField('First name', 'firstName') }
        ${ this.textField('Middle name', 'middleName') }
        ${ this.textField('Last name', 'lastName') }
        ${ this.textField('Email', 'email') }
        ${ this.textField('Phone', 'phone') }
        <label class="form-control w-full">
          <span class="label-text">Notes</span>
          <textarea
            class="textarea textarea-bordered"
            .value=${ this.form.notes }
            @input=${ (e: Event) => this.setFormField('notes', (e.target as HTMLTextAreaElement).value) }
          ></textarea>
        </label>
        <div class="flex gap-2">
          <button class="btn btn-primary" type="submit">Save</button>
          <button class="btn btn-ghost" type="button" @click=${ () => this.closeForm() }>Cancel</button>
        </div>
      </form>
    `
  }

  private textField(label: string, key: keyof FormState, required = false) {
    return html`
      <label class="form-control w-full">
        <span class="label-text">${ label }</span>
        <input
          class="input input-bordered w-full"
          ?required=${ required }
          .value=${ this.form[key] }
          @input=${ (e: Event) => this.setFormField(key, (e.target as HTMLInputElement).value) }
        />
      </label>
    `
  }
}

type FormState = {
  handle: string
  firstName: string
  middleName: string
  lastName: string
  email: string
  phone: string
  notes: string
}

function blankForm(): FormState {
  return {
    handle: '',
    firstName: '',
    middleName: '',
    lastName: '',
    email: '',
    phone: '',
    notes: '',
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'core-people-app': PeopleApp
  }
}
