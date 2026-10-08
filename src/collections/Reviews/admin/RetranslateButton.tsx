"use client";

import { Button, useDocumentInfo, useForm } from "@payloadcms/ui";
import React, { useState } from "react";

type RetranslateResponse = {
	ok: boolean;
	httpStatus: number;
	translationStatus?: string;
	error?: string;
};

/**
 * Sidebar action: runs the EN → ID translation pipeline for this review on
 * demand, regardless of draft/published state or the autoTranslate toggle.
 */
export const RetranslateButton: React.FC = () => {
	const { id } = useDocumentInfo();
	const { dispatchFields } = useForm();
	const [busy, setBusy] = useState(false);
	const [feedback, setFeedback] = useState<{
		kind: "success" | "error";
		message: string;
	} | null>(null);

	const handleClick = async () => {
		if (!id) return;
		setBusy(true);
		setFeedback(null);
		try {
			const res = await fetch(`/api/reviews/${id}/retranslate`, {
				method: "POST",
			});
			const data = (await res.json()) as RetranslateResponse;

			if (data.translationStatus || data.error) {
				dispatchFields({
					type: "UPDATE_MANY",
					formState: {
						...(data.translationStatus
							? {
									translationStatus: {
										value: data.translationStatus,
										initialValue: data.translationStatus,
										valid: true,
									},
								}
							: {}),
						...(data.error
							? {
									translationError: {
										value: data.error,
										initialValue: data.error,
										valid: true,
									},
								}
							: {}),
					},
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
				} as any);
			}

			if (data.ok && data.translationStatus === "translated") {
				setFeedback({ kind: "success", message: "Translation updated" });
			} else if (data.ok && data.translationStatus === "failed") {
				setFeedback({
					kind: "error",
					message: data.error ?? "Translation failed",
				});
			} else if (!data.ok) {
				setFeedback({
					kind: "error",
					message: data.error ?? `Request failed (${res.status})`,
				});
			}
		} catch {
			setFeedback({ kind: "error", message: "Request failed" });
		} finally {
			setBusy(false);
		}
	};

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				gap: "4px",
				marginBottom: "8px",
			}}
		>
			<Button
				buttonStyle="secondary"
				disabled={busy || !id}
				onClick={handleClick}
				size="small"
			>
				{busy ? "Translating…" : "Re-translate now"}
			</Button>
			{feedback ? (
				<span
					style={{
						fontSize: "12px",
						color:
							feedback.kind === "success"
								? "var(--theme-success-500)"
								: "var(--theme-error-500)",
					}}
				>
					{feedback.message}
				</span>
			) : null}
		</div>
	);
};
