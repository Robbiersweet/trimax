"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export const previousTrimaxRouteKey = "trimax.previousRoute";
const currentTrimaxRouteKey = "trimax.currentRoute";

function buildRoute(pathname: string, searchParams: URLSearchParams) {
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export default function NavigationHistoryTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const nextRoute = buildRoute(pathname, searchParams);
    const currentRoute = sessionStorage.getItem(currentTrimaxRouteKey);

    if (currentRoute && currentRoute !== nextRoute) {
      sessionStorage.setItem(previousTrimaxRouteKey, currentRoute);
    }

    sessionStorage.setItem(currentTrimaxRouteKey, nextRoute);
  }, [pathname, searchParams]);

  return null;
}
