import { html } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import { SmorgElement } from '@smorg/ui'
import '@smorg/itinerarium/client'

@customElement('smorg-public-itinerarium-page')
export class PublicItinerariumPage extends SmorgElement {
  @property() token = ''

  render() {
    return html`<itinerarium-public-view token=${ this.token }></itinerarium-public-view>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'smorg-public-itinerarium-page': PublicItinerariumPage
  }
}
