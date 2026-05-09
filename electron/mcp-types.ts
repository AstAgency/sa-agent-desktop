export type AgentMcpServerConfig = {
  description?: string | null;
  transport?: string | null;
  url?: string | null;
  command?: string | null;
  args?: string[] | null;
  env?: Record<string, string> | null;
  [key: string]: unknown;
};

export type McpToolDescriptor = {
  serverName: string;
  name: string;
  title?: string | null;
  description?: string | null;
  inputSchema?: Record<string, unknown> | null;
};

export type McpToolCallContentItem =
  | {
      type: "text";
      text: string;
    }
  | {
      type: string;
      [key: string]: unknown;
    };

export type McpToolCallResult = {
  serverName: string;
  toolName: string;
  content?: McpToolCallContentItem[] | null;
  structuredContent?: unknown;
  isError: boolean;
};
