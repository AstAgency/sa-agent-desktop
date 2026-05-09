import { Client, StdioClientTransport, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import type {
  AgentMcpServerConfig,
  McpToolCallContentItem,
  McpToolCallResult,
  McpToolDescriptor,
} from "./mcp-types.js";

type McpConnection = {
  client: Client;
  transport: {
    close: () => Promise<void>;
  };
};

type SharedConnection = McpConnection & {
  key: string;
  refCount: number;
};

export class McpRuntimeManager {
  private readonly runtimes = new Map<string, Map<string, McpConnection>>();
  private readonly runtimeServers = new Map<string, Record<string, AgentMcpServerConfig>>();
  private readonly runtimeSharedConnectionKeys = new Map<string, Set<string>>();
  private readonly sharedConnections = new Map<string, SharedConnection>();

  async listTools(
    runtimeId: string,
    servers: Record<string, AgentMcpServerConfig>,
  ): Promise<McpToolDescriptor[]> {
    this.runtimeServers.set(runtimeId, servers);
    const descriptors: McpToolDescriptor[] = [];

    for (const [serverName, config] of Object.entries(servers)) {
      const client = await this.getClient(runtimeId, serverName, config);
      let cursor: string | undefined;

      do {
        const result = await client.listTools(cursor ? { cursor } : undefined);
        for (const tool of result.tools ?? []) {
          descriptors.push({
            serverName,
            name: tool.name,
            title: tool.title ?? tool.name,
            description: tool.description ?? null,
            inputSchema: tool.inputSchema ?? { type: "object", properties: {} },
          });
        }
        cursor = result.nextCursor ?? undefined;
      } while (cursor);
    }

    return descriptors;
  }

  async callTool(
    runtimeId: string,
    serverName: string,
    toolName: string,
    argumentsJson: Record<string, unknown>,
  ): Promise<McpToolCallResult> {
    const servers = this.runtimeServers.get(runtimeId);

    if (!servers) {
      throw new Error(`MCP runtime "${runtimeId}" is not initialized.`);
    }

    const config = servers[serverName];

    if (!config) {
      throw new Error(`MCP server "${serverName}" is not configured.`);
    }

    const client = await this.getClient(runtimeId, serverName, config);
    const result = await client.callTool({
      name: toolName,
      arguments: argumentsJson,
    });

    return {
      serverName,
      toolName,
      content: normalizeToolContent(result.content),
      structuredContent: result.structuredContent,
      isError: result.isError === true,
    };
  }

  async closeRuntime(runtimeId: string) {
    const runtimeConnections = this.runtimes.get(runtimeId);

    if (!runtimeConnections) {
      return;
    }

    const runtimeServers = this.runtimeServers.get(runtimeId) ?? {};
    const sharedConnectionKeys = this.runtimeSharedConnectionKeys.get(runtimeId) ?? new Set<string>();
    this.runtimes.delete(runtimeId);
    this.runtimeServers.delete(runtimeId);
    this.runtimeSharedConnectionKeys.delete(runtimeId);

    for (const [serverName, connection] of runtimeConnections.entries()) {
      const sharedConnectionKey = resolveSharedConnectionKey(serverName, runtimeServers[serverName]);

      if (sharedConnectionKey && sharedConnectionKeys.has(sharedConnectionKey)) {
        const sharedConnection = this.sharedConnections.get(sharedConnectionKey);

        if (!sharedConnection) {
          continue;
        }

        sharedConnection.refCount -= 1;

        if (sharedConnection.refCount > 0) {
          continue;
        }

        this.sharedConnections.delete(sharedConnectionKey);
      }

      await connection.transport.close().catch(() => undefined);
    }
  }

  private async getClient(
    runtimeId: string,
    serverName: string,
    config: AgentMcpServerConfig,
  ) {
    let runtimeConnections = this.runtimes.get(runtimeId);

    if (!runtimeConnections) {
      runtimeConnections = new Map<string, McpConnection>();
      this.runtimes.set(runtimeId, runtimeConnections);
    }

    const existing = runtimeConnections.get(serverName);
    if (existing) {
      return existing.client;
    }

    const sharedConnectionKey = resolveSharedConnectionKey(serverName, config);

    if (sharedConnectionKey) {
      const sharedExisting = this.sharedConnections.get(sharedConnectionKey);

      if (sharedExisting) {
        runtimeConnections.set(serverName, sharedExisting);
        let runtimeSharedKeys = this.runtimeSharedConnectionKeys.get(runtimeId);

        if (!runtimeSharedKeys) {
          runtimeSharedKeys = new Set<string>();
          this.runtimeSharedConnectionKeys.set(runtimeId, runtimeSharedKeys);
        }

        if (!runtimeSharedKeys.has(sharedConnectionKey)) {
          runtimeSharedKeys.add(sharedConnectionKey);
          sharedExisting.refCount += 1;
        }

        return sharedExisting.client;
      }
    }

    const transport = createTransport(config);
    const client = new Client({
      name: "sa-agent-desktop",
      version: "0.1.0",
    });
    await client.connect(transport);

    if (sharedConnectionKey) {
      const sharedConnection: SharedConnection = {
        client,
        transport,
        key: sharedConnectionKey,
        refCount: 1,
      };
      this.sharedConnections.set(sharedConnectionKey, sharedConnection);
      runtimeConnections.set(serverName, sharedConnection);
      let runtimeSharedKeys = this.runtimeSharedConnectionKeys.get(runtimeId);

      if (!runtimeSharedKeys) {
        runtimeSharedKeys = new Set<string>();
        this.runtimeSharedConnectionKeys.set(runtimeId, runtimeSharedKeys);
      }

      runtimeSharedKeys.add(sharedConnectionKey);
      return client;
    }

    runtimeConnections.set(serverName, { client, transport });
    return client;
  }
}

export function resolveSharedConnectionKey(
  serverName: string,
  config: AgentMcpServerConfig | undefined,
) {
  if (!config?.command) {
    return null;
  }

  return JSON.stringify({
    serverName,
    command: config.command,
    args: Array.isArray(config.args) ? config.args : [],
    env: normalizeEnv(config.env) ?? null,
  });
}

function createTransport(config: AgentMcpServerConfig) {
  if (config.command) {
    return new StdioClientTransport({
      command: config.command,
      args: Array.isArray(config.args) ? config.args : [],
      env: normalizeEnv(config.env),
    });
  }

  if (config.url) {
    return new StreamableHTTPClientTransport(new URL(config.url));
  }

  throw new Error("MCP server config must define either command or url.");
}

function normalizeEnv(input: AgentMcpServerConfig["env"]) {
  if (!input || typeof input !== "object") {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(input).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === "string" && typeof entry[1] === "string",
    ),
  );
}

function normalizeToolContent(content: unknown): McpToolCallContentItem[] {
  if (!Array.isArray(content)) {
    return [];
  }

  return content.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    if ("type" in item && item.type === "text" && "text" in item && typeof item.text === "string") {
      return [{ type: "text", text: item.text }];
    }

    return [{ type: String((item as { type?: unknown }).type ?? "unknown"), ...(item as Record<string, unknown>) }];
  });
}
