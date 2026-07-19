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
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm z-[100] animate-fadeIn px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      onClick={onCancel}
    >
      <div
        className="glass-card p-6 w-full max-w-[360px] text-center space-y-4 shadow-[0_0_40px_rgba(212,175,55,0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="confirm-modal-title"
          className="font-display text-2xl text-gold"
        >
          {title}
        </h2>
        {message && (
          <p className="text-sm text-gold-muted leading-relaxed">{message}</p>
        )}
        <div className="flex justify-center gap-3 pt-2">
          <button type="button" className="glass-btn min-w-[100px]" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`glass-btn min-w-[100px] ${
              danger ? "text-red-300 border-red-400/40 hover:bg-red-500/15" : "gold-btn"
            }`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
