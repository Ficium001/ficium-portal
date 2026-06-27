import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement matchMedia; stub it so components using
// prefers-reduced-motion / responsive hooks can render under test.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
}

// jsdom lacks IntersectionObserver; stub it so scroll-reveal hooks render.
if (typeof globalThis !== "undefined" && !("IntersectionObserver" in globalThis)) {
  class IO {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  }
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = IO;
}
