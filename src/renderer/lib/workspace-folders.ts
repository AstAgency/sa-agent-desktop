import { getBridge } from "./bridge";

export async function openProjectFolder(projectId: string): Promise<void> {
  try {
    await getBridge().fs.openProjectRoot(projectId);
  } catch (error) {
    console.error("[workspace-folders] openProjectFolder", error);
  }
}

export async function openGlobalRoot(): Promise<void> {
  try {
    await getBridge().fs.openWorkspaceRoot("global");
  } catch (error) {
    console.error("[workspace-folders] openGlobalRoot", error);
  }
}

export async function openProjectsRoot(): Promise<void> {
  try {
    await getBridge().fs.openWorkspaceRoot("projects");
  } catch (error) {
    console.error("[workspace-folders] openProjectsRoot", error);
  }
}
