"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

function scrollToCurrentHash() {
  const hash = window.location.hash;

  if (!hash || hash.length <= 1) {
    return;
  }

  const targetId = decodeURIComponent(hash.slice(1));
  const target = document.getElementById(targetId);

  if (!target) {
    return;
  }

  target.scrollIntoView({
    block: "start",
    behavior: "auto",
  });
}

function scrollToHashAfterNavigation() {
  scrollToCurrentHash();

  const animationFrame = window.requestAnimationFrame(scrollToCurrentHash);
  const delays = [80, 160, 320, 640, 1000].map((delay) =>
    window.setTimeout(scrollToCurrentHash, delay)
  );

  return () => {
    window.cancelAnimationFrame(animationFrame);
    delays.forEach((delay) => window.clearTimeout(delay));
  };
}

export default function HashScrollRestorer() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  useEffect(() => {
    return scrollToHashAfterNavigation();
  }, [pathname, searchKey]);

  useEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration;

    window.history.scrollRestoration = "manual";
    window.addEventListener("hashchange", scrollToCurrentHash);

    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
      window.removeEventListener("hashchange", scrollToCurrentHash);
    };
  }, []);

  return null;
}
