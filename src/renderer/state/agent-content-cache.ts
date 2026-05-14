import type { AgentRole, AgentSkill } from "../lib/types";

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

type Entry<T> = {
  payload: T;
  expiresAt: number;
};

type Bucket = {
  skills?: Entry<AgentSkill[]>;
  roles?: Entry<AgentRole[]>;
};

export type AgentContentCacheOptions = {
  now?: () => number;
  ttlMs?: number;
};

export type AgentContentCache = {
  setSkills: (agentKey: string, skills: AgentSkill[]) => void;
  setRoles: (agentKey: string, roles: AgentRole[]) => void;
  getSkillsList: (agentKey: string) => AgentSkill[] | null;
  getRolesList: (agentKey: string) => AgentRole[] | null;
  getSkill: (agentKey: string, name: string) => AgentSkill | null;
  getRole: (agentKey: string, name: string) => AgentRole | null;
  clear: (agentKey?: string) => void;
};

export function createAgentContentCache(options: AgentContentCacheOptions = {}): AgentContentCache {
  const now = options.now ?? Date.now;
  const ttl = options.ttlMs ?? TWELVE_HOURS_MS;
  const buckets = new Map<string, Bucket>();

  function bucket(agentKey: string): Bucket {
    let value = buckets.get(agentKey);
    if (!value) {
      value = {};
      buckets.set(agentKey, value);
    }
    return value;
  }

  function readEntry<T>(entry: Entry<T> | undefined): T | null {
    if (!entry) return null;
    if (entry.expiresAt <= now()) return null;
    return entry.payload;
  }

  return {
    setSkills(agentKey, skills) {
      bucket(agentKey).skills = { payload: skills, expiresAt: now() + ttl };
    },
    setRoles(agentKey, roles) {
      bucket(agentKey).roles = { payload: roles, expiresAt: now() + ttl };
    },
    getSkillsList(agentKey) {
      return readEntry(buckets.get(agentKey)?.skills);
    },
    getRolesList(agentKey) {
      return readEntry(buckets.get(agentKey)?.roles);
    },
    getSkill(agentKey, name) {
      const list = readEntry(buckets.get(agentKey)?.skills);
      if (!list) return null;
      return list.find((skill) => skill.name === name) ?? null;
    },
    getRole(agentKey, name) {
      const list = readEntry(buckets.get(agentKey)?.roles);
      if (!list) return null;
      return list.find((role) => role.name === name) ?? null;
    },
    clear(agentKey) {
      if (agentKey === undefined) buckets.clear();
      else buckets.delete(agentKey);
    },
  };
}
