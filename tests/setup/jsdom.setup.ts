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
