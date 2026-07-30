"use client";

import QuickCommandCenter from "./QuickCommandCenter";
import WorkspaceBackBar from "./WorkspaceBackBar";

export default function WorkspaceFloatingControls() {
  return (
    <div
      className="app-floating-control-group"
      data-floating-control-group="true"
      data-protected-floating-pair="true"
    >
      <WorkspaceBackBar />
      <QuickCommandCenter />
    </div>
  );
}
