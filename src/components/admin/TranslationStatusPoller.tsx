"use client";

import { toast, useDocumentInfo, useForm } from "@payloadcms/ui";
import type { FormState } from "payload";
import React, { useEffect, useRef } from "react";
import { TRANSLATION_POLL_INTERVAL_MS } from "./translation-attention";
import {
	resolveTranslationTransition,
	type TranslationStatusSnapshot,
} from "./translation-poll";

const PENDING_STATUS = "pending";

interface DetailResponse {
	translationStatus?: string | null;
	translationError?: string | null;
	translationUpdatedAt?: string | null;
}

function readVisibleStatus(fields: FormState | undefined): string | undefined {
	const entry = fields?.translationStatus;
	return typeof entry?.value === "string" ? entry.value : undefined;
}

/**
 * Renders no UI of its own: while the visible translationStatus is `pending`,
 * polls the review's REST doc on a bounded interval and, on a transition out
 * of `pending`, refreshes the visible sidebar fields (FR-1) and toasts the
 * final status — success or the truncated, already-actionable error (FR-2).
 * Polling stops once the status leaves `pending`, when the document changes,
 * or on unmount (timers and the in-flight request are cleaned up).
 */
export const TranslationStatusPoller: React.FC = () => {
	const { id } = useDocumentInfo();
	const { dispatchFields, getFields } = useForm();
	const inFlightRef = useRef(false);
	const getFieldsRef = useRef(getFields);
	const dispatchFieldsRef = useRef(dispatchFields);
	// Read the freshest form handles inside the poll tick without re-running
	// the polling effect on every form state change.
	getFieldsRef.current = getFields;
	dispatchFieldsRef.current = dispatchFields;

	useEffect(() => {
		if (!id) return;
		let stopped = false;
		const controller = new AbortController();

		const fetchSnapshot =
			async (): Promise<TranslationStatusSnapshot | null> => {
				const res = await fetch(
					`/api/reviews/${encodeURIComponent(String(id))}?depth=0`,
					{ signal: controller.signal },
				);
				if (!res.ok) return null;
				const data = (await res.json()) as DetailResponse;
				if (typeof data.translationStatus !== "string") return null;
				return {
					translationStatus: data.translationStatus,
					translationError: data.translationError ?? null,
					translationUpdatedAt: data.translationUpdatedAt ?? null,
				};
			};

		const runTick = async (): Promise<void> => {
			if (stopped || inFlightRef.current) return;
			const getFieldsNow = getFieldsRef.current;
			if (!getFieldsNow) return;
			const shownStatus = readVisibleStatus(getFieldsNow());
			if (shownStatus !== PENDING_STATUS) return;
			inFlightRef.current = true;
			try {
				const snapshot = await fetchSnapshot();
				// A failed/unparseable read is transient; the next poll retries.
				if (!snapshot) return;
				const result = resolveTranslationTransition({
					lastSeenStatus: shownStatus,
					nextDoc: snapshot,
				});
				if (!result) return;
				const dispatchNow = dispatchFieldsRef.current;
				if (dispatchNow) {
					// Spread keeps each field entry intact while producing an
					// object literal assignable to the FormState index signature.
					dispatchNow({
						type: "UPDATE_MANY",
						formState: { ...result.patch },
					});
				}
				if (result.toast) {
					if (result.toast.kind === "success") {
						toast.success(result.toast.message);
					} else {
						toast.error(result.toast.message);
					}
				}
			} catch {
				// Aborted or failed fetch — transient, retried on the next tick.
			} finally {
				inFlightRef.current = false;
			}
		};

		const runPoll = (): void => {
			void runTick();
		};
		runPoll();
		const interval = setInterval(runPoll, TRANSLATION_POLL_INTERVAL_MS);

		return () => {
			stopped = true;
			clearInterval(interval);
			controller.abort();
		};
	}, [id]);

	return null;
};
