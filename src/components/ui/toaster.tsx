"use client";

import { useTheme } from "next-themes";
import { Toaster as SonnerToaster } from "sonner";

/**
 * Theme-aware toast host mounted once in the public layout.
 * Wraps sonner's Toaster to inherit the app's light/dark theme.
 */
export function Toaster() {
	const { resolvedTheme } = useTheme();

	return (
		<SonnerToaster
			theme={(resolvedTheme as "light" | "dark" | "system") ?? "system"}
			position="bottom-right"
			richColors
			closeButton
		/>
	);
}
