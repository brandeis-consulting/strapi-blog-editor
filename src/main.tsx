import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { PreviewWindow } from "./components/PreviewWindow";
import { PREVIEW_WINDOW_PATH } from "./lib/previewChannel";
import "./styles/global.scss";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root element");

// Das abgekoppelte Vorschaufenster ist dieselbe App unter einem zweiten Pfad —
// ohne Login und ohne Editor, nur der Vorschau-iframe.
const isPreviewWindow = window.location.pathname === PREVIEW_WINDOW_PATH;

createRoot(rootEl).render(
  <StrictMode>{isPreviewWindow ? <PreviewWindow /> : <App />}</StrictMode>,
);
