"use client";

import { usePathname, useRouter } from "next/navigation";
import { previousTrimaxRouteKey } from "./NavigationHistoryTracker";

type BackButtonProps = {
  label?: string;
  fallbackHref?: string;
  className?: string;
};

function isSafeInternalRoute(value: string | null): value is string {
  return Boolean(value && value.startsWith("/") && !value.startsWith("//"));
}

export default function BackButton({
  label = "Back",
  fallbackHref = "/",
  className = "",
}: BackButtonProps) {
  const router = useRouter();
  const pathname = usePathname();

  function handleBack() {
    const previousRoute = sessionStorage.getItem(previousTrimaxRouteKey);

    if (
      isSafeInternalRoute(previousRoute) &&
      previousRoute !== window.location.pathname + window.location.search &&
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
      className={`app-back-button rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:border-sky-500 hover:text-sky-300 ${className}`}
    >
      &lt;- {label}
    </button>
  );
}
