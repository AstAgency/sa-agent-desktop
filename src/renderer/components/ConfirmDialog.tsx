import { useEffect, useState } from "react";
import { translate } from "../lib/i18n";
import { useClientState } from "../state/store";

export function ConfirmDialog(props: {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const language = useClientState((state) => state.language);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") props.onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [props]);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      await props.onConfirm();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  const confirmLabel = busy
    ? translate(language, "confirm.delete.deleting")
    : props.confirmLabel ?? translate(language, "confirm.delete.confirm");
  const cancelLabel = props.cancelLabel ?? translate(language, "confirm.delete.cancel");

  return (
    <div className="modal-backdrop" onMouseDown={() => !busy && props.onCancel()}>
      <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <h3>{props.title}</h3>
        <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.5 }}>
          {props.body}
        </p>
        {error ? <div className="banner error">{error}</div> : null}
        <div className="actions">
          <button className="cancel" disabled={busy} onClick={props.onCancel}>
            {cancelLabel}
          </button>
          <button
            className={props.destructive ? "submit destructive" : "submit"}
            disabled={busy}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
