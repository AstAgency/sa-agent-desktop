import { useEffect, useRef, useState } from "react";
import { getBridge } from "../lib/bridge";
import { translate } from "../lib/i18n";
import { getCurrentBackendUrl } from "../lib/api";
import {
  setLanguage,
  setProfileModalOpen,
  setTheme,
  useClientState,
  type ThemeMode,
} from "../state/store";
import { signOut } from "../state/auth-controller";
import type { AppLanguage } from "../lib/i18n";
import type { SearchStatus } from "../lib/types";

export function UserProfileModal() {
  const language = useClientState((state) => state.language);
  const theme = useClientState((state) => state.theme);
  const profile = useClientState((state) => state.profile);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>({ state: "stopped" });
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const backdropRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setProfileModalOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getBridge()
      .net.getSearchStatus()
      .then((status) => {
        if (cancelled) return;
        setSearchStatus(status);
      })
      .catch((error) => {
        if (cancelled) return;
        setSearchError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const displayName = profile?.name ?? translate(language, "profile.unknown");
  const initials = getInitials(displayName);

  async function handleSearchStart() {
    setSearchBusy(true);
    setSearchError(null);
    setSearchStatus({ state: "starting" });
    try {
      const next = await getBridge().net.startSearch();
      setSearchStatus(next);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSearchError(message);
      setSearchStatus({ state: "failed", error: message });
    } finally {
      setSearchBusy(false);
    }
  }

  const statusBadge = renderStatusBadge(searchStatus, language);
  const canStart =
    searchStatus.state !== "running" &&
    searchStatus.state !== "starting" &&
    searchStatus.state !== "unsupported" &&
    !searchBusy;

  return (
    <div
      ref={backdropRef}
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === backdropRef.current) setProfileModalOpen(false);
      }}
    >
      <div className="profile-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="header">
          <div className="avatar">{initials}</div>
          <div className="title-block">
            <h2>{displayName}</h2>
            <span className="sub">{translate(language, "profile.subtitle")}</span>
          </div>
        </div>

        <div className="section">
          <h3>{translate(language, "profile.section.preferences")}</h3>
          <div className="setting-row">
            <span className="label">{translate(language, "profile.theme")}</span>
            <div className="segmented" role="tablist">
              <button
                role="tab"
                aria-selected={theme === "dark"}
                className={theme === "dark" ? "active" : ""}
                onClick={() => setTheme("dark" satisfies ThemeMode)}
              >
                {translate(language, "profile.theme.dark")}
              </button>
              <button
                role="tab"
                aria-selected={theme === "light"}
                className={theme === "light" ? "active" : ""}
                onClick={() => setTheme("light" satisfies ThemeMode)}
              >
                {translate(language, "profile.theme.light")}
              </button>
            </div>
          </div>
          <div className="setting-row">
            <span className="label">{translate(language, "profile.language")}</span>
            <div className="segmented" role="tablist">
              <button
                role="tab"
                aria-selected={language === "en"}
                className={language === "en" ? "active" : ""}
                onClick={() => setLanguage("en" satisfies AppLanguage)}
              >
                {translate(language, "profile.language.en")}
              </button>
              <button
                role="tab"
                aria-selected={language === "ru"}
                className={language === "ru" ? "active" : ""}
                onClick={() => setLanguage("ru" satisfies AppLanguage)}
              >
                {translate(language, "profile.language.ru")}
              </button>
            </div>
          </div>
        </div>

        <div className="section">
          <h3>{translate(language, "profile.section.account")}</h3>
          {profile ? (
            <div className="detail-row">
              <span className="key">{translate(language, "profile.userId")}</span>
              <span className="value" title={profile.id}>{profile.id}</span>
            </div>
          ) : null}
          <div className="detail-row">
            <span className="key">{translate(language, "profile.backend")}</span>
            <span className="value" title={getCurrentBackendUrl()}>{getCurrentBackendUrl()}</span>
          </div>
        </div>

        <div className="section">
          <h3>{translate(language, "profile.section.search")}</h3>
          <p className="profile-search-description">
            {translate(language, "profile.search.description")}
          </p>
          <div className="detail-row">
            <span className="key">{translate(language, "profile.search.status")}</span>
            <span className={`value status-badge status-${searchStatus.state}`}>
              {statusBadge}
            </span>
          </div>
          <div className="profile-inline-actions">
            <button
              className="primary"
              type="button"
              onClick={() => void handleSearchStart()}
              disabled={!canStart}
            >
              {searchBusy || searchStatus.state === "starting"
                ? translate(language, "profile.search.starting")
                : translate(language, "profile.search.start")}
            </button>
          </div>
          {searchError && searchStatus.state !== "failed" ? (
            <div className="profile-status error">{searchError}</div>
          ) : null}
        </div>

        <div className="footer">
          <button
            className="secondary"
            onClick={() => {
              setProfileModalOpen(false);
              signOut();
            }}
          >
            {translate(language, "auth.signOut")}
          </button>
          <button className="primary" onClick={() => setProfileModalOpen(false)}>
            {translate(language, "profile.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

function getInitials(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function renderStatusBadge(status: SearchStatus, language: AppLanguage): string {
  switch (status.state) {
    case "running":
      return translate(language, "profile.search.status.running", { port: String(status.port) });
    case "starting":
      return translate(language, "profile.search.status.starting");
    case "unsupported":
      return translate(language, "profile.search.status.unsupported", {
        reason: status.reason,
      });
    case "failed":
      return translate(language, "profile.search.status.failed", { error: status.error });
    case "stopped":
    default:
      return translate(language, "profile.search.status.stopped");
  }
}
