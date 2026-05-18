import { useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { ChatView } from "./components/ChatView";
import { AuthScreen } from "./components/AuthScreen";
import { UserProfileModal } from "./components/UserProfileModal";
import { translate } from "./lib/i18n";
import { bootstrap, startPythonRuntime } from "./state/controller";
import { initializeAuth } from "./state/auth-controller";
import { useClientState } from "./state/store";

export function App() {
  const status = useClientState((state) => state.bootstrap.status);
  const error = useClientState((state) => state.bootstrap.error);
  const pythonReady = useClientState((state) => state.bootstrap.pythonReady);
  const pythonError = useClientState((state) => state.bootstrap.pythonError);
  const theme = useClientState((state) => state.theme);
  const language = useClientState((state) => state.language);
  const sidebarCollapsed = useClientState((state) => state.sidebarCollapsed);
  const profileModalOpen = useClientState((state) => state.profileModalOpen);
  const authStatus = useClientState((state) => state.auth.status);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("lang", language);
  }, [language]);

  useEffect(() => {
    void initialize();
  }, []);

  useEffect(() => {
    if (authStatus === "authenticated" && status === "idle") {
      void bootstrap();
    }
  }, [authStatus, status]);

  if (authStatus === "loading") {
    return (
      <section className="boot-screen">
        <h1>{translate(language, "app.title")}</h1>
        <p>{translate(language, "boot.starting")}</p>
        <div className="progress">
          <span />
        </div>
      </section>
    );
  }

  if (authStatus === "unauthenticated") {
    return <AuthScreen />;
  }

  if (status !== "ready") {
    return (
      <section className="boot-screen">
        <h1>{translate(language, "app.title")}</h1>
        <p>
          {status === "loading"
            ? translate(language, "boot.connecting")
            : status === "error"
              ? translate(language, "boot.failed")
              : translate(language, "boot.starting")}
        </p>
        {!pythonReady ? (
          <p style={{ color: "var(--text-muted)" }}>
            {translate(language, "boot.pythonStarting")}
            {pythonError ? ` — ${pythonError}` : "…"}
          </p>
        ) : null}
        {error ? (
          <pre className="boot-error">{error}</pre>
        ) : (
          <div className="progress">
            <span />
          </div>
        )}
        {status === "error" ? (
          <button
            onClick={() => {
              void bootstrap();
            }}
          >
            {translate(language, "boot.retry")}
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <div className={`app-shell${sidebarCollapsed ? " collapsed" : ""}`}>
      <Sidebar />
      <ChatView />
      {profileModalOpen ? <UserProfileModal /> : null}
    </div>
  );
}

async function initialize() {
  void startPythonRuntime();
  await initializeAuth();
}
