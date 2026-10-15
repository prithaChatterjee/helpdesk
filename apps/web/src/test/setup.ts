import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// findBy*/waitFor give up after 1 s by default, which a busy machine (the full suite running in
// parallel, dev servers alongside) sometimes needs longer than for a slow render, not a bug
configure({ asyncUtilTimeout: 3000 });

// Testing Library only unmounts automatically when Vitest globals are enabled
afterEach(() => {
  cleanup();
});

// jsdom lacks the pointer-capture and scroll APIs Radix Select calls when it opens
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
// jsdom lacks matchMedia, which next-themes calls to follow the system theme; this one reports a
// light system preference
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
