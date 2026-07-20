"use client";

import { ReactNode, useState } from "react";

type PersistentDetailsProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  defaultOpen?: boolean;
  storageKey: string;
  subtitle?: string;
  summaryMeta?: ReactNode;
  title: string;
};

export default function PersistentDetails({
  children,
  className = "",
  contentClassName = "mt-3",
  defaultOpen = false,
  storageKey,
  subtitle,
  summaryMeta,
  title,
}: PersistentDetailsProps) {
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") {
      return defaultOpen;
    }

    const saved = window.localStorage.getItem(storageKey);

    if (saved === "open") {
      return true;
    }

    if (saved === "closed") {
      return false;
    }

    return defaultOpen;
  });

  return (
    <details
      className={className}
      open={open}
      onToggle={(event) => {
        const nextOpen = event.currentTarget.open;

        setOpen(nextOpen);
        window.localStorage.setItem(storageKey, nextOpen ? "open" : "closed");
      }}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-xs font-black uppercase tracking-[0.22em] text-zinc-400">
            {title}
          </span>
          {subtitle ? (
            <span className="mt-1 block truncate text-sm font-bold text-white">
              {subtitle}
            </span>
          ) : null}
        </span>
        {summaryMeta ? <span className="shrink-0">{summaryMeta}</span> : null}
      </summary>

      <div className={contentClassName}>{children}</div>
    </details>
  );
}
