"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

export const TRIMAX_REFRESH_EVENT = "trimax:data-refresh-requested";

function formatUpdatedTime(date: Date) {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function TrimaxRefreshControl() {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function closeMenu(event: MouseEvent) {
      if (
        menuRef.current &&
        event.target instanceof Node &&
        !menuRef.current.contains(event.target)
      ) {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", closeMenu);

    return () => document.removeEventListener("mousedown", closeMenu);
  }, []);

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/request-access") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password")
  ) {
    return null;
  }

  function refreshData() {
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    setIsMenuOpen(false);
    setIsRefreshing(true);
    window.dispatchEvent(new CustomEvent(TRIMAX_REFRESH_EVENT));

    startTransition(() => {
      router.refresh();
    });

    window.setTimeout(() => {
      window.scrollTo(scrollX, scrollY);
      setUpdatedAt(new Date());
      setIsRefreshing(false);
    }, 650);
  }

  function reloadApplication() {
    setIsMenuOpen(false);
    window.location.reload();
  }

  const busy = isRefreshing || isPending;

  return (
    <div className="trimax-refresh-control" ref={menuRef}>
      <button
        type="button"
        className="trimax-refresh-primary"
        onClick={refreshData}
        disabled={busy}
        aria-live="polite"
      >
        <span
          className="trimax-refresh-spinner"
          data-active={busy}
          aria-hidden="true"
        />
        <span>{busy ? "Refreshing" : "Refresh"}</span>
      </button>

      <button
        type="button"
        className="trimax-refresh-menu-button"
        onClick={() => setIsMenuOpen((current) => !current)}
        aria-expanded={isMenuOpen}
        aria-label="Refresh options"
      >
        <span aria-hidden="true">v</span>
      </button>

      {updatedAt ? (
        <span className="trimax-refresh-updated">
          Updated just now at {formatUpdatedTime(updatedAt)}
        </span>
      ) : null}

      {isMenuOpen ? (
        <div className="trimax-refresh-menu">
          <button type="button" onClick={refreshData}>
            Refresh Data
          </button>
          <button type="button" onClick={reloadApplication}>
            Reload Application
          </button>
        </div>
      ) : null}
    </div>
  );
}
