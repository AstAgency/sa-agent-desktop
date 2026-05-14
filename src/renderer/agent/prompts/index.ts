/**
 * Prompt registry.
 *
 * Every hardcoded section that ends up in the system prompt lives here as
 * a separately commented module. The prompt builder composes them in the
 * fixed order documented below — keep it stable so model behavior stays
 * reproducible.
 *
 * Order (top → bottom):
 *   1. agent.system_prompt              (from backend; may be empty)
 *   2. execution-discipline             (no empty promises)
 *   3. capabilities                     (what exists / what doesn't)
 *   4. completion-policy                (allowed end states, no looping)
 *   5. skills-policy + <skills>         (only if agent has skills)
 *   6. roles-policy + <roles>           (only if agent has roles)
 *   7. orchestration_protocol           (only if agent carries one)
 *   8. <global_memory>                  (per profile)
 *   9. <project_memory>                 (per project)
 *  10. <relevant_context>               (semantic memory)
 *  11. <available_tools>                (manifest for the LLM)
 */
export { EXECUTION_DISCIPLINE_PROMPT } from "./execution-discipline";
export { CAPABILITIES_PROMPT } from "./capabilities";
export { COMPLETION_POLICY_PROMPT } from "./completion-policy";
export { SKILLS_POLICY_PROMPT, buildSkillsBlock } from "./skills-policy";
export { ROLES_POLICY_PROMPT, buildRolesBlock } from "./roles-policy";
export { buildOrchestrationBlock } from "./orchestration";
