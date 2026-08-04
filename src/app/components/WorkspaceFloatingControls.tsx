"use client";

import { useEffect, useState } from "react";
import QuickCommandCenter from "./QuickCommandCenter";
import WorkspaceBackBar from "./WorkspaceBackBar";

export default function WorkspaceFloatingControls() {
  const [captureModeActive, setCaptureModeActive] = useState(false);

  useEffect(() => {
    function syncCaptureMode() {
      setCaptureModeActive(
        document.body.classList.contains("trimax-remittance-capture-active")
      );
    }

    syncCaptureMode();
    window.addEventListener("trimax-remittance-capture-mode", syncCaptureMode);

    return () => {
      window.removeEventListener(
        "trimax-remittance-capture-mode",
        syncCaptureMode
      );
    };
  }, []);

  return (
    <div
      className={`app-floating-control-group ${
        captureModeActive ? "hidden" : ""
      }`}
      data-floating-control-group="true"
      data-protected-floating-pair="true"
      data-remittance-capture-hidden={captureModeActive ? "true" : "false"}
    >
      <WorkspaceBackBar />
      <QuickCommandCenter />
    </div>
  );
}
