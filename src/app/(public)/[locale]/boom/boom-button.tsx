"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * The test-only forced-error trigger for the route error-boundary e2e spec.
 *
 * It renders a button no production UI ever links to; clicking it throws
 * during render, which is what the `[locale]/error.tsx` segment boundary
 * catches. The throw is state-driven (not unconditional) so the spec can prove
 * recovery: `reset()` remounts the segment with fresh state and the button is
 * back instead of the error UI.
 */
export function BoomButton() {
	const [shouldThrow, setShouldThrow] = useState(false);

	if (shouldThrow) {
		throw new Error("E2E forced error: boom trigger");
	}

	return <Button onClick={() => setShouldThrow(true)}>Throw test error</Button>;
}
