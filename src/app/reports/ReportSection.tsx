import type { ReactNode } from "react";
import { cardSurface } from "../components/Card";

export function ReportSection({
  id, title, className = "", defaultOpen = false, children,
}: {
  id: string; title: string; className?: string; defaultOpen?: boolean; children: ReactNode;
}) {
  return (
    <details id={id} open={defaultOpen} data-report-section={id}
      className={`${cardSurface} report-fold scroll-mt-24 ${className}`}>
      <summary className="report-fold-heading">
        <h2>{title}</h2>
        <span className="report-fold-chevron" aria-hidden="true" />
      </summary>
      <div className="report-fold-content">{children}</div>
    </details>
  );
}

export function ReportSectionControls() {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Report sections">
      <button className="report-fold-control" type="button" data-report-set-open="true">Expand all</button>
      <button className="report-fold-control" type="button" data-report-set-open="false">Collapse all</button>
    </div>
  );
}
