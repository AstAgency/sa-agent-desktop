export type CapabilityCategoryName =
  | "filesystem"
  | "python"
  | "network"
  | "agent_content"
  | "memory";

export type CapabilityName =
  | "edit_file"
  | "fetch_url"
  | "get_role"
  | "get_skill"
  | "list_files"
  | "list_python_packages"
  | "read_file"
  | "run_python"
  | "update_global_memory"
  | "update_project_memory"
  | "web_search"
  | "write_file";

export type CapabilityDefinition = {
  name: CapabilityName;
  category: CapabilityCategoryName;
};

export const CAPABILITY_REGISTRY: readonly CapabilityDefinition[] = [
  { name: "read_file", category: "filesystem" },
  { name: "write_file", category: "filesystem" },
  { name: "edit_file", category: "filesystem" },
  { name: "list_files", category: "filesystem" },
  { name: "list_python_packages", category: "python" },
  { name: "run_python", category: "python" },
  { name: "fetch_url", category: "network" },
  { name: "web_search", category: "network" },
  { name: "get_skill", category: "agent_content" },
  { name: "get_role", category: "agent_content" },
  { name: "update_global_memory", category: "memory" },
  { name: "update_project_memory", category: "memory" },
];

export function listAvailableCapabilityNames(
  registry: readonly CapabilityDefinition[],
): CapabilityName[] {
  return registry.map(({ name }) => name).sort((a, b) => a.localeCompare(b));
}

export function resolveAvailableCapabilities(
  registry: readonly CapabilityDefinition[],
  availableToolNames: readonly string[],
): CapabilityDefinition[] {
  const available = new Set(availableToolNames);
  return registry.filter(({ name }) => available.has(name));
}
