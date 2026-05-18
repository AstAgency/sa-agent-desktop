export function isNavigationLocked(input: { sendingMessage: boolean }): boolean {
  return input.sendingMessage;
}

export function getNavigationLockReason(language: "en" | "ru"): string {
  return language === "ru"
    ? "Дождитесь завершения работы агента или нажмите «Стоп», прежде чем переключать чаты, менять агента или прикреплять файлы."
    : "Wait for the agent to finish or press Stop before switching chats, changing the agent, or attaching files.";
}
