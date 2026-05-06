import { expect, test, _electron as electron } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("app boots to language selection on first run", async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sa-agent-desktop-smoke-"));
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;

  try {
    app = await electron.launch({
      args: [path.join(process.cwd(), "dist-electron/main.js")],
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOME: process.env.HOME ?? os.homedir(),
        SA_AGENT_USER_DATA_DIR: userDataDir,
      },
    });

    const page = await app.firstWindow();

    await expect(page.getByRole("button", { name: "Русский" })).toBeVisible();
    await expect(page.getByRole("button", { name: "English" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await page.getByRole("button", { name: "Русский" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await expect(page.getByRole("heading", { name: "Войти в SA-Agent" })).toBeVisible();
  } finally {
    if (app) {
      await app.close();
    }

    fs.rmSync(userDataDir, { force: true, recursive: true });
  }
});
