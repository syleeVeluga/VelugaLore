import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DesktopApp } from "./DesktopApp.js";
import { createTauriDesktopApi } from "./desktop-api.js";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DesktopApp api={createTauriDesktopApi()} />
  </StrictMode>
);
