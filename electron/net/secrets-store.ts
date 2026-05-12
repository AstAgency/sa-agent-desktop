import fs from "node:fs/promises";
import path from "node:path";

export type SearchConfig = {
  endpoint: string;
  defaultEndpoint: string;
};

type StoredSettings = {
  version: 1;
  search?: {
    endpoint?: string;
  };
};

type SettingsStoreOptions = {
  userDataPath: string;
  defaultSearchEndpoint?: string;
};

export type SecretsStore = ReturnType<typeof createSecretsStore>;

const SETTINGS_FILE_NAME = "secrets.json";
const DEFAULT_SEARCH_ENDPOINT = "http://localhost:8000";

function normalizeEndpoint(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed;
}

export function createSecretsStore(options: SettingsStoreOptions) {
  const filePath = path.join(options.userDataPath, SETTINGS_FILE_NAME);
  const defaultEndpoint = normalizeEndpoint(
    options.defaultSearchEndpoint ?? DEFAULT_SEARCH_ENDPOINT,
  );

  async function readState(): Promise<StoredSettings> {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as StoredSettings;
      return parsed?.version === 1 ? parsed : { version: 1 };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1 };
      throw error;
    }
  }

  async function writeState(state: StoredSettings): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  return {
    defaultSearchEndpoint: defaultEndpoint,

    async getSearchConfig(): Promise<SearchConfig> {
      const state = await readState();
      const endpoint = normalizeEndpoint(state.search?.endpoint ?? defaultEndpoint);
      return { endpoint, defaultEndpoint };
    },

    async setSearchEndpoint(endpoint: string): Promise<SearchConfig> {
      const nextState = await readState();
      const normalized = normalizeEndpoint(endpoint);
      nextState.search = {
        ...(nextState.search ?? {}),
        endpoint: normalized.length > 0 ? normalized : undefined,
      };
      await writeState(nextState);
      return {
        endpoint: normalized.length > 0 ? normalized : defaultEndpoint,
        defaultEndpoint,
      };
    },
  };
}
