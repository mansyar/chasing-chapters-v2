import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Render a pre-built element to static HTML for test assertions.
 *
 * This is the shared harness for the typography component tests (Card chrome,
 * Breadcrumbs, StarRating call sites): callers build the element with
 * `createElement` exactly as before, and the harness owns the single
 * `renderToStaticMarkup` call instead of a copy per suite.
 *
 * Location: this helper lives under `src/components/__tests__/helpers/` rather
 * than `src/lib/__tests__/helpers/` because every consumer is a component
 * render test; `src/lib` helpers stay for pure unit tests with no rendering.
 *
 * Boundary: `renderToStaticMarkup` renders server output only.
 *
 * - Rendered components must be producible without client interactivity: no
 *   event handler fires, effects never run, and state never updates. Client
 *   components (`"use client"`) still yield their initial HTML, which is all
 *   these assertions read.
 * - Async server components (page-level components that fetch from Payload)
 *   cannot render here: `renderToStaticMarkup` is synchronous and there is no
 *   request context or database in a unit test. Their wiring stays pinned by
 *   source assertions, each saying why.
 * - No new production dependencies: `react-dom/server` is already used.
 */
export function renderStatic(element: ReactElement): string {
	return renderToStaticMarkup(element);
}
