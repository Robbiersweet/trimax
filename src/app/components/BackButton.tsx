"use client";

import { useRouter } from "next/navigation";
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

function isSafeTrimaxBackRoute(value: string | null): value is string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return false;
  }

  const pathname = value.split(/[?#]/)[0];

  return ![
    "/login",
    "/request-access",
    "/forgot-password",
    "/reset-password",
  ].some((authPath) => pathname === authPath || pathname.startsWith(`${authPath}/`));
}

function readRouteStack() {
  try {
    const parsed = JSON.parse(
      sessionStorage.getItem(trimaxRouteStackKey) ?? "[]"
    );

    return Array.isArray(parsed)
      ? parsed.filter((route): route is string => isSafeTrimaxBackRoute(route))
      : [];
  } catch {
    return [];
  }
}

function routeHint(route: string | null) {
  if (!isSafeTrimaxBackRoute(route)) {
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

function inCurrentWorkspace(route: string, currentRoute: string) {
  const business = (href: string) => new URL(href, window.location.origin).searchParams.get("business") ?? "rnl-creations";
  return business(route) === business(currentRoute);
}

function browserPreviousRoute() {
  const navigation = (window as Window & {
    navigation?: { currentEntry?: { index: number }; entries(): { index: number; url: string | null }[] };
  }).navigation;
  const index = navigation?.currentEntry?.index;
  if (index === undefined || index < 1) return null;
  const entry = navigation?.entries().find(item => item.index === index - 1);
  if (!entry?.url) return null;
  const url = new URL(entry.url);
  if (url.origin !== window.location.origin) return null;
  const route = url.pathname + url.search;
  return isSafeTrimaxBackRoute(route) ? route : null;
}

function routePathname(route: string) {
  return route.split("?")[0] ?? route;
}

function findStackedParentRoute(currentRoute: string, fallbackHref: string) {
  if (!isSafeTrimaxBackRoute(fallbackHref)) {
    return null;
  }

  const fallbackPathname = routePathname(fallbackHref);

  return readRouteStack()
    .slice()
    .reverse()
    .find(
      (route) =>
        route !== currentRoute && inCurrentWorkspace(route, currentRoute) && routePathname(route) === fallbackPathname
    ) ?? null;
}

export default function BackButton({
  label = "Back",
  fallbackHref = "/",
  className = "",
  preferFallback = false,
  variant = "inline",
}: BackButtonProps) {
  const router = useRouter();

  const fallbackHint = useMemo(() => routeHint(fallbackHref), [fallbackHref]);
  const targetHint = preferFallback ? fallbackHint : "Previous Trimax screen";

  function handleBack() {
    const currentRoute = window.location.pathname + window.location.search;
    const routeStack = readRouteStack();
    const stackWithoutCurrent =
      routeStack[routeStack.length - 1] === currentRoute
        ? routeStack.slice(0, -1)
        : routeStack.filter((route) => route !== currentRoute);
    const stackedPreviousRoute = [...stackWithoutCurrent].reverse().find(route => inCurrentWorkspace(route, currentRoute));
    const browserRoute = browserPreviousRoute();

    if (browserRoute && browserRoute !== currentRoute && inCurrentWorkspace(browserRoute, currentRoute)) {
      rememberBack(browserRoute);
      router.back();
      return;
    }

    if (stackedPreviousRoute) {
      rememberBack(stackedPreviousRoute);
      router.replace(stackedPreviousRoute);
      return;
    }

    if (preferFallback) {
      const parent = findStackedParentRoute(currentRoute, fallbackHref);
      if (parent) {
        rememberBack(parent);
        router.replace(parent);
        return;
      }
    }

    if (isSafeTrimaxBackRoute(fallbackHref) && fallbackHref !== currentRoute) {
      rememberBack(fallbackHref);
      router.replace(fallbackHref);
    }
  }

  function rememberBack(target: string) {
    try {
      const stack = readRouteStack();
      const index = stack.lastIndexOf(target);
      sessionStorage.setItem(trimaxRouteStackKey, JSON.stringify(index < 0 ? [target] : stack.slice(0, index + 1)));
      sessionStorage.removeItem(previousTrimaxRouteKey);
    } catch {
      // Browser navigation remains usable when storage is unavailable.
    }
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
