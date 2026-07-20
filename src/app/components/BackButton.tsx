"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";
import {
  previousTrimaxRouteKey,
  trimaxRouteStackKey,
} from "./NavigationHistoryTracker";

type BackButtonProps = {
  label?: string;
  fallbackHref?: string;
  className?: string;
  preferFallback?: boolean;
  variant?: "inline" | "floating";
};

function isSafeInternalRoute(value: string | null): value is string {
  return Boolean(value && value.startsWith("/") && !value.startsWith("//"));
}

function readRouteStack() {
  try {
    const parsed = JSON.parse(
      sessionStorage.getItem(trimaxRouteStackKey) ?? "[]"
    );

    return Array.isArray(parsed)
      ? parsed.filter((route): route is string => isSafeInternalRoute(route))
      : [];
  } catch {
    return [];
  }
}

function routeHint(route: string | null) {
  if (!isSafeInternalRoute(route)) {
    return "Previous Trimax screen";
  }

  const pathname = route.split("?")[0] ?? route;

  if (pathname.startsWith("/queue/")) {
    return "Queue item";
  }

  if (pathname === "/queue") {
    return "Queue list";
  }

  if (pathname.startsWith("/invoices/") && pathname.includes("/print")) {
    return "Invoice print view";
  }

  if (pathname.startsWith("/invoices/")) {
    return "Invoice detail";
  }

  if (pathname === "/invoices") {
    return "Invoice list";
  }

  if (pathname.startsWith("/estimates/") && pathname.includes("/print")) {
    return "Estimate print view";
  }

  if (pathname.startsWith("/estimates/")) {
    return "Estimate detail";
  }

  if (pathname === "/estimates") {
    return "Estimate list";
  }

  if (pathname.startsWith("/clients/")) {
    return "Client profile";
  }

  if (pathname === "/clients") {
    return "Client list";
  }

  if (pathname === "/property-intelligence") {
    return "Property intelligence";
  }

  if (pathname === "/payments") {
    return "Payments";
  }

  if (pathname === "/settings") {
    return "Settings";
  }

  if (pathname === "/") {
    return "Dashboard";
  }

  return "Previous Trimax screen";
}

function findStackedPreviousRoute(currentRoute: string, pathname: string) {
  const routeStack = readRouteStack();
  const stackWithoutCurrent =
    routeStack[routeStack.length - 1] === currentRoute
      ? routeStack.slice(0, -1)
      : routeStack.filter((route) => route !== currentRoute);

  return stackWithoutCurrent
    .slice()
    .reverse()
    .find((route) => route !== currentRoute && route !== pathname);
}

export default function BackButton({
  label = "Back",
  fallbackHref = "/",
  className = "",
  preferFallback = false,
  variant = "inline",
}: BackButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const fallbackHint = useMemo(() => routeHint(fallbackHref), [fallbackHref]);
  const targetHint = preferFallback ? fallbackHint : "Previous Trimax screen";

  function handleBack() {
    const currentRoute = window.location.pathname + window.location.search;

    if (preferFallback && isSafeInternalRoute(fallbackHref)) {
      router.push(fallbackHref);
      return;
    }

    const routeStack = readRouteStack();
    const stackWithoutCurrent =
      routeStack[routeStack.length - 1] === currentRoute
        ? routeStack.slice(0, -1)
        : routeStack.filter((route) => route !== currentRoute);
    const stackedPreviousRoute = findStackedPreviousRoute(currentRoute, pathname);

    if (stackedPreviousRoute) {
      sessionStorage.setItem(
        trimaxRouteStackKey,
        JSON.stringify(stackWithoutCurrent)
      );
      router.push(stackedPreviousRoute);
      return;
    }

    const previousRoute = sessionStorage.getItem(previousTrimaxRouteKey);

    if (
      isSafeInternalRoute(previousRoute) &&
      previousRoute !== currentRoute &&
      previousRoute !== pathname
    ) {
      router.push(previousRoute);
      return;
    }

    if (isSafeInternalRoute(fallbackHref)) {
      router.push(fallbackHref);
      return;
    }

    router.back();
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label={`Go back to ${targetHint}`}
      title={`Go back to ${targetHint}`}
      className={
        variant === "floating"
          ? `app-back-button app-floating-back-button inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 bg-zinc-950/90 px-3 py-2 text-left text-xs font-black text-zinc-100 shadow-2xl shadow-black/35 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-sky-300/60 hover:text-sky-100 focus:outline-none focus:ring-2 focus:ring-sky-300/70 focus:ring-offset-2 focus:ring-offset-zinc-950 sm:px-3.5 ${className}`
          : `app-back-button inline-flex items-center gap-3 rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-left text-sm font-semibold text-zinc-300 transition hover:border-sky-500 hover:text-sky-300 ${className}`
      }
    >
      <span className="app-back-button-arrow" aria-hidden="true">
        &larr;
      </span>
      <span className="min-w-0">
        <span className="app-back-button-label block">{label}</span>
        <span
          className={
            variant === "floating"
              ? "app-back-button-meta sr-only"
              : "app-back-button-meta block"
          }
        >
          {targetHint}
        </span>
      </span>
    </button>
  );
}
