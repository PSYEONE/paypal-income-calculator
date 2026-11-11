type Child = Node | string | number | null | undefined | false;

/**
 * Makes an element. Text always goes in as text, never as HTML, so nothing
 * from a CSV file can turn into markup.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> | null = null,
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs ?? {})) el.setAttribute(name, value);
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}
