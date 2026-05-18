import { updateGlobalMemory } from "../../lib/api";
import { setState } from "../store";

export async function saveGlobalMemory(content: string) {
  const profile = await updateGlobalMemory(content);
  setState((state) => ({ ...state, profile }));
}
