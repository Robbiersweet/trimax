"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

type FilteredRoute = {
  pathname: string;
  targetId: string;
  filterKeys: string[];
};

const filteredRoutes: FilteredRoute[] = [
  {
    pathname: "/invoices",
    targetId: "invoice-results-list",
    filterKeys: ["collection", "customer", "q", "status", "view", "year"],
  },
  {
    pathname: "/estimates",
    targetId: "estimate-results",
    filterKeys: ["q", "status"],
  },
  {
    pathname: "/schedule",
    targetId: "schedule-results",
    filterKeys: ["property", "view"],
  },
  {
    pathname: "/queue",
    targetId: "queue-results",
    filterKeys: ["property", "q", "status", "view"],
  },
  {
    pathname: "/clients",
    targetId: "client-results",
    filterKeys: ["q"],
  },
  {
    pathname: "/payments",
    targetId: "batch-payment-tool",
    filterKeys: ["customer", "invoiceIds"],
  },
];

function hasMeaningfulFilter(
  searchParams: URLSearchParams,
  filterKeys: string[]
) {
  return filterKeys.some((key) => {
    const value = searchParams.get(key)?.trim();

    return Boolean(value && value !== "all");
  });
}

function scrollToTarget(targetId: string) {
  const target = document.getElementById(targetId);

  if (!target) {
    return false;
  }

  target.scrollIntoView({
    block: "start",
    behavior: "auto",
  });

  const targetTop =
    target.getBoundingClientRect().top + window.scrollY - 16;

  window.scrollTo({
    top: Math.max(0, targetTop),
    behavior: "auto",
  });

  [document.documentElement, document.body]
    .concat(
      Array.from(
        document.querySelectorAll(
          ".app-shell-root, .app-shell-content, .app-workspace-panel"
        )
      )
    )
    .forEach((scrollContainer) => {
      if (scrollContainer.scrollHeight <= scrollContainer.clientHeight) {
        return;
      }

      const containerTop = scrollContainer.getBoundingClientRect().top;
      const targetWithinContainer =
        target.getBoundingClientRect().top -
        containerTop +
        scrollContainer.scrollTop -
        16;

      scrollContainer.scrollTo({
        top: Math.max(0, targetWithinContainer),
        behavior: "auto",
      });
    });

  return true;
}

export default function FilteredResultsScroller() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  useEffect(() => {
    const route = filteredRoutes.find((item) => item.pathname === pathname);

    if (!route) {
      return;
    }

    const params = new URLSearchParams(searchKey);

    if (!hasMeaningfulFilter(params, route.filterKeys)) {
      return;
    }

    const runScroll = () => scrollToTarget(route.targetId);

    runScroll();

    const animationFrame = window.requestAnimationFrame(runScroll);
    const delays = [50, 120, 250, 500, 900, 1300, 1800, 2400].map((delay) =>
      window.setTimeout(runScroll, delay)
    );

    return () => {
      window.cancelAnimationFrame(animationFrame);
      delays.forEach((delay) => window.clearTimeout(delay));
    };
  }, [pathname, searchKey]);

  return null;
}
