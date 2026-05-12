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
import type { AppLanguage } from "../lib/i18n";

export function UserProfileModal() {
  const language = useClientState((state) => state.language);
  const theme = useClientState((state) => state.theme);
  const profile = useClientState((state) => state.profile);
  const [searchEndpoint, setSearchEndpoint] = useState("");
  const [defaultSearchEndpoint, setDefaultSearchEndpoint] = useState("http://localhost:8000");
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
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
      .net.getSearchConfig()
      .then((config) => {
        if (cancelled) return;
        setSearchEndpoint(config.endpoint);
        setDefaultSearchEndpoint(config.defaultEndpoint);
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

  async function handleSearchSave() {
    setSearchBusy(true);
    setSearchMessage(null);
    setSearchError(null);
    try {
      const config = await getBridge().net.setSearchEndpoint(searchEndpoint);
      setSearchEndpoint(config.endpoint);
      setDefaultSearchEndpoint(config.defaultEndpoint);
      await getBridge().net.testSearchEndpoint(config.endpoint);
      setSearchMessage(translate(language, "profile.search.testOk"));
    } catch (error) {
      setSearchError(
        `${translate(language, "profile.search.testFail")}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      setSearchBusy(false);
    }
  }

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
          <label className="profile-field">
            <span className="field-label">{translate(language, "profile.search.endpoint")}</span>
            <input
              type="url"
              value={searchEndpoint}
              placeholder={defaultSearchEndpoint}
              onChange={(event) => {
                setSearchEndpoint(event.target.value);
                setSearchMessage(null);
                setSearchError(null);
              }}
            />
            <span className="field-hint">
              {translate(language, "profile.search.endpointHint")}
            </span>
          </label>
          <div className="profile-inline-actions">
            <button
              className="primary"
              type="button"
              onClick={() => void handleSearchSave()}
              disabled={searchBusy}
            >
              {searchBusy
                ? translate(language, "profile.search.saving")
                : translate(language, "profile.search.save")}
            </button>
          </div>
          {searchMessage ? <div className="profile-status ok">{searchMessage}</div> : null}
          {searchError ? <div className="profile-status error">{searchError}</div> : null}
        </div>

        <div className="footer">
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
