"use client";

import { toast } from "@payloadcms/ui";
import { Languages } from "lucide-react";
import { usePathname } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
	BULK_RETRANSLATE_SELECTION_LIMIT,
	buildBulkCandidateWhere,
	formatBulkOutcomeLines,
	summarizeBulkOutcomes,
} from "./bulk-retranslate";
import {
	extractAttentionDocs,
	type TranslationAttentionItem,
} from "./translation-attention";

interface RestListResponse {
	docs?: unknown[];
}

interface BulkRunResult {
	outcomes: {
		id: number;
		status: "translated" | "failed" | "skipped";
		reason?: string;
		translationStatus?: string | null;
	}[];
}

/**
 * Admin path of the reviews list view. The bulk action is offered there (and
 * on the review edit views below it) because that is where an author works
 * through the reviews whose translation needs attention.
 */
const REVIEWS_ADMIN_PATH = "/admin/collections/reviews";

/**
 * Bulk re-translate action (FR-4).
 *
 * Lists the reviews whose translation is `failed` or `stale` — the only ones
 * the bulk endpoint acts on — lets the author pick several and re-translates
 * them in one sequential server-side run. The per-review outcome is reported
 * afterwards, so a partial failure is visible instead of silent.
 */
export const BulkRetranslateAction: React.FC = () => {
	const pathname = usePathname();
	const [open, setOpen] = useState(false);
	const [candidates, setCandidates] = useState<TranslationAttentionItem[]>([]);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [busy, setBusy] = useState(false);
	const [result, setResult] = useState<{
		summary: string;
		lines: string[];
	} | null>(null);
	const controllerRef = useRef<AbortController | null>(null);

	const onReviewsPath =
		typeof pathname === "string" && pathname.startsWith(REVIEWS_ADMIN_PATH);

	const fetchCandidates = useCallback(async (): Promise<void> => {
		controllerRef.current?.abort();
		const controller = new AbortController();
		controllerRef.current = controller;
		const params = new URLSearchParams({
			depth: "0",
			limit: String(BULK_RETRANSLATE_SELECTION_LIMIT),
			where: JSON.stringify(buildBulkCandidateWhere()),
		});
		try {
			const res = await fetch(`/api/reviews?${params.toString()}`, {
				signal: controller.signal,
			});
			if (!res.ok) return;
			const data = (await res.json()) as RestListResponse;
			setCandidates(extractAttentionDocs(data.docs ?? [], new Date()));
		} catch {
			// Aborted or offline — retried when the panel is reopened.
		}
	}, []);

	useEffect(() => {
		return () => {
			controllerRef.current?.abort();
		};
	}, []);

	if (!onReviewsPath) return null;

	const handleToggle = (): void => {
		const next = !open;
		setOpen(next);
		if (next) {
			setResult(null);
			void fetchCandidates();
		}
	};

	const toggleCandidate = (id: string): void => {
		setSelected((previous) => {
			const next = new Set(previous);
			if (next.has(id)) {
				next.delete(id);
			} else {
				if (next.size >= BULK_RETRANSLATE_SELECTION_LIMIT) return previous;
				next.add(id);
			}
			return next;
		});
	};

	const selectAll = (): void => {
		setSelected(
			new Set(
				candidates
					.slice(0, BULK_RETRANSLATE_SELECTION_LIMIT)
					.map((candidate) => candidate.id),
			),
		);
	};

	const runBulkRetranslate = async (): Promise<void> => {
		const ids = [...selected]
			.map((id) => Number(id))
			.filter((id) => Number.isInteger(id) && id > 0);
		if (ids.length === 0) return;

		setBusy(true);
		try {
			const res = await fetch("/api/translation/bulk-retranslate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ ids }),
			});
			const data = (await res.json()) as BulkRunResult & { error?: string };
			if (!res.ok) {
				toast.error(data.error ?? `Request failed (${res.status})`);
				return;
			}
			const outcomes = data.outcomes ?? [];
			const summary = summarizeBulkOutcomes(outcomes);
			setResult({
				summary: summary.message,
				lines: formatBulkOutcomeLines(outcomes),
			});
			if (summary.failed > 0) {
				toast.error(summary.message);
			} else {
				toast.success(summary.message);
			}
			setSelected(new Set());
			await fetchCandidates();
		} catch {
			toast.error("Request failed");
		} finally {
			setBusy(false);
		}
	};

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
				aria-label="Bulk re-translate reviews"
				disabled={busy}
				onClick={handleToggle}
				style={{
					alignItems: "center",
					background: "transparent",
					border: "none",
					color: "var(--theme-text)",
					cursor: busy ? "progress" : "pointer",
					display: "inline-flex",
					gap: "4px",
					lineHeight: 0,
					padding: "4px 6px",
					position: "relative",
				}}
			>
				<Languages aria-hidden="true" size={16} />
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
						maxHeight: "420px",
						overflowY: "auto",
						padding: "12px",
						position: "absolute",
						right: 0,
						textAlign: "left",
						top: "calc(100% + 8px)",
						width: "340px",
						zIndex: 300,
					}}
				>
					<div style={{ fontWeight: 600, marginBottom: "8px" }}>
						Re-translate failed and stale reviews
					</div>
					{candidates.length === 0 ? (
						<p style={{ margin: 0 }}>
							No review is waiting for a translation right now.
						</p>
					) : (
						<>
							<div
								style={{
									alignItems: "center",
									display: "flex",
									gap: "8px",
									justifyContent: "space-between",
									marginBottom: "8px",
								}}
							>
								<span>
									{selected.size} of {candidates.length} selected
								</span>
								<button
									type="button"
									onClick={selectAll}
									style={{
										background: "transparent",
										border: "none",
										color: "var(--theme-text)",
										cursor: "pointer",
										fontSize: "12px",
										padding: 0,
										textDecoration: "underline",
									}}
								>
									Select all
								</button>
							</div>
							<ul
								style={{
									display: "grid",
									gap: "8px",
									listStyle: "none",
									margin: 0,
									padding: 0,
								}}
							>
								{candidates.map((candidate) => (
									<li key={candidate.id}>
										<label
											style={{
												alignItems: "center",
												cursor: "pointer",
												display: "flex",
												gap: "8px",
											}}
										>
											<input
												type="checkbox"
												checked={selected.has(candidate.id)}
												onChange={() => {
													toggleCandidate(candidate.id);
												}}
											/>
											<span
												style={{
													color:
														candidate.translationStatus === "failed"
															? "var(--theme-error-500)"
															: "var(--theme-warning-500)",
													fontSize: "11px",
													fontWeight: 600,
													textTransform: "uppercase",
												}}
											>
												{candidate.translationStatus}
											</span>
											<span>{candidate.title}</span>
										</label>
									</li>
								))}
							</ul>
							<button
								type="button"
								disabled={busy || selected.size === 0}
								onClick={() => {
									void runBulkRetranslate();
								}}
								style={{
									background: "var(--theme-elevation-50)",
									border: "1px solid var(--theme-elevation-150)",
									borderRadius: "4px",
									color: "var(--theme-text)",
									cursor:
										busy || selected.size === 0 ? "not-allowed" : "pointer",
									marginTop: "12px",
									padding: "6px 10px",
									width: "100%",
								}}
							>
								{busy
									? "Re-translating…"
									: `Re-translate ${selected.size} review${selected.size === 1 ? "" : "s"}`}
							</button>
						</>
					)}
					{result ? (
						<div
							style={{
								borderTop: "1px solid var(--theme-elevation-100)",
								marginTop: "12px",
								paddingTop: "8px",
							}}
						>
							<div style={{ fontWeight: 600 }}>{result.summary}</div>
							<ul
								style={{
									display: "grid",
									gap: "4px",
									listStyle: "none",
									margin: "8px 0 0",
									padding: 0,
								}}
							>
								{result.lines.map((line) => (
									<li key={line} style={{ fontSize: "12px" }}>
										{line}
									</li>
								))}
							</ul>
						</div>
					) : null}
				</div>
			)}
		</div>
	);
};
