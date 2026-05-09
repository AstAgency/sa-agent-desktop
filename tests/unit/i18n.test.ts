import { describe, expect, it } from "vitest";
import { translate } from "../../src/renderer/lib/i18n";

describe("Russian UI translations", () => {
  it("avoids mixed English wording in key shell labels", () => {
    expect(translate("ru", "languageSetup.selected.en")).toBe("Выбранный язык: Английский");
    expect(translate("ru", "bootstrap.stage.workspaces")).toBe("Загружаем рабочие пространства");
    expect(translate("ru", "settings.label.apiBaseUrl")).toBe("Адрес API");
    expect(translate("ru", "workspace.context.description")).toBe(
      "Текущий охват, состояние рантайма и следующие действия появляются здесь.",
    );
    expect(translate("ru", "workspace.assistant.command.hint")).toBe(
      "Отдельная командная панель пока не вынесена. Используйте активный тред.",
    );
    expect(translate("ru", "workspace.assistant.disabled.onboarding")).toBe(
      "Сначала завершите онбординг, затем используйте быстрые действия ассистента вне треда онбординга.",
    );
    expect(translate("ru", "workspace.files.artifacts.description")).toBe(
      "Артефакты — это логические результаты исполнений и рабочих процессов.",
    );
  });
});
