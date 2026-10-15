import { html, type TemplateResult } from 'lit'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Minimal markdown: escape, autolink URLs, **bold**, newlines → <br>. */
export function renderNotes(notes: string | null | undefined): TemplateResult {
  if (!notes) {
    return html`<span class="opacity-50">No notes</span>`
  }
  let out = escapeHtml(notes)
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  out = out.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a class="link link-primary" href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
  )
  out = out.replace(/\n/g, '<br>')
  return html`<div class="prose max-w-none text-sm">${ unsafeHTML(out) }</div>`
}
