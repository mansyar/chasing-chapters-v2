/**
 * Copies build-time static assets into the Next.js standalone output.
 *
 * The standalone server only serves files inside `.next/standalone/`, so
 * `.next/static` (CSS/JS chunks) and `public/` must be copied in before
 * `bun run start` — Docker's Dockerfile does this in the container, but a
 * local standalone run needs it too. The media directory is copied as well,
 * because Payload's own disk storage resolves it against the working
 * directory and the standalone server changes that directory.
 *
 * Run after `bun run build`, before starting the standalone server.
 */
import { cpSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

export interface CopyStandaloneResult {
	/** Source dirs that were copied into the standalone output. */
	copied: string[];
	/** Source dirs that did not exist and were skipped. */
	skipped: string[];
}

/**
 * Copy `.next/static` and `public/` into `.next/standalone/` under `root`, plus
 * the media directory when the app stores its media on the local disk.
 * Throws when no standalone build exists (i.e. `bun run build` was not run).
 */
export function copyStandaloneAssets(root: string): CopyStandaloneResult {
	const standalone = join(root, ".next", "standalone");

	if (!existsSync(join(standalone, "server.js"))) {
		throw new Error(
			"No standalone build found. Run `bun run build` before `bun run start`.",
		);
	}

	const sources = [join(root, ".next", "static"), join(root, "public")];

	// Payload's own disk storage writes the media into the working
	// directory. The standalone server runs from `.next/standalone`, so the
	// media has to be copied in as well - otherwise the media endpoint looks
	// for a directory that is not there. The directory is optional: an app
	// that stores its media in object storage has none.
	const optionalSources = [join(root, "media")];

	const result: CopyStandaloneResult = { copied: [], skipped: [] };

	for (const from of sources) {
		if (!existsSync(from)) {
			result.skipped.push(from);
			continue;
		}
		const to = join(standalone, from.slice(root.length + 1));
		rmSync(to, { recursive: true, force: true });
		cpSync(from, to, { recursive: true });
		result.copied.push(from);
	}

	for (const from of optionalSources) {
		if (!existsSync(from)) {
			continue;
		}
		const to = join(standalone, from.slice(root.length + 1));
		rmSync(to, { recursive: true, force: true });
		cpSync(from, to, { recursive: true });
		result.copied.push(from);
	}

	return result;
}

if (import.meta.main) {
	try {
		const { copied, skipped } = copyStandaloneAssets(process.cwd());
		for (const from of copied) {
			console.log(`Copied ${from}`);
		}
		for (const from of skipped) {
			console.warn(`Skipping missing source: ${from}`);
		}
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	}
}
