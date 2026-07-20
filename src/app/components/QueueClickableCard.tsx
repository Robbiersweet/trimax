"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

type QueueClickableCardProps = {
  href: string;
  label: string;
  className?: string;
  children: ReactNode;
};

function isInteractiveTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'a, button, details, summary, input, select, textarea, [role="button"], [data-queue-row-control="true"]'
      )
    )
  );
}

export default function QueueClickableCard({
  href,
  label,
  className = "",
  children,
}: QueueClickableCardProps) {
  const router = useRouter();

  const openDetail = () => {
    router.push(href);
  };

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (isInteractiveTarget(event.target)) {
      return;
    }

    openDetail();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isInteractiveTarget(event.target)) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDetail();
    }
  };

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={label}
      data-queue-row-link="true"
      data-href={href}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`app-card min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-lg transition hover:border-sky-400/60 hover:bg-zinc-900/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 sm:p-5 md:cursor-pointer ${className}`}
    >
      {children}
    </div>
  );
}
