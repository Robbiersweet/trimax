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
      className={`app-back-button inline-flex items-center gap-3 rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-left text-sm font-semibold text-zinc-300 transition hover:border-sky-500 hover:text-sky-300 ${className}`}
    >
      <span className="app-back-button-arrow" aria-hidden="true">
        &larr;
      </span>
      <span className="min-w-0">
        <span className="app-back-button-label block">{label}</span>
        <span className="app-back-button-meta block">{targetHint}</span>
      </span>
    </button>
  );
}
