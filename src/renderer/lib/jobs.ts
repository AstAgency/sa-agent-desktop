import { createProjectSkillRun, createSkillRun, getJob, postMeOnboarding, postProjectOnboarding } from "./api";
import type { JobRecord, OnboardingPayload } from "./types";

export const defaultOnboardingPollTimeoutMs = 60_000;

export function nextPollDelayMs(attempt: number) {
  return Math.min(1000 * 2 ** attempt, 5000);
}

function createAbortError() {
  return new DOMException("The operation was aborted.", "AbortError");
}

export function sleep(delayMs: number, signal?: AbortSignal) {
  if (signal?.aborted) {
    return Promise.reject(createAbortError());
  }

  return new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);

    const onAbort = () => {
      window.clearTimeout(timeoutId);
      reject(createAbortError());
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function mergeAbortSignals(signals: Array<AbortSignal | undefined>) {
  const controller = new AbortController();

  const abort = () => {
    controller.abort();
  };

  for (const signal of signals) {
    if (!signal) {
      continue;
    }

    if (signal.aborted) {
      controller.abort();
      break;
    }

    signal.addEventListener("abort", abort, { once: true });
  }

  return controller.signal;
}

function createTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    clear: () => window.clearTimeout(timeoutId),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function extractOnboardingPayloadFromJob(job: Pick<JobRecord, "output_payload">) {
  if (!isRecord(job.output_payload)) {
    throw new Error("Completed onboarding job did not return a valid payload.");
  }

  return job.output_payload;
}

export async function pollJobUntilTerminal(input: {
  jobId: string;
  getJob?: (jobId: string, signal?: AbortSignal) => Promise<JobRecord>;
  sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  signal?: AbortSignal;
}) {
  const loadJob = input.getJob ?? getJob;
  const wait = input.sleep ?? sleep;

  let attempt = 0;

  while (true) {
    if (input.signal?.aborted) {
      throw createAbortError();
    }

    await wait(nextPollDelayMs(attempt), input.signal);
    const job = await loadJob(input.jobId, input.signal);

    if (job.status === "completed" || job.status === "failed") {
      return job;
    }

    attempt += 1;
  }
}

export async function runUserOnboarding(input: {
  workspaceId: string;
  values: OnboardingPayload;
  signal?: AbortSignal;
  timeoutMs?: number;
}) {
  const timeout = createTimeoutSignal(input.timeoutMs ?? defaultOnboardingPollTimeoutMs);
  const signal = mergeAbortSignals([input.signal, timeout.signal]);

  try {
    const accepted = await createSkillRun(
      {
        workspace_id: input.workspaceId,
        skill_id: "onboard",
        input_payload: input.values,
      },
      undefined,
      signal,
    );

    const job = await pollJobUntilTerminal({
      jobId: accepted.job_id,
      signal,
    });

    if (job.status === "failed") {
      throw new Error("Onboarding job failed.");
    }

    await postMeOnboarding(
      {
        skill_id: "onboard",
        payload: extractOnboardingPayloadFromJob(job),
      },
      undefined,
      signal,
    );

    return job;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError" && !input.signal?.aborted) {
      throw new Error("Onboarding timed out. Retry to continue.");
    }

    throw error;
  } finally {
    timeout.clear();
  }
}

export async function runProjectOnboarding(input: {
  projectId: string;
  values: OnboardingPayload;
  signal?: AbortSignal;
  timeoutMs?: number;
}) {
  const timeout = createTimeoutSignal(input.timeoutMs ?? defaultOnboardingPollTimeoutMs);
  const signal = mergeAbortSignals([input.signal, timeout.signal]);

  try {
    const accepted = await createProjectSkillRun(
      input.projectId,
      {
        skill_id: "project-onboard",
        input_payload: input.values,
      },
      undefined,
      signal,
    );

    const job = await pollJobUntilTerminal({
      jobId: accepted.job_id,
      signal,
    });

    if (job.status === "failed") {
      throw new Error("Project onboarding job failed.");
    }

    await postProjectOnboarding(
      input.projectId,
      {
        skill_id: "project-onboard",
        payload: extractOnboardingPayloadFromJob(job),
      },
      undefined,
      signal,
    );

    return job;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError" && !input.signal?.aborted) {
      throw new Error("Project onboarding timed out. Retry to continue.");
    }

    throw error;
  } finally {
    timeout.clear();
  }
}
