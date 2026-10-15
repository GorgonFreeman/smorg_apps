import { html } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import { SmorgElement } from '@smorg/ui'
import { parseAppPath, type AppView } from './nav.js'
import './trips_list.ts'
import './timeline.ts'
import './settings_page.ts'

@customElement('itinerarium-app')
export class ItinerariumApp extends SmorgElement {
  @state() private view: AppView = parseAppPath()

  connectedCallback() {
    super.connectedCallback()
    window.addEventListener('popstate', this.onPopState)
    this.view = parseAppPath()
  }

  disconnectedCallback() {
    window.removeEventListener('popstate', this.onPopState)
    super.disconnectedCallback()
  }

  private onPopState = () => {
    this.view = parseAppPath()
  }

  render() {
    switch (this.view.name) {
      case 'settings':
        return html`<itinerarium-settings></itinerarium-settings>`
      case 'trip':
        return html`<itinerarium-timeline tripId=${ this.view.tripId }></itinerarium-timeline>`
      default:
        return html`<itinerarium-trips-list></itinerarium-trips-list>`
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'itinerarium-app': ItinerariumApp
  }
}
