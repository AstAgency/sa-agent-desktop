export const shellStyle = {
  width: "100%",
  height: "100vh",
  minHeight: 0,
  overflow: "hidden" as const,
};

export const threadViewStyle = { display: "flex", flexDirection: "column" as const, gap: "16px", minHeight: 0, height: "100%" };
export const threadHeaderStyle = { display: "grid", gap: "8px" };
export const threadHeaderRowStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" as const };
export const threadHeaderCopyStyle = { display: "grid", gap: "4px" };
export const threadPillsRowStyle = { display: "flex", gap: "8px", flexWrap: "wrap" as const };
export const threadEyebrowStyle = { margin: 0, fontSize: "11px", lineHeight: 1.1, letterSpacing: "0.16em", textTransform: "uppercase" as const, color: "var(--theme-color-text-muted)" };
export const threadTitleStyle = { margin: 0, fontSize: "26px", lineHeight: 1.08, fontWeight: 560, letterSpacing: "-0.03em", color: "var(--theme-color-text-primary)" };
export const threadMetaPillStyle = { minHeight: "24px", display: "inline-flex", alignItems: "center", padding: "0 8px", borderRadius: "999px", background: "color-mix(in srgb, var(--theme-color-panel-muted) 82%, transparent)", color: "var(--theme-color-text-secondary)", fontSize: "12px" };
export const chatStyle = { flex: "1 1 auto", minWidth: 0, minHeight: 0, height: "100%", display: "flex", flexDirection: "column" as const, borderRadius: "14px", background: "color-mix(in srgb, var(--theme-color-panel-end) 78%, transparent)", overflow: "hidden" as const };
export const messagesStyle = { display: "flex", flexDirection: "column" as const, flex: "1 1 auto", gap: "10px", padding: "12px 14px 18px", overflowY: "auto" as const, overflowX: "hidden" as const, overscrollBehavior: "contain" as const, minHeight: 0 };
export const composerStyle = { flex: "0 0 auto", position: "sticky" as const, bottom: 0, padding: "12px 14px 14px", borderTop: "1px solid var(--theme-color-border-secondary)", background: "color-mix(in srgb, var(--theme-color-panel-muted) 72%, transparent)", display: "grid", gap: "10px" };
export const composerHintStyle = { margin: 0, fontSize: "var(--theme-font-size-caption)", lineHeight: 1.4, color: "var(--theme-color-text-muted)" };
export const textareaStyle = { minHeight: "96px", width: "100%", resize: "vertical" as const, borderRadius: "10px", border: "1px solid var(--theme-color-border-secondary)", background: "color-mix(in srgb, var(--theme-color-panel-start) 84%, transparent)", color: "var(--theme-color-text-primary)", padding: "12px 14px", fontSize: "14px", lineHeight: 1.5, outline: "none", boxSizing: "border-box" as const, fontFamily: "inherit" };
export const messageMetaStyle = { margin: 0, fontSize: "11px", color: "var(--theme-color-text-muted)", textTransform: "uppercase" as const, letterSpacing: "0.08em" };
export const assistantMessageStyle = { display: "grid", gap: "6px", padding: "10px 12px", marginRight: "28px", borderRadius: "12px", background: "color-mix(in srgb, var(--theme-color-panel-muted) 80%, transparent)" };
export const userMessageStyle = { ...assistantMessageStyle, marginRight: 0, marginLeft: "28px", background: "color-mix(in srgb, var(--theme-color-panel-start) 88%, transparent)" };
export const systemMessageStyle = { ...assistantMessageStyle, background: "color-mix(in srgb, var(--theme-color-status-info) 78%, transparent)" };
export const streamingLoaderStyle = { display: "flex", alignItems: "center", gap: "8px", minHeight: "24px" };
export const streamingDotStyle = { width: "8px", height: "8px", borderRadius: "999px", background: "var(--theme-color-accent-primary)", opacity: 0.7 };
export const statusStyle = { margin: 0, padding: "10px 12px", borderRadius: "10px", background: "color-mix(in srgb, var(--theme-color-panel-muted) 82%, transparent)", color: "var(--theme-color-text-secondary)", fontSize: "12px" };
export const errorStyle = { margin: 0, padding: "12px", borderRadius: "10px", background: "var(--theme-color-status-danger)", color: "var(--theme-color-status-danger-text)", fontSize: "12px" };

export function primaryButtonStyle(isDisabled: boolean) {
  return {
    minHeight: "36px",
    border: "1px solid var(--theme-color-border-secondary)",
    borderRadius: "10px",
    background: isDisabled
      ? "color-mix(in srgb, var(--theme-color-panel-muted) 72%, transparent)"
      : "color-mix(in srgb, var(--theme-color-accent-primary) 18%, var(--theme-color-panel-muted) 82%)",
    color: isDisabled ? "var(--theme-color-text-muted)" : "var(--theme-color-text-primary)",
    padding: "10px 14px",
    fontSize: "13px",
    fontWeight: 520,
    cursor: isDisabled ? "not-allowed" : "pointer",
    opacity: isDisabled ? 0.56 : 1,
  };
}

export function buildLockedPopupStyle(phase: "enter" | "exit") {
  return {
    position: "fixed" as const,
    right: "20px",
    bottom: "20px",
    width: "min(320px, calc(100vw - 40px))",
    display: "grid",
    gap: "8px",
    padding: "14px",
    borderRadius: "14px",
    background: "color-mix(in srgb, var(--theme-color-panel-start) 92%, black 8%)",
    border: "1px solid var(--theme-color-border-secondary)",
    boxShadow: "0 12px 28px rgba(0,0,0,0.28)",
    zIndex: 20,
    opacity: phase === "enter" ? 1 : 0,
    transform: phase === "enter" ? "translateY(0)" : "translateY(18px)",
    transition: "opacity 180ms ease, transform 220ms ease",
    pointerEvents: phase === "enter" ? ("auto" as const) : ("none" as const),
  };
}

export const dismissPopupButtonStyle = {
  justifySelf: "start" as const,
  minHeight: "30px",
  padding: "0 10px",
  borderRadius: "8px",
  border: "1px solid var(--theme-color-border-secondary)",
  background: "transparent",
  color: "var(--theme-color-text-primary)",
  fontSize: "12px",
};
