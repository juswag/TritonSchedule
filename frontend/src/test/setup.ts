import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Motion's whileInView observer is not implemented in jsdom. Treat every
// landing element as in view so entrance states resolve during tests.
if (typeof window.IntersectionObserver === "undefined") {
  class IntersectionObserverMock implements IntersectionObserver {
    readonly root: Element | Document | null = null;
    readonly rootMargin = "0px";
    readonly thresholds: readonly number[] = [0];

    constructor(private readonly callback: IntersectionObserverCallback) {}

    observe(target: Element) {
      this.callback(
        [
          {
            isIntersecting: true,
            intersectionRatio: 1,
            target,
            boundingClientRect: target.getBoundingClientRect(),
            intersectionRect: target.getBoundingClientRect(),
            rootBounds: null,
            time: 0,
          },
        ],
        this,
      );
    }

    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  Object.defineProperty(window, "IntersectionObserver", {
    writable: true,
    configurable: true,
    value: IntersectionObserverMock,
  });
}
