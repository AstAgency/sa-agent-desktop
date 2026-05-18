export function isNavigationLocked(input: { sendingMessage: boolean }): boolean {
  return input.sendingMessage;
}

export function getNavigationLockReason(language: "en" | "ru"): string {
  return language === "ru"
    ? "Остановите текущую генерацию, чтобы переключать чаты."
    : "Stop the current generation to switch chats.";
}
