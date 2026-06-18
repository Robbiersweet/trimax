"use client";

import { usePathname, useRouter } from "next/navigation";
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

export default function BackButton({
  label = "Back",
  fallbackHref = "/",
  className = "",
  preferFallback = false,
}: BackButtonProps) {
  const router = useRouter();
  const pathname = usePathname();

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
    const stackedPreviousRoute = stackWithoutCurrent
      .slice()
      .reverse()
      .find((route) => route !== currentRoute && route !== pathname);

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
      aria-label="Go back to the previous Trimax screen"
      title="Go back to the previous Trimax screen"
      className={`app-back-button rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:border-sky-500 hover:text-sky-300 ${className}`}
    >
      &lt;- {label}
    </button>
  );
}
