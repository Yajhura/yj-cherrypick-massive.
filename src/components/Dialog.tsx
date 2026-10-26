import { ReactNode, useEffect, useRef } from "react";

interface Props {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}

/** Native modal dialog: focus trapping, Escape and backdrop come from the platform. */
export function Dialog({ open, title, description, onClose, children, footer }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {open && (
        <>
          <div className="dialog-head">
            <h2 id="dialog-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <div className="dialog-body">{children}</div>
          <div className="dialog-foot">{footer}</div>
        </>
      )}
    </dialog>
  );
}
