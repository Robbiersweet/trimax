"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type CommandTone =
  | "cash"
  | "queue"
  | "create"
  | "client"
  | "report"
  | "system";

type CommandItem = {
  title: string;
  detail: string;
  href: string;
  tone: CommandTone;
  keywords: string[];
};

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();

  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
}

function commandMatches(command: CommandItem, query: string) {
  if (!query) {
    return true;
  }

  const haystack = [
    command.title,
    command.detail,
    ...command.keywords,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

export default function QuickCommandCenter() {
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const business = searchParams.get("business") ?? "rnl-creations";

  const commands = useMemo<CommandItem[]>(
    () => [
      {
        title: "Dashboard",
        detail: "Open the accounting and operations command view.",
        href: `/?business=${business}`,
        tone: "system",
        keywords: ["home", "overview", "command", "today"],
      },
      {
        title: "Record Payment",
        detail: "Open the batch payment workspace for checks.",
        href: `/payments?business=${business}`,
        tone: "cash",
        keywords: ["check", "batch", "collect", "paid", "money"],
      },
      {
        title: "Capture Check",
        detail: "Photograph a check and let Trimax suggest invoice matches.",
        href: `/payments?business=${business}#check-capture`,
        tone: "cash",
        keywords: ["camera", "photo", "match", "deposit", "payment"],
      },
      {
        title: "Late Reminders",
        detail: "Review overdue invoices ready for follow-up.",
        href: `/invoices?business=${business}&view=aging`,
        tone: "cash",
        keywords: ["overdue", "late", "reminder", "aging", "past due"],
      },
      {
        title: "Deposit Requests",
        detail: "Review invoices with active deposit collection.",
        href: `/invoices?business=${business}&collection=open`,
        tone: "cash",
        keywords: ["deposit", "request", "partial", "invoice"],
      },
      {
        title: "New Invoice",
        detail: "Create and send a billable invoice.",
        href: `/invoices/new?business=${business}`,
        tone: "create",
        keywords: ["bill", "send", "freshbooks", "accounting"],
      },
      {
        title: "Invoices",
        detail: "Search, filter, split, print, and collect invoices.",
        href: `/invoices?business=${business}`,
        tone: "cash",
        keywords: ["invoice", "split", "paid", "draft", "sent"],
      },
      {
        title: "Queue",
        detail: "Review apartment turns, estimates, scheduling, and history.",
        href: `/queue?business=${business}`,
        tone: "queue",
        keywords: ["work", "unit", "paint", "turnover", "job"],
      },
      {
        title: "Needs Estimate",
        detail: "Jump to queue items waiting for estimate review.",
        href: `/queue?business=${business}&view=needs-estimate`,
        tone: "queue",
        keywords: ["proposal", "quote", "review", "estimate"],
      },
      {
        title: "New Estimate",
        detail: "Prepare a new estimate for approval or conversion.",
        href: `/estimates/new?business=${business}`,
        tone: "create",
        keywords: ["quote", "proposal", "pricing"],
      },
      {
        title: "Clients",
        detail: "Open the customer book and account follow-up view.",
        href: `/clients?business=${business}`,
        tone: "client",
        keywords: ["customer", "contacts", "account", "property"],
      },
      {
        title: "Reports",
        detail: "Review revenue, tax, queue, and client performance.",
        href: `/reports?business=${business}`,
        tone: "report",
        keywords: ["analytics", "tax", "money", "history"],
      },
      {
        title: "Settings",
        detail: "Manage phone app, alerts, email prep, and access.",
        href: `/settings?business=${business}`,
        tone: "system",
        keywords: ["setup", "security", "roles", "notifications"],
      },
    ],
    [business]
  );

  const filteredCommands = commands
    .filter((command) => commandMatches(command, query.trim().toLowerCase()))
    .slice(0, 8);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen((current) => !current);
        return;
      }

      if (event.key === "/") {
        event.preventDefault();
        setIsOpen(true);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);

    return () => window.clearTimeout(timer);
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="quick-command-launcher"
        aria-label="Open quick command center"
      >
        <span aria-hidden="true">⌕</span>
        <span>Command</span>
      </button>

      {isOpen ? (
        <div
          className="quick-command-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsOpen(false);
            }
          }}
        >
          <div
            className="quick-command-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Quick command center"
          >
            <div className="quick-command-search-row">
              <span aria-hidden="true" className="quick-command-search-icon">
                ⌕
              </span>
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setIsOpen(false);
                  }
                }}
                placeholder="Search workflows, invoices, checks, queue..."
                className="quick-command-input"
              />
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="quick-command-close"
                aria-label="Close quick command center"
              >
                Close
              </button>
            </div>

            <div className="quick-command-results">
              {filteredCommands.length > 0 ? (
                filteredCommands.map((command) => (
                  <Link
                    key={command.href}
                    href={command.href}
                    data-tone={command.tone}
                    className="quick-command-result"
                    onClick={() => setIsOpen(false)}
                  >
                    <span className="quick-command-result-mark" />
                    <span className="min-w-0">
                      <span className="quick-command-result-title">
                        {command.title}
                      </span>
                      <span className="quick-command-result-detail">
                        {command.detail}
                      </span>
                    </span>
                  </Link>
                ))
              ) : (
                <div className="quick-command-empty">
                  No matching workflow found.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
