import { describe, expect, it, vi } from "vitest";
import {
  defaultOnboardingPollTimeoutMs,
  extractOnboardingPayloadFromJob,
  nextPollDelayMs,
  pollJobUntilTerminal,
  runUserOnboarding,
} from "../../src/renderer/lib/jobs";
import * as api from "../../src/renderer/lib/api";

describe("jobs polling", () => {
  it("uses 1s then 2s then caps at 5s", () => {
    expect(nextPollDelayMs(0)).toBe(1000);
    expect(nextPollDelayMs(1)).toBe(2000);
    expect(nextPollDelayMs(2)).toBe(4000);
    expect(nextPollDelayMs(3)).toBe(5000);
    expect(nextPollDelayMs(4)).toBe(5000);
  });

  it("waits 1 second before the first job read, then stops polling when the job completes", async () => {
    const getJob = vi
      .fn<() => Promise<{ id: string; status: "queued" | "running" | "completed" }>>()
      .mockResolvedValueOnce({ id: "job-1", status: "queued" })
      .mockResolvedValueOnce({ id: "job-1", status: "running" })
      .mockResolvedValueOnce({ id: "job-1", status: "completed" });
    const sleep = vi.fn<(delayMs: number) => Promise<void>>().mockResolvedValue(undefined);

    const job = await pollJobUntilTerminal({
      jobId: "job-1",
      getJob,
      sleep,
    });

    expect(job.status).toBe("completed");
    expect(sleep).toHaveBeenNthCalledWith(1, 1000, undefined);
    expect(getJob).toHaveBeenNthCalledWith(1, "job-1", undefined);
    expect(sleep).toHaveBeenNthCalledWith(2, 2000, undefined);
    expect(getJob).toHaveBeenNthCalledWith(2, "job-1", undefined);
    expect(sleep).toHaveBeenNthCalledWith(3, 4000, undefined);
    expect(getJob).toHaveBeenNthCalledWith(3, "job-1", undefined);
    expect(getJob).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it("waits before the first job read and stops polling when the job fails", async () => {
    const getJob = vi
      .fn<() => Promise<{ id: string; status: "running" | "failed" }>>()
      .mockResolvedValueOnce({ id: "job-1", status: "running" })
      .mockResolvedValueOnce({ id: "job-1", status: "failed" });
    const sleep = vi.fn<(delayMs: number) => Promise<void>>().mockResolvedValue(undefined);

    const job = await pollJobUntilTerminal({
      jobId: "job-1",
      getJob,
      sleep,
    });

    expect(job.status).toBe("failed");
    expect(getJob).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 1000, undefined);
    expect(getJob).toHaveBeenNthCalledWith(1, "job-1", undefined);
    expect(sleep).toHaveBeenNthCalledWith(2, 2000, undefined);
    expect(getJob).toHaveBeenNthCalledWith(2, "job-1", undefined);
  });

  it("extracts generic onboarding payload from a completed job output", () => {
    expect(
      extractOnboardingPayloadFromJob({
        id: "job-1",
        status: "completed",
        output_payload: {
          name: "Output Emil",
          agent_name: "Output Orbit",
          domain: "Output Strategy",
          tone: "delivery",
        },
      }),
    ).toEqual({
      name: "Output Emil",
      agent_name: "Output Orbit",
      domain: "Output Strategy",
      tone: "delivery",
    });
  });

  it("fails clearly when the completed job output is not an object payload", () => {
    expect(() =>
      extractOnboardingPayloadFromJob({
        id: "job-1",
        status: "completed",
        output_payload: "not-an-object",
      }),
    ).toThrowError("Completed onboarding job did not return a valid payload.");
  });

  it("returns a recoverable timeout error when onboarding polling exceeds the client timeout", async () => {
    vi.useFakeTimers();

    const createSkillRunSpy = vi.spyOn(api, "createSkillRun").mockResolvedValue({ job_id: "job-1" });
    const getJobSpy = vi.spyOn(api, "getJob").mockResolvedValue({
      id: "job-1",
      status: "running",
    });
    const postMeOnboardingSpy = vi.spyOn(api, "postMeOnboarding").mockResolvedValue({
      user_id: "user-1",
      email: null,
      display_name: null,
      onboarding_skill_id: "onboard",
      onboarding_payload: { name: "Emil", agent_name: "Orbit", domain: "Product strategy" },
      preferred_user_name: "Emil",
      preferred_agent_name: "Orbit",
      activity_domain: "Product strategy",
      onboarding_completed: true,
      onboarding_completed_at: "2026-05-06T12:00:00.000Z",
      created_at: "2026-05-06T12:00:00.000Z",
      updated_at: "2026-05-06T12:00:00.000Z",
    });

    const promise = runUserOnboarding({
      workspaceId: "ws-1",
      values: {
        name: "Emil",
        agent_name: "Orbit",
        domain: "Product strategy",
      },
      timeoutMs: defaultOnboardingPollTimeoutMs,
    });
    const timedOutExpectation = expect(promise).rejects.toThrowError("Onboarding timed out. Retry to continue.");

    await vi.advanceTimersByTimeAsync(defaultOnboardingPollTimeoutMs + 1);

    await timedOutExpectation;
    expect(createSkillRunSpy).toHaveBeenCalledTimes(1);
    expect(getJobSpy.mock.calls.length).toBeGreaterThan(0);
    expect(postMeOnboardingSpy).not.toHaveBeenCalled();

    createSkillRunSpy.mockRestore();
    getJobSpy.mockRestore();
    postMeOnboardingSpy.mockRestore();
  });
});
