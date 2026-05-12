import fs from "node:fs/promises";
import path from "node:path";

export type SearchProviderId = "none" | "brave" | "tavily";
export type SearchConfig = {
  provider: SearchProviderId;
  hasKey: boolean;
};

type StoredSecrets = {
  version: 1;
  search?: {
    provider?: SearchProviderId;
    keys?: Partial<Record<Exclude<SearchProviderId, "none">, string>>;
  };
};

type EncryptionAdapter = {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
};

type SecretsStoreOptions = {
  userDataPath: string;
  encryption: EncryptionAdapter;
};

export type SecretsStore = ReturnType<typeof createSecretsStore>;

const SECRETS_FILE_NAME = "secrets.json";

export function createSecretsStore(options: SecretsStoreOptions) {
  const filePath = path.join(options.userDataPath, SECRETS_FILE_NAME);

  async function readState(): Promise<StoredSecrets> {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as StoredSecrets;
      return parsed?.version === 1 ? parsed : { version: 1 };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1 };
      throw error;
    }
  }

  async function writeState(state: StoredSecrets): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  function assertEncryptionAvailable() {
    if (!options.encryption.isEncryptionAvailable()) {
      throw new Error("Secure key storage is unavailable on this system");
    }
  }

  return {
    async getSearchConfig(): Promise<SearchConfig> {
      const state = await readState();
      const provider = state.search?.provider ?? "none";
      const hasKey = provider === "none" ? false : Boolean(state.search?.keys?.[provider]);
      return { provider, hasKey };
    },

    async getSearchKey(provider: Exclude<SearchProviderId, "none">): Promise<string | null> {
      const state = await readState();
      const encoded = state.search?.keys?.[provider];
      if (!encoded) return null;
      assertEncryptionAvailable();
      return options.encryption.decryptString(Buffer.from(encoded, "base64"));
    },

    async setSearchKey(provider: SearchProviderId, key: string): Promise<SearchConfig> {
      const nextState = await readState();
      nextState.search ??= { provider: "none", keys: {} };
      nextState.search.provider = provider;
      nextState.search.keys ??= {};

      const trimmedKey = key.trim();
      if (provider === "none") {
        return persist();
      }
      if (trimmedKey.length > 0) {
        assertEncryptionAvailable();
        nextState.search.keys[provider] = options.encryption
          .encryptString(trimmedKey)
          .toString("base64");
      }
      return persist();

      async function persist() {
        await writeState(nextState);
        const hasKey = provider === "none" ? false : Boolean(nextState.search?.keys?.[provider]);
        return { provider, hasKey } satisfies SearchConfig;
      }
    },
  };
}
