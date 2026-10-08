/**
 * Copies build-time static assets into the Next.js standalone output.
 *
 * The standalone server only serves files inside `.next/standalone/`, so
 * `.next/static` (CSS/JS chunks) and `public/` must be copied in before
 * `bun run start` — Docker's Dockerfile does this in the container, but a
 * local standalone run needs it too.
 *
 * Run after `bun run build`, before starting the standalone server.
 */
import { cpSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const standalone = join(root, ".next", "standalone");

if (!existsSync(join(standalone, "server.js"))) {
	console.error(
		"No standalone build found. Run `bun run build` before `bun run start`.",
	);
	process.exit(1);
}

const copies = [
	{
		from: join(root, ".next", "static"),
		to: join(standalone, ".next", "static"),
	},
	{ from: join(root, "public"), to: join(standalone, "public") },
];

for (const { from, to } of copies) {
	if (!existsSync(from)) {
		console.warn(`Skipping missing source: ${from}`);
		continue;
	}
	rmSync(to, { recursive: true, force: true });
	cpSync(from, to, { recursive: true });
	console.log(`Copied ${from} -> ${to}`);
}
