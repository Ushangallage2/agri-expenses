import { useEffect } from "react";
import { createPortal } from "react-dom";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmModal({
  open,
  title,
  message = "This action cannot be undone.",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onCancel]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="confirm-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      onClick={onCancel}
    >
      <div
        className="confirm-panel glass-card animate-rise"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-panel__body">
          <p className="eyebrow text-center">Please confirm</p>
          <h2
            id="confirm-modal-title"
            className="font-display text-2xl sm:text-3xl text-gold glow-text text-center"
          >
            {title}
          </h2>
          {message && (
            <p className="text-sm sm:text-base text-gold-muted leading-relaxed text-center mt-2">
              {message}
            </p>
          )}
        </div>

        <div className="confirm-panel__actions">
          <button
            type="button"
            className="glass-btn confirm-btn"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`glass-btn confirm-btn ${
              danger
                ? "text-red-200 border-red-400/50 hover:bg-red-500/20"
                : "gold-btn"
            }`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
