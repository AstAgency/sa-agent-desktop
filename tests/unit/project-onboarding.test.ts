import { describe, expect, it, vi } from "vitest";
import * as api from "../../src/renderer/lib/api";
import { completeProjectOnboardingFlow, extractProjectOnboardingPayloadFromJob } from "../../src/renderer/lib/project-onboarding";

describe("project onboarding", () => {
  it("extracts generic onboarding payload from a completed project job output", () => {
    expect(
      extractProjectOnboardingPayloadFromJob({
        id: "job-1",
        status: "completed",
        output_payload: {
          name: "Output Emil",
          agent_name: "Output Orbit",
          domain: "Output Strategy",
        },
      }),
    ).toEqual({
      name: "Output Emil",
      agent_name: "Output Orbit",
      domain: "Output Strategy",
    });
  });

  it("posts raw job payload to project onboarding after the project skill run completes", async () => {
    const createProjectSkillRunSpy = vi.spyOn(api, "createProjectSkillRun").mockResolvedValue({ job_id: "job-1" });
    const postProjectOnboardingSpy = vi.spyOn(api, "postProjectOnboarding").mockResolvedValue({
      id: "p-1",
      workspace_id: "ws-1",
      key: "atlas",
      name: "Atlas",
      description: "First project",
      onboarding_skill_id: "project-onboard",
      onboarding_payload: { name: "Output Emil", agent_name: "Output Orbit", domain: "Output Strategy" },
      preferred_user_name: "Output Emil",
      preferred_agent_name: "Output Orbit",
      activity_domain: "Output Strategy",
      onboarding_completed: true,
      onboarding_completed_at: "2026-05-06T12:10:00.000Z",
      lifecycle_state: "active",
      created_by_user_id: "demo-user-1",
      created_at: "2026-05-06T12:00:00.000Z",
      updated_at: "2026-05-06T12:10:00.000Z",
    });

    const job = await completeProjectOnboardingFlow({
      projectId: "p-1",
      values: {
        name: "Input Emil",
        agent_name: "Input Orbit",
        domain: "Input Strategy",
      },
      createProjectSkillRun: createProjectSkillRunSpy,
      getJob: vi.fn().mockResolvedValue({
        id: "job-1",
        status: "completed",
        output_payload: {
          name: "Output Emil",
          agent_name: "Output Orbit",
          domain: "Output Strategy",
        },
      }),
      postProjectOnboarding: postProjectOnboardingSpy,
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    expect(job.status).toBe("completed");
    expect(createProjectSkillRunSpy).toHaveBeenCalledWith(
      "p-1",
      {
        skill_id: "project-onboard",
        input_payload: {
          name: "Input Emil",
          agent_name: "Input Orbit",
          domain: "Input Strategy",
        },
      },
      undefined,
      expect.any(AbortSignal),
    );
    expect(postProjectOnboardingSpy).toHaveBeenCalledWith(
      "p-1",
      {
        skill_id: "project-onboard",
        payload: {
          name: "Output Emil",
          agent_name: "Output Orbit",
          domain: "Output Strategy",
        },
      },
      undefined,
      expect.any(AbortSignal),
    );

    createProjectSkillRunSpy.mockRestore();
    postProjectOnboardingSpy.mockRestore();
  });

  it("does not post project onboarding when the skill job fails", async () => {
    const createProjectSkillRunSpy = vi.spyOn(api, "createProjectSkillRun").mockResolvedValue({ job_id: "job-1" });
    const postProjectOnboardingSpy = vi.spyOn(api, "postProjectOnboarding").mockResolvedValue({
      id: "p-1",
      workspace_id: "ws-1",
      key: "atlas",
      name: "Atlas",
      description: null,
      onboarding_skill_id: "project-onboard",
      onboarding_payload: { name: "Output Emil", agent_name: "Output Orbit", domain: "Output Strategy" },
      preferred_user_name: "Output Emil",
      preferred_agent_name: "Output Orbit",
      activity_domain: "Output Strategy",
      onboarding_completed: true,
      onboarding_completed_at: "2026-05-06T12:10:00.000Z",
      lifecycle_state: "active",
      created_by_user_id: "demo-user-1",
      created_at: "2026-05-06T12:00:00.000Z",
      updated_at: "2026-05-06T12:10:00.000Z",
    });

    await expect(
      completeProjectOnboardingFlow({
        projectId: "p-1",
        values: {
          name: "Input Emil",
          agent_name: "Input Orbit",
          domain: "Input Strategy",
        },
        createProjectSkillRun: createProjectSkillRunSpy,
        getJob: vi.fn().mockResolvedValue({
          id: "job-1",
          status: "failed",
        }),
        postProjectOnboarding: postProjectOnboardingSpy,
        sleep: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toThrowError("Project onboarding job failed.");

    expect(postProjectOnboardingSpy).not.toHaveBeenCalled();

    createProjectSkillRunSpy.mockRestore();
    postProjectOnboardingSpy.mockRestore();
  });
});
