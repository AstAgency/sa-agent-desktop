import { translate } from "../../lib/i18n";
import type { AppLanguage } from "../../lib/types";
import { buildLockedPopupStyle, dismissPopupButtonStyle } from "./threadStyles";

export function LockedPopup(props: {
  language: AppLanguage;
  message: string;
  phase: "enter" | "exit";
  onClose: () => void;
}) {
  return (
    <aside data-testid="workspace-onboarding-locked-popup" role="status" style={buildLockedPopupStyle(props.phase)}>
      <p style={{ margin: 0, color: "var(--theme-color-text-primary)", fontSize: "13px", lineHeight: 1.5 }}>{props.message}</p>
      <button type="button" onClick={props.onClose} style={dismissPopupButtonStyle}>
        {translate(props.language, "workspace.onboarding.noticeDismiss")}
      </button>
    </aside>
  );
}
