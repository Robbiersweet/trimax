"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type CommandTone =
  | "cash"
  | "queue"
  | "create"
  | "client"
  | "report"
  | "setup"
  | "security"
  | "system";

type CommandItem = {
  title: string;
  detail: string;
  href: string;
  tone: CommandTone;
  keywords: string[];
};

const RECENT_COMMANDS_STORAGE_KEY = "trimax-recent-commands";

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

function loadRecentCommandHrefs() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(RECENT_COMMANDS_STORAGE_KEY) ?? "[]"
    );

    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function saveRecentCommandHref(href: string, currentHrefs: string[]) {
  const nextHrefs = [href, ...currentHrefs.filter((item) => item !== href)]
    .slice(0, 4);

  try {
    window.localStorage.setItem(
      RECENT_COMMANDS_STORAGE_KEY,
      JSON.stringify(nextHrefs)
    );
  } catch {
    // Recent command memory is a convenience, so storage failures are safe.
  }

  return nextHrefs;
}

export default function QuickCommandCenter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentCommandHrefs, setRecentCommandHrefs] = useState(
    loadRecentCommandHrefs
  );
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
        title: "Email Launch Checklist",
        detail: "Set sender address, reply-to, invoice copy, and reminders.",
        href: `/settings?business=${business}#outlook-integration`,
        tone: "setup",
        keywords: [
          "email",
          "sender",
          "from",
          "reply",
          "domain",
          "resend",
          "delivery",
        ],
      },
      {
        title: "Customer Email Studio",
        detail: "Open invoice, estimate, PDF, CC, BCC, and reminder settings.",
        href: `/settings?business=${business}#outlook-integration`,
        tone: "setup",
        keywords: [
          "customer",
          "email",
          "invoice",
          "estimate",
          "pdf",
          "attachment",
          "cc",
          "bcc",
          "copy",
        ],
      },
      {
        title: "Reminder Templates",
        detail: "Tune manual and automated late payment reminder copy.",
        href: `/settings?business=${business}#outlook-integration`,
        tone: "setup",
        keywords: [
          "late",
          "overdue",
          "payment",
          "reminder",
          "template",
          "automation",
        ],
      },
      {
        title: "PDF Delivery Setup",
        detail: "Check sender, reply-to, private copy, and attachment readiness.",
        href: `/settings?business=${business}#outlook-integration`,
        tone: "setup",
        keywords: [
          "pdf",
          "attachment",
          "invoice",
          "estimate",
          "send",
          "delivery",
          "resend",
        ],
      },
      {
        title: "Deposit Requests",
        detail: "Review invoices with active deposit collection.",
        href: `/invoices?business=${business}&collection=open`,
        tone: "cash",
        keywords: ["deposit", "request", "partial", "invoice"],
      },
      {
        title: "Recurring Drafts",
        detail: "Review monthly drafts, schedules, and auto-create settings.",
        href: `/recurring-invoices?business=${business}`,
        tone: "cash",
        keywords: [
          "recurring",
          "repeat",
          "monthly",
          "draft",
          "freshbooks",
          "schedule",
        ],
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
        title: "Property Intelligence",
        detail: "Open unit labels, property records, and apartment context.",
        href: `/property-intelligence?business=${business}`,
        tone: "queue",
        keywords: [
          "property",
          "unit",
          "apartment",
          "north creek",
          "labels",
          "history",
        ],
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
      {
        title: "Security Controls",
        detail: "Open session lock, roles, access, and maintenance controls.",
        href: `/settings?business=${business}#user-role-integration`,
        tone: "security",
        keywords: [
          "security",
          "session",
          "lock",
          "roles",
          "access",
          "users",
          "maintenance",
        ],
      },
      {
        title: "Phone App Setup",
        detail: "Install Trimax on mobile and enable queue notifications.",
        href: `/settings?business=${business}#phone-app-notifications`,
        tone: "setup",
        keywords: [
          "mobile",
          "phone",
          "pwa",
          "install",
          "alerts",
          "notifications",
        ],
      },
      {
        title: "Media Filing Strategy",
        detail: "Set up check stubs, job-site photos, and storage strategy.",
        href: `/settings?business=${business}#media-filing-strategy`,
        tone: "setup",
        keywords: [
          "media",
          "photo",
          "photos",
          "images",
          "job site",
          "check stub",
          "storage",
          "supabase",
          "drive",
        ],
      },
      {
        title: "Check Stub Filing",
        detail: "Capture payment proof and match check stubs to invoices.",
        href: `/payments?business=${business}#check-capture`,
        tone: "cash",
        keywords: [
          "stub",
          "remittance",
          "check",
          "proof",
          "photo",
          "ocr",
          "match",
        ],
      },
    ],
    [business]
  );

  const normalizedQuery = query.trim().toLowerCase();
  const recentCommands = recentCommandHrefs
    .map((href) => commands.find((command) => command.href === href))
    .filter((command): command is CommandItem => Boolean(command));
  const visibleCommands = (
    normalizedQuery
      ? commands.filter((command) => commandMatches(command, normalizedQuery))
      : [
          ...recentCommands,
          ...commands.filter(
            (command) => !recentCommandHrefs.includes(command.href)
          ),
        ]
  )
    .slice(0, 8);
  const selectedCommand =
    visibleCommands[Math.min(selectedIndex, visibleCommands.length - 1)];

  function openCommandCenter() {
    setIsOpen(true);
    setSelectedIndex(0);
  }

  function closeCommandCenter() {
    setIsOpen(false);
    setQuery("");
    setSelectedIndex(0);
  }

  function rememberCommand(command: CommandItem) {
    setRecentCommandHrefs((currentHrefs) =>
      saveRecentCommandHref(command.href, currentHrefs)
    );
  }

  function runCommand(command: CommandItem) {
    rememberCommand(command);
    closeCommandCenter();
    router.push(command.href);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen((current) => !current);
        setSelectedIndex(0);
        return;
      }

      if (isTypingTarget(event.target)) {
        return;
      }

      if (event.key === "/") {
        event.preventDefault();
        openCommandCenter();
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
        onClick={openCommandCenter}
        className="quick-command-launcher"
        aria-label="Open quick command center"
      >
        <span aria-hidden="true">/</span>
        <span>Command</span>
        <span className="quick-command-shortcut" aria-hidden="true">
          Ctrl K
        </span>
      </button>

      {isOpen ? (
        <div
          className="quick-command-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeCommandCenter();
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
                /
              </span>
              <input
                ref={searchInputRef}
                aria-activedescendant={
                  selectedCommand
                    ? `quick-command-${selectedCommand.href
                        .replace(/[^a-zA-Z0-9]+/g, "-")
                        .replace(/^-|-$/g, "")}`
                    : undefined
                }
                aria-autocomplete="list"
                aria-controls="quick-command-results"
                aria-expanded={isOpen}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    closeCommandCenter();
                  }

                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setSelectedIndex((current) =>
                      visibleCommands.length === 0
                        ? 0
                        : Math.min(current + 1, visibleCommands.length - 1)
                    );
                  }

                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setSelectedIndex((current) => Math.max(current - 1, 0));
                  }

                  if (event.key === "Enter" && selectedCommand) {
                    event.preventDefault();
                    runCommand(selectedCommand);
                  }
                }}
                placeholder="Search workflows, invoices, checks, queue..."
                className="quick-command-input"
                role="combobox"
              />
              <button
                type="button"
                onClick={closeCommandCenter}
                className="quick-command-close"
                aria-label="Close quick command center"
              >
                Close
              </button>
            </div>

            <div className="quick-command-hints">
              <span>
                <kbd>Type</kbd> filters
              </span>
              <span>
                <kbd>Enter</kbd> opens
              </span>
              <span>
                <kbd>Esc</kbd> closes
              </span>
              <span>
                <kbd>/</kbd> or <kbd>Ctrl K</kbd>
              </span>
            </div>

            <div className="quick-command-results" id="quick-command-results">
              {!normalizedQuery && recentCommands.length > 0 ? (
                <p className="quick-command-section-label">
                  Recent workflows
                </p>
              ) : null}

              {!normalizedQuery && recentCommands.length === 0 ? (
                <p className="quick-command-section-label">
                  Suggested workflows
                </p>
              ) : null}

              {normalizedQuery ? (
                <p className="quick-command-section-label">
                  {visibleCommands.length} match
                  {visibleCommands.length === 1 ? "" : "es"}
                </p>
              ) : null}

              {visibleCommands.length > 0 ? (
                visibleCommands.map((command, index) => (
                  <Link
                    key={command.href}
                    id={`quick-command-${command.href
                      .replace(/[^a-zA-Z0-9]+/g, "-")
                      .replace(/^-|-$/g, "")}`}
                    href={command.href}
                    data-tone={command.tone}
                    data-active={index === selectedIndex}
                    data-recent={recentCommandHrefs.includes(command.href)}
                    className="quick-command-result"
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => {
                      rememberCommand(command);
                      closeCommandCenter();
                    }}
                  >
                    <span className="quick-command-result-mark" />
                    <span className="min-w-0">
                      <span className="quick-command-title-row">
                        <span className="quick-command-result-title">
                          {command.title}
                        </span>
                        {recentCommandHrefs.includes(command.href) ? (
                          <span className="quick-command-recent-pill">
                            Recent
                          </span>
                        ) : null}
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
