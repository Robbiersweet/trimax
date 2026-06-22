"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { invoiceFilterScrollKey } from "./InvoiceFilterLink";

const invoiceResultFilterKeys = [
  "collection",
  "customer",
  "q",
  "status",
  "view",
  "year",
];

function hasInvoiceResultFilter(searchParams: URLSearchParams) {
  return invoiceResultFilterKeys.some((key) => {
    const value = searchParams.get(key)?.trim();

    return Boolean(value && value !== "all");
  });
}

function shouldScrollToInvoiceResults(searchParams: URLSearchParams) {
  return (
    window.location.hash === "#invoice-results-list" ||
    sessionStorage.getItem(invoiceFilterScrollKey) === "1" ||
    hasInvoiceResultFilter(searchParams)
  );
}

function scrollToInvoiceResults(searchParams: URLSearchParams) {
  if (!shouldScrollToInvoiceResults(searchParams)) {
    return false;
  }

  const target = document.getElementById("invoice-results-list");

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

export default function InvoiceResultsScroller() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  useEffect(() => {
    if (pathname !== "/invoices") {
      return;
    }

    const params = new URLSearchParams(searchKey);
    const runScroll = () => scrollToInvoiceResults(params);

    const didScroll = runScroll();

    const animationFrame = window.requestAnimationFrame(runScroll);
    const delays = [50, 120, 250, 500, 900, 1300, 1800, 2400].map((delay) =>
      window.setTimeout(runScroll, delay)
    );
    const clearMarkerDelay = window.setTimeout(() => {
      sessionStorage.removeItem(invoiceFilterScrollKey);
    }, didScroll ? 2600 : 3200);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      delays.forEach((delay) => window.clearTimeout(delay));
      window.clearTimeout(clearMarkerDelay);
    };
  }, [pathname, searchKey]);

  return null;
}
