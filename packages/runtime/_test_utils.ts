// Shared test fixtures for `@sprout/runtime` tests.
//
// These types implement the minimal DOM surface that `mountAll`, `mountIsland`,
// and `mountComponent` touch. They are structural but do not extend `HTMLElement`
// / `ParentNode`; tests cast at call sites to exercise the runtime's typed
// signatures without standing up a DOM.

// ---------------------------------------------------------------------------
// Fake element / parent implementation
// ---------------------------------------------------------------------------

export interface FakeElement {
  tagName: string;
  parentNode: FakeParent | null;
  children: FakeElement[];
  attributes: Map<string, string>;
  textContent: string;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  appendChild(child: FakeElement): FakeElement;
  removeChild(child: FakeElement): void;
  readonly firstChild: FakeElement | null;
}

export interface FakeParent {
  children: FakeElement[];
  querySelectorAll(selector: string): FakeElement[];
  appendChild(child: FakeElement): FakeElement;
  removeChild(child: FakeElement): void;
}

export function isIslandPlaceholderSelector(selector: string): boolean {
  return selector.trim() === "[data-sprout-src]";
}

export function makeElement(): FakeElement {
  const attributes = new Map<string, string>();
  const el: FakeElement = {
    tagName: "DIV",
    parentNode: null,
    children: [],
    attributes,
    textContent: "",
    getAttribute(name: string): string | null {
      return attributes.has(name) ? attributes.get(name)! : null;
    },
    setAttribute(name: string, value: string): void {
      attributes.set(name, String(value));
    },
    removeAttribute(name: string): void {
      attributes.delete(name);
    },
    appendChild(child: FakeElement): FakeElement {
      child.parentNode = el as unknown as FakeParent;
      el.children.push(child);
      return child;
    },
    removeChild(child: FakeElement): void {
      const idx = el.children.indexOf(child);
      if (idx >= 0) {
        el.children.splice(idx, 1);
        child.parentNode = null;
      }
    },
    get firstChild(): FakeElement | null {
      return el.children[0] ?? null;
    },
  };
  return el;
}

export function makeParent(): FakeParent & { addIsland(el: FakeElement): void } {
  const children: FakeElement[] = [];
  const parent: FakeParent & { addIsland(el: FakeElement): void } = {
    children,
    querySelectorAll(selector: string): FakeElement[] {
      if (!isIslandPlaceholderSelector(selector)) return [];
      const out: FakeElement[] = [];
      const walk = (node: FakeElement): void => {
        if (node.attributes.has("data-sprout-src")) {
          out.push(node);
        }
        for (const c of node.children) walk(c);
      };
      for (const child of children) walk(child);
      return out;
    },
    appendChild(child: FakeElement): FakeElement {
      child.parentNode = parent;
      children.push(child);
      return child;
    },
    removeChild(child: FakeElement): void {
      const idx = children.indexOf(child);
      if (idx >= 0) {
        children.splice(idx, 1);
        child.parentNode = null;
      }
    },
    addIsland(el: FakeElement): void {
      parent.appendChild(el);
    },
  };
  return parent;
}

export function makeIslandElement(
  id: string,
  src: string,
  props?: Record<string, unknown>,
): FakeElement {
  const el = makeElement();
  el.setAttribute("data-sprout-island", id);
  el.setAttribute("data-sprout-src", src);
  if (props) {
    el.setAttribute("data-sprout-props", JSON.stringify(props));
  }
  return el;
}

// ---------------------------------------------------------------------------
// Fake island module factory
// ---------------------------------------------------------------------------

export interface FakeIsland {
  callCount: number;
  mount: (element: FakeElement, props: Readonly<Record<string, unknown>>) => void | Promise<void>;
}

export function fakeIsland(): FakeIsland {
  return {
    callCount: 0,
    mount(element, _props) {
      this.callCount++;
      element.setAttribute("data-sprout-mounted", "true");
      element.textContent = "mounted";
    },
  };
}

export function fakeImporter(
  modules: Record<string, { default: FakeIsland }>,
): (specifier: string) => Promise<unknown> {
  return (specifier: string) => {
    const m = modules[specifier];
    if (!m) {
      return Promise.reject(new Error(`not found: ${specifier}`));
    }
    return Promise.resolve(m);
  };
}

// ---------------------------------------------------------------------------
// Cast helpers
// ---------------------------------------------------------------------------

/** Cast a `FakeParent` to the structural type the runtime accepts. */
export function asParent(p: FakeParent): ParentNode {
  return p as unknown as ParentNode;
}

/** Cast a `FakeElement` to the structural type the runtime accepts. */
export function asElement(e: FakeElement): HTMLElement {
  return e as unknown as HTMLElement;
}
