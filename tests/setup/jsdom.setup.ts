// tests/setup/jsdom.setup.ts
import "@testing-library/jest-dom/vitest";

// Minimal EventSource stub so components can attach listeners safely in tests
class TestEventSource {
  url: string;
  onerror: ((this: EventSource, ev: Event) => any) | null = null;
  private listeners: Record<string, Function[]> = {};
  constructor(url: string) {
    this.url = url;
  }
  addEventListener(type: string, cb: (ev: MessageEvent) => void) {
    (this.listeners[type] ||= []).push(cb);
  }
  // helper if you ever want to simulate events in tests
  __emit(type: string, data?: any) {
    const arr = this.listeners[type] || [];
    for (const fn of arr) fn({ data } as MessageEvent);
  }
  close() {}
}
// only define if not present
// @ts-ignore
if (typeof globalThis.EventSource === "undefined") {
  // @ts-ignore
  globalThis.EventSource = TestEventSource as any;
}

// jsdom doesn't ship matchMedia. Components like AddToHomeScreenToast
// call window.matchMedia("(display-mode: standalone)") at mount and
// throw "matchMedia is not a function" otherwise. Stub it as a no-op
// "doesn't match anything" implementation.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  // @ts-ignore
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// jsdom doesn't implement the pointer-capture APIs. SwipeDeck's drag
// handler calls e.target.setPointerCapture(...) on pointerdown, which
// throws "setPointerCapture is not a function" under jsdom. Stub all
// three on HTMLElement.prototype - tests don't care about real
// pointer-capture semantics, they just need the calls to be no-ops.
if (typeof HTMLElement !== "undefined") {
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = function () {};
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = function () {};
  }
  if (!HTMLElement.prototype.hasPointerCapture) {
    HTMLElement.prototype.hasPointerCapture = function () {
      return false;
    };
  }
}
