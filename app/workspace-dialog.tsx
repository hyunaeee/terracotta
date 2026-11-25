import { useLayoutEffect, useRef, type ReactNode } from "react";
import styles from "./workspace-dialog.module.css";

export function WorkspaceDialog({ label, panelClass, onDismiss, children }: {
  label: string;
  panelClass: string;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={`overlay ${styles.viewport}`}
      aria-label={label}
      onCancel={(event) => { event.preventDefault(); onDismiss(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onDismiss(); }}
    >
      <div className={`dialog ${panelClass}`}>{children}</div>
    </dialog>
  );
}
