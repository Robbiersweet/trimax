"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

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

export default function NavigationHistoryTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const nextRoute = buildRoute(pathname, searchParams);
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
