import { useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { ChatView } from "./components/ChatView";
import { bootstrap, startPythonRuntime } from "./state/controller";
import { useClientState } from "./state/store";

export function App() {
  const status = useClientState((state) => state.bootstrap.status);
  const error = useClientState((state) => state.bootstrap.error);
  const pythonReady = useClientState((state) => state.bootstrap.pythonReady);
  const pythonError = useClientState((state) => state.bootstrap.pythonError);

  useEffect(() => {
    void initialize();
  }, []);

  if (status !== "ready") {
    return (
      <section className="boot-screen">
        <h1>SA-Agent Desktop</h1>
        <p>
          {status === "loading"
            ? "Connecting to backend…"
            : status === "error"
              ? "Failed to bootstrap"
              : "Starting…"}
        </p>
        {!pythonReady ? (
          <p style={{ color: "var(--text-muted)" }}>
            Starting local Python runtime{pythonError ? ` — ${pythonError}` : "…"}
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
            Retry
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <ChatView />
    </div>
  );
}

async function initialize() {
  void startPythonRuntime();
  await bootstrap();
}
