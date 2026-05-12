import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { getState } from "./state/store";

const initial = getState();
document.documentElement.setAttribute("data-theme", initial.theme);
document.documentElement.setAttribute("lang", initial.language);

const container = document.getElementById("root");
if (!container) throw new Error("Root element not found");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
