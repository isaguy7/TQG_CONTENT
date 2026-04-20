"use client";

import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}

/**
 * Shared confirm dialog. React Portal at body level, focus-trapped
 * between Cancel/Confirm, Escape + backdrop close. Replaces native
 * window.confirm() per the V10 UX rule (V10_Product_Context.md
 * 2026-04-19: "no native browser dialogs").
 *
 * onConfirm is awaited but this component does NOT auto-close on
 * success — the caller flips open via onOpenChange. That lets callers
 * keep the dialog open with an error when onConfirm throws.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  loading = false,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  // Initial focus: Cancel — safer default for destructive ops. Run on
  // open transition via a microtask so React has committed the portal.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => cancelRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && !loading) {
      e.preventDefault();
      onOpenChange(false);
      return;
    }
    if (e.key === "Tab") {
      // Two-element focus cycle. With 3+ tabbables this grows, but for
      // now Cancel <-> Confirm is the whole surface.
      const active = document.activeElement;
      if (!e.shiftKey && active === confirmRef.current) {
        e.preventDefault();
        cancelRef.current?.focus();
      } else if (e.shiftKey && active === cancelRef.current) {
        e.preventDefault();
        confirmRef.current?.focus();
      }
    }
  };

  const onBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !loading) onOpenChange(false);
  };

  const confirmStyles =
    variant === "danger"
      ? "bg-red-500 hover:bg-red-600 text-white"
      : "bg-[#1B5E20] hover:bg-[#154d19] text-white";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={onBackdropClick}
      onKeyDown={onKeyDown}
      aria-labelledby="confirm-dialog-title"
      aria-describedby={description ? "confirm-dialog-desc" : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="mx-4 w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
        // Stop propagation so clicks inside the card don't close.
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2
          id="confirm-dialog-title"
          className="text-lg font-semibold text-white"
        >
          {title}
        </h2>
        {description ? (
          <p
            id="confirm-dialog-desc"
            className="mt-2 text-sm text-zinc-400 leading-relaxed"
          >
            {description}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="rounded-md border border-zinc-700 bg-transparent px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => {
              void onConfirm();
            }}
            disabled={loading}
            className={cn(
              "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium disabled:opacity-70 disabled:cursor-not-allowed transition-colors",
              confirmStyles
            )}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-label="Working" />
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
