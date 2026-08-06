"use client";

import { useEffect, useState } from "react";
import QuickCommandCenter from "./QuickCommandCenter";
import WorkspaceBackBar from "./WorkspaceBackBar";

type WorkspaceFloatingControlsProps = {
  hidden?: boolean;
};

export default function WorkspaceFloatingControls({
  hidden = false,
}: WorkspaceFloatingControlsProps) {
  const [captureModeActive, setCaptureModeActive] = useState(false);
  const isHidden = hidden || captureModeActive;

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
        isHidden ? "hidden" : ""
      }`}
      style={isHidden ? { display: "none" } : undefined}
      aria-hidden={isHidden}
      data-floating-control-group="true"
      data-protected-floating-pair="true"
      data-remittance-capture-hidden={isHidden ? "true" : "false"}
    >
      <WorkspaceBackBar />
      <QuickCommandCenter />
    </div>
  );
}
