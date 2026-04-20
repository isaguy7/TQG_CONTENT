"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface InputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  submitLabel?: string;
  cancelLabel?: string;
  /** Returns an error message to display, or null when the value is valid. */
  validate?: (value: string) => string | null;
  onSubmit: (value: string) => void | Promise<void>;
  loading?: boolean;
}

/**
 * Shared single-input dialog. React Portal at body level, focus-trapped
 * between Input / Cancel / Submit, Escape + backdrop close. Replaces
 * native window.prompt() per the V10 UX rule.
 *
 * Initial focus: the input (data-entry is the primary action; Cancel
 * is a one-tab-away escape hatch).
 * Enter submits when valid; Escape closes.
 */
export function InputDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  placeholder,
  defaultValue = "",
  submitLabel = "Save",
  cancelLabel = "Cancel",
  validate,
  onSubmit,
  loading = false,
}: InputDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const submitRef = useRef<HTMLButtonElement | null>(null);
  const [value, setValue] = useState(defaultValue);

  // Reset value + focus input on each open transition. This makes the
  // dialog behave as a fresh form every time the user opens it rather
  // than retaining a stale value from a previous session.
  useEffect(() => {
    if (!open) return;
    setValue(defaultValue);
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [open, defaultValue]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const errorMessage = validate ? validate(value) : null;
  const canSubmit = !loading && value.trim().length > 0 && !errorMessage;

  const submit = () => {
    if (!canSubmit) return;
    void onSubmit(value);
  };

  const focusOrder = (): (HTMLElement | null)[] => [
    inputRef.current,
    cancelRef.current,
    submitRef.current,
  ];

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && !loading) {
      e.preventDefault();
      onOpenChange(false);
      return;
    }
    if (e.key === "Tab") {
      const order = focusOrder().filter((el): el is HTMLElement => !!el);
      const active = document.activeElement;
      const index = order.findIndex((el) => el === active);
      if (index === -1) return;
      e.preventDefault();
      const next = e.shiftKey
        ? (index - 1 + order.length) % order.length
        : (index + 1) % order.length;
      order[next]?.focus();
    }
  };

  const onBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !loading) onOpenChange(false);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={onBackdropClick}
      onKeyDown={onKeyDown}
      aria-labelledby="input-dialog-title"
      aria-describedby={description ? "input-dialog-desc" : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="mx-4 w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2
          id="input-dialog-title"
          className="text-lg font-semibold text-white"
        >
          {title}
        </h2>
        {description ? (
          <p
            id="input-dialog-desc"
            className="mt-2 text-sm text-zinc-400 leading-relaxed"
          >
            {description}
          </p>
        ) : null}

        <label
          htmlFor="input-dialog-input"
          className="mt-4 block text-sm font-medium text-zinc-300"
        >
          {label}
        </label>
        <input
          id="input-dialog-input"
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          disabled={loading}
          className={cn(
            "mt-1.5 w-full rounded-md border bg-zinc-800 px-3 py-2 text-sm text-white",
            "placeholder:text-zinc-500 focus:outline-none",
            errorMessage
              ? "border-red-500 focus:ring-1 focus:ring-red-500"
              : "border-zinc-700 focus:ring-1 focus:ring-[#1B5E20] focus:border-[#1B5E20]",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        />
        {errorMessage ? (
          <p className="mt-1.5 text-xs text-red-400">{errorMessage}</p>
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
            ref={submitRef}
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex items-center justify-center rounded-md bg-[#1B5E20] px-4 py-2 text-sm font-medium text-white hover:bg-[#154d19] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-label="Working" />
            ) : (
              submitLabel
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
