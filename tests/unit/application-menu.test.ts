import { describe, expect, it } from "vitest";
import { buildApplicationMenuTemplate } from "../../electron/application-menu";

describe("application menu", () => {
  it("includes standard edit roles so copy and paste shortcuts keep working", () => {
    const template = buildApplicationMenuTemplate("SA-Agent Desktop", "darwin");
    const editMenu = template.find((item) => item.label === "Edit");

    expect(editMenu).toBeTruthy();
    expect(Array.isArray(editMenu?.submenu)).toBe(true);
    expect(editMenu?.submenu).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "undo" }),
        expect.objectContaining({ role: "redo" }),
        expect.objectContaining({ role: "cut" }),
        expect.objectContaining({ role: "copy" }),
        expect.objectContaining({ role: "paste" }),
        expect.objectContaining({ role: "selectAll" }),
      ]),
    );
  });
});
