/**
 * Shared renderer for dynamically generated Open Graph images.
 *
 * Uses inline styles only — this JSX is rendered by Satori (via Next.js
 * `ImageResponse`), which supports a limited CSS subset. No Tailwind classes
 * or external components are allowed here.
 */

export interface OgImageFrameProps {
	siteName: string;
	/** Small label shown above the title, e.g. "Featured Review". */
	badge: string;
	title: string;
	/** Secondary line below the title, e.g. the book author. */
	subtitle: string;
	/** Star rating 1–5; 0 hides the star row entirely. */
	rating?: number;
}

const palette = {
	background: "#faf5ee",
	backgroundGradient: "linear-gradient(135deg, #fdfaf4 0%, #f3e9d7 100%)",
	text: "#2b2118",
	muted: "#6b5d4f",
	accent: "#b45309",
	starFilled: "#d97706",
	starEmpty: "#d6c9b6",
};

function StarRow({ rating }: { rating: number }) {
	return (
		<div style={{ display: "flex", gap: 10 }}>
			{Array.from({ length: 5 }).map((_, i) => (
				<div
					key={i}
					style={{
						width: 34,
						height: 34,
						borderRadius: 8,
						backgroundColor:
							i < rating ? palette.starFilled : palette.starEmpty,
						display: "flex",
					}}
				/>
			))}
		</div>
	);
}

export function OgImageFrame({
	siteName,
	badge,
	title,
	subtitle,
	rating = 0,
}: OgImageFrameProps) {
	return (
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				padding: 72,
				backgroundImage: palette.backgroundGradient,
				color: palette.text,
			}}
		>
			{/* Header: site name badge */}
			<div style={{ display: "flex" }}>
				<div
					style={{
						display: "flex",
						padding: "10px 24px",
						borderRadius: 999,
						border: `2px solid ${palette.accent}`,
						color: palette.accent,
						fontSize: 26,
						fontWeight: 600,
						letterSpacing: 2,
						textTransform: "uppercase",
					}}
				>
					{siteName}
				</div>
			</div>

			{/* Body: badge, title, subtitle */}
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: 24,
				}}
			>
				<div
					style={{
						display: "flex",
						color: palette.muted,
						fontSize: 30,
						fontWeight: 500,
						letterSpacing: 3,
						textTransform: "uppercase",
					}}
				>
					{badge}
				</div>
				<div
					style={{
						display: "flex",
						fontSize: 76,
						fontWeight: 700,
						lineHeight: 1.15,
					}}
				>
					{title}
				</div>
				<div
					style={{
						display: "flex",
						fontSize: 40,
						color: palette.muted,
					}}
				>
					{subtitle}
				</div>
			</div>

			{/* Footer: rating stars (when present) */}
			<div style={{ display: "flex" }}>
				{rating > 0 ? <StarRow rating={rating} /> : null}
			</div>
		</div>
	);
}
