import { LitElement } from 'lit'

// Filled by the shell at startup via setSharedStyles().
let sharedSheet: CSSStyleSheet | null = null

export function setSharedStyles(cssText: string) {
  sharedSheet = new CSSStyleSheet()
  sharedSheet.replaceSync(cssText)
}

export class SmorgElement extends LitElement {
  protected createRenderRoot(): HTMLElement | DocumentFragment {
    const root = super.createRenderRoot()
    if (root instanceof ShadowRoot && sharedSheet) {
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sharedSheet]
    }
    return root
  }
}
