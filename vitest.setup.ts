import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// React Testing Library's automatic cleanup only runs when Vitest is configured
// with `globals: true`. We keep globals off, so we wire cleanup manually here.
afterEach(() => {
  cleanup();
});
