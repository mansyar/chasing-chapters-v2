"use client";

import { Bell } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
	buildAttentionWhere,
	extractAttentionDocs,
	TRANSLATION_ATTENTION_LIMIT,
	TRANSLATION_POLL_INTERVAL_MS,
	type TranslationAttentionItem,
} from "./translation-attention";

interface RestListResponse {
	docs?: unknown[];
}

function statusColor(status: string): string {
	switch (status) {
		case "failed":
			return "var(--theme-error-500)";
		case "stale":
			return "var(--theme-warning-500)";
		default:
			return "var(--theme-text)";
	}
}

/**
 * Admin-shell indicator (FR-3): a bell with the count of reviews whose
 * translation needs attention (`failed`, `stale`, or stuck in `pending`
 * beyond 24 hours) and an expandable list linking to each review's edit
 * view. Polls the bounded REST list endpoint on the shared interval; the
 * configured where-clause plus the Reviews collection access rules
 * automatically scope the list to the signed-in admin/writer.
 */
export const TranslationAttentionBell: React.FC = () => {
	const [items, setItems] = useState<TranslationAttentionItem[]>([]);
	const [open, setOpen] = useState(false);
	const controllerRef = useRef<AbortController | null>(null);

	const fetchAttention = useCallback(async (): Promise<void> => {
		controllerRef.current?.abort();
		const controller = new AbortController();
		controllerRef.current = controller;
		const params = new URLSearchParams({
			depth: "0",
			limit: String(TRANSLATION_ATTENTION_LIMIT),
			where: JSON.stringify(buildAttentionWhere()),
		});
		try {
			const res = await fetch(`/api/reviews?${params.toString()}`, {
				signal: controller.signal,
			});
			if (!res.ok) return; // transient failure: keep the last known list
			const data = (await res.json()) as RestListResponse;
			setItems(extractAttentionDocs(data.docs ?? [], new Date()));
		} catch {
			// Aborted or offline — retried on the next poll / open.
		}
	}, []);

	useEffect(() => {
		const runPoll = (): void => {
			void fetchAttention();
		};
		runPoll();
		const interval = setInterval(runPoll, TRANSLATION_POLL_INTERVAL_MS);
		return () => {
			controllerRef.current?.abort();
			clearInterval(interval);
		};
	}, [fetchAttention]);

	const handleToggle = (): void => {
		if (!open) {
			void fetchAttention();
		}
		setOpen((previous) => !previous);
	};

	const count = items.length;
	const badgeLabel =
		count > TRANSLATION_ATTENTION_LIMIT
			? `${TRANSLATION_ATTENTION_LIMIT}+`
			: String(count);

	return (
		<div
			style={{
				display: "inline-flex",
				position: "relative",
				lineHeight: 0,
			}}
		>
			<button
				type="button"
				aria-expanded={open}
				aria-label={`${count === 1 ? "translation" : "translations"} needing attention: ${badgeLabel}`}
				onClick={handleToggle}
				style={{
					display: "inline-flex",
					alignItems: "center",
					gap: "4px",
					background: "transparent",
					border: "none",
					cursor: "pointer",
					color: "var(--theme-text)",
					padding: "4px 6px",
					position: "relative",
					lineHeight: 0,
				}}
			>
				<Bell aria-hidden="true" size={16} />
				{count > 0 && (
					<span
						style={{
							alignItems: "center",
							background: "var(--theme-error-500)",
							borderRadius: "100px",
							color: "#fff",
							display: "inline-flex",
							fontSize: "10px",
							fontWeight: 600,
							justifyContent: "center",
							lineHeight: "14px",
							minWidth: "14px",
							padding: "0 3px",
							position: "absolute",
							right: "0px",
							top: "0px",
						}}
					>
						{badgeLabel}
					</span>
				)}
			</button>
			{open && (
				<div
					style={{
						background: "var(--theme-elevation-0)",
						border: "1px solid var(--theme-elevation-150)",
						borderRadius: "4px",
						boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
						color: "var(--theme-text)",
						fontSize: "13px",
						lineHeight: 1.5,
						maxHeight: "360px",
						overflowY: "auto",
						padding: "12px",
						position: "absolute",
						right: "0",
						textAlign: "left",
						top: "calc(100% + 8px)",
						width: "320px",
						zIndex: 300,
					}}
				>
					<div style={{ fontWeight: 600, marginBottom: "8px" }}>
						Translations needing attention
					</div>
					{count === 0 ? (
						<p style={{ margin: 0 }}>There is nothing to review right now.</p>
					) : (
						<ul
							style={{
								display: "grid",
								gap: "8px",
								listStyle: "none",
								margin: 0,
								padding: 0,
							}}
						>
							{items.map((item) => (
								<li key={item.id}>
									<a
										href={item.editURL}
										onClick={() => {
											setOpen(false);
										}}
										style={{
											borderBottom: "1px solid var(--theme-elevation-100)",
											color: "inherit",
											display: "block",
											paddingBottom: "8px",
											textDecoration: "none",
										}}
									>
										<span style={{ display: "block", fontWeight: 500 }}>
											{item.title}
										</span>
										<span
											style={{
												color: statusColor(item.translationStatus),
												fontSize: "11px",
												fontWeight: 600,
												textTransform: "uppercase",
											}}
										>
											{item.translationStatus}
										</span>
									</a>
								</li>
							))}
						</ul>
					)}
				</div>
			)}
		</div>
	);
};
