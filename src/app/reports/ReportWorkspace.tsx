"use client";

import { useEffect, useRef, type ReactNode } from "react";

const selector = "details[data-report-section]";

export default function ReportWorkspace({ businessSlug, children }: { businessSlug: string; children: ReactNode }) {
  const workspace = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = workspace.current;
    if (!root) return;
    const key = "trimax:property-report-sections:" + businessSlug;
    let preferences: Record<string, boolean> = {};
    try {
      const saved = JSON.parse(window.localStorage.getItem(key) ?? "{}");
      if (saved && typeof saved === "object" && !Array.isArray(saved)) preferences = saved;
    } catch { /* The disclosures still work with storage disabled. */ }

    const initialized = new WeakSet<HTMLDetailsElement>();
    const sections = () => root.querySelectorAll<HTMLDetailsElement>(selector);
    function restoreSections() {
      for (const section of sections()) {
        if (initialized.has(section)) continue;
        initialized.add(section);
        const value = preferences[section.dataset.reportSection ?? ""];
        if (typeof value === "boolean") section.open = value;
      }
    }

    function hashTarget(hash: string) {
      if (!hash) return;
      let id: string;
      try { id = decodeURIComponent(hash.slice(1)); }
      catch { return; }
      const target = document.getElementById(id);
      return target && root?.contains(target) ? target : undefined;
    }

    function reveal(hash: string) {
      const target = hashTarget(hash);
      if (!target) return;
      for (let node: HTMLElement | null = target; node && node !== root; node = node.parentElement) {
        if (node instanceof HTMLDetailsElement && node.matches(selector)) node.open = true;
      }
      return target;
    }

    function remember(event: Event) {
      const section = event.target;
      if (!(section instanceof HTMLDetailsElement) || !initialized.has(section)) return;
      const id = section.dataset.reportSection;
      if (!id) return;
      preferences[id] = section.open;
      try { window.localStorage.setItem(key, JSON.stringify(preferences)); }
      catch { /* Keep the current view usable without storage. */ }
    }

    function click(event: MouseEvent) {
      if (!(event.target instanceof Element) || event.button !== 0 ||
          event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const control = event.target.closest<HTMLButtonElement>("button[data-report-set-open]");
      if (control) {
        for (const section of sections()) section.open = control.dataset.reportSetOpen === "true";
        return;
      }
      const href = event.target.closest<HTMLAnchorElement>("a[href^='#']")?.getAttribute("href");
      if (href) reveal(href);
    }

    let handledHashTarget: HTMLElement | undefined;
    function revealCurrentHash() {
      handledHashTarget = reveal(window.location.hash);
      const target = handledHashTarget;
      if (target) window.requestAnimationFrame(() => target.scrollIntoView());
    }

    restoreSections();
    revealCurrentHash();
    const observer = new MutationObserver(() => {
      restoreSections();
      // Role-gated sections can mount after a direct fragment navigation.
      const target = hashTarget(window.location.hash);
      if (target && target !== handledHashTarget) revealCurrentHash();
    });
    observer.observe(root, { childList: true, subtree: true });
    root.addEventListener("toggle", remember, true);
    root.addEventListener("click", click, true);
    window.addEventListener("hashchange", revealCurrentHash);
    return () => {
      observer.disconnect();
      root.removeEventListener("toggle", remember, true);
      root.removeEventListener("click", click, true);
      window.removeEventListener("hashchange", revealCurrentHash);
    };
  }, [businessSlug]);

  return <div className="space-y-6" ref={workspace}>{children}</div>;
}
