import './app.ts'
import './public_view.ts'

export async function mount(host: HTMLElement) {
  const el = document.createElement('itinerarium-app')
  host.append(el)
}
