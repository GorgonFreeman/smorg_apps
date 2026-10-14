import './people_app.ts'

export async function mount(host: HTMLElement) {
  const el = document.createElement('core-people-app')
  host.append(el)
}
