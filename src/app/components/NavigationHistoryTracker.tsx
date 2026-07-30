"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

export const previousTrimaxRouteKey = "trimax.previousRoute";
export const trimaxRouteStackKey = "trimax.routeStack";
const currentTrimaxRouteKey = "trimax.currentRoute";

function buildRoute(pathname: string, searchParams: URLSearchParams) {
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function isSafeInternalRoute(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}

function readRouteStack() {
  try {
    const parsed = JSON.parse(
      sessionStorage.getItem(trimaxRouteStackKey) ?? "[]"
    );

    return Array.isArray(parsed) ? parsed.filter(isSafeInternalRoute) : [];
  } catch {
    return [];
  }
}

function cameFromOutsideCurrentOrigin() {
  if (!document.referrer) {
    return true;
  }

  try {
    return new URL(document.referrer).origin !== window.location.origin;
  } catch {
    return true;
  }
}

function isFreshDocumentNavigation() {
  const [navigation] = performance.getEntriesByType("navigation");

  return navigation instanceof PerformanceNavigationTiming
    ? navigation.type === "navigate"
    : false;
}

export default function NavigationHistoryTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hasInitialized = useRef(false);

  useEffect(() => {
    const nextRoute = buildRoute(pathname, searchParams);

    if (
      !hasInitialized.current &&
      isFreshDocumentNavigation() &&
      cameFromOutsideCurrentOrigin()
    ) {
      sessionStorage.removeItem(previousTrimaxRouteKey);
      sessionStorage.removeItem(trimaxRouteStackKey);
      sessionStorage.removeItem(currentTrimaxRouteKey);
    }

    hasInitialized.current = true;

    const currentRoute = sessionStorage.getItem(currentTrimaxRouteKey);
    const routeStack = readRouteStack();
    const lastRoute = routeStack[routeStack.length - 1];

    if (currentRoute && currentRoute !== nextRoute) {
      sessionStorage.setItem(previousTrimaxRouteKey, currentRoute);
    }

    if (lastRoute !== nextRoute) {
      const nextStack = [...routeStack, nextRoute].slice(-12);
      sessionStorage.setItem(trimaxRouteStackKey, JSON.stringify(nextStack));
    }

    sessionStorage.setItem(currentTrimaxRouteKey, nextRoute);
  }, [pathname, searchParams]);

  return null;
}
