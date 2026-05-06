import {
  createProjectSkillRun as createProjectSkillRunApi,
  getJob as getJobApi,
  postProjectOnboarding as postProjectOnboardingApi,
} from "./api";
import { defaultOnboardingPollTimeoutMs, pollJobUntilTerminal, sleep as defaultSleep } from "./jobs";
import type { JobRecord, OnboardingPayload } from "./types";

function createAbortError() {
  return new DOMException("The operation was aborted.", "AbortError");
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

export function extractProjectOnboardingPayloadFromJob(job: Pick<JobRecord, "output_payload">) {
  if (!isRecord(job.output_payload)) {
    throw new Error("Completed project onboarding job did not return a valid payload.");
  }

  return job.output_payload;
}

export async function completeProjectOnboardingFlow(input: {
  projectId: string;
  values: OnboardingPayload;
  signal?: AbortSignal;
  timeoutMs?: number;
  createProjectSkillRun?: typeof createProjectSkillRunApi;
  getJob?: typeof getJobApi;
  postProjectOnboarding?: typeof postProjectOnboardingApi;
  sleep?: typeof defaultSleep;
}) {
  const timeout = createTimeoutSignal(input.timeoutMs ?? defaultOnboardingPollTimeoutMs);
  const signal = mergeAbortSignals([input.signal, timeout.signal]);
  const createProjectSkillRun = input.createProjectSkillRun ?? createProjectSkillRunApi;
  const getJob = input.getJob ?? getJobApi;
  const postProjectOnboarding = input.postProjectOnboarding ?? postProjectOnboardingApi;
  const sleep = input.sleep ?? defaultSleep;

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
      getJob,
      sleep,
      signal,
    });

    if (job.status === "failed") {
      throw new Error("Project onboarding job failed.");
    }

    await postProjectOnboarding(
      input.projectId,
      {
        skill_id: "project-onboard",
        payload: extractProjectOnboardingPayloadFromJob(job),
      },
      undefined,
      signal,
    );

    return job;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError" && !input.signal?.aborted) {
      throw new Error("Project onboarding timed out. Retry to continue.");
    }

    if (input.signal?.aborted) {
      throw createAbortError();
    }

    throw error;
  } finally {
    timeout.clear();
  }
}
