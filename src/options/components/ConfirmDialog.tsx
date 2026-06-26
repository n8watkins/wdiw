import { useEffect, useRef } from "react";
import { Icon } from "./Icons";

type ConfirmDialogProps = {
  title: string;
  body: string;
  confirmLabel: string;
  tone?: "danger" | "primary";
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  tone = "danger",
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Accessibility: focus the confirm button on open, close on Escape, and
  // restore focus to whatever was focused before the dialog opened on unmount.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      prev?.focus();
    };
  }, [onCancel]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`confirm-icon ${tone}`}>
          <Icon name={tone === "danger" ? "trash" : "reset"} />
        </div>
        <div>
          <h2 id="confirm-title" className="confirm-title">{title}</h2>
          <p className="confirm-body">{body}</p>
        </div>
        <div className="confirm-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button ref={confirmRef} className={`btn ${tone === "danger" ? "btn-danger-solid" : "btn-primary"}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
