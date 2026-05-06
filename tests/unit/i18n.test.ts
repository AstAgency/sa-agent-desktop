import { describe, expect, it } from "vitest";
import { translate } from "../../src/renderer/lib/i18n";

describe("translate", () => {
  it("returns russian auth title", () => {
    expect(translate("ru", "auth.title")).toBe("Войти в SA-Agent");
  });

  it("returns english language setup title", () => {
    expect(translate("en", "languageSetup.title")).toBe("Choose your language");
  });
});
