"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

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
  source?: "static" | "record" | "fallback";
};

type BusinessRecord = {
  id: string;
  slug: string | null;
};

type InvoiceSearchRecord = {
  id: string;
  display_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  status: string | null;
};

type EstimateSearchRecord = {
  id: string;
  display_id: string | null;
  customer_name: string | null;
  project_title: string | null;
  status: string | null;
};

type QueueSearchRecord = {
  id: string;
  property: string | null;
  unit: string | null;
  status: string | null;
  priority: string | null;
  ready_date: string | null;
};

type ClientSearchRecord = {
  id: string;
  name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
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

function commandSearchText(command: CommandItem) {
  const haystack = [
    command.title,
    command.detail,
    ...command.keywords,
  ]
    .join(" ")
    .toLowerCase();

  return haystack;
}

function queryTokens(query: string) {
  return query
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function canonicalDocumentSearch(value: string) {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, " ");
  const match = normalized.match(
    /^(INV|INVOICE|EST|ESTIMATE|Q|QUEUE|UNIT|CLIENT|CUSTOMER)\s*[-#:]?\s*(.+)$/
  );

  if (!match) {
    return {
      type: "general" as const,
      value: normalized,
    };
  }

  const rawType = match[1];
  const rawValue = match[2].trim();
  const type =
    rawType === "INV" || rawType === "INVOICE"
      ? "invoice"
      : rawType === "EST" || rawType === "ESTIMATE"
        ? "estimate"
        : rawType === "CLIENT" || rawType === "CUSTOMER"
          ? "client"
          : "queue";

  return {
    type,
    value: rawValue,
  };
}

function normalizeLookupValue(value: string) {
  return value
    .trim()
    .replace(/^[-#:\s]+/, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function displayIdNeedle(value: string) {
  const normalized = normalizeLookupValue(value);
  const numeric = normalized.match(/\d+/)?.[0] ?? "";

  return numeric || normalized.replace(/[^A-Z0-9]+/g, "");
}

function queueUnitNeedles(value: string) {
  const normalized = normalizeLookupValue(value);
  const compact = normalized.replace(/[^A-Z0-9]+/g, "");
  const padded = compact.replace(/^([A-Z])([1-9])$/, "$10$2");
  const unpadded = compact.replace(/^([A-Z])0([1-9])$/, "$1$2");

  return Array.from(new Set([normalized, compact, padded, unpadded])).filter(
    Boolean
  );
}

function safeIlikeNeedle(value: string) {
  return value.replace(/[%_,]/g, "").trim();
}

function commandSearchScore(
  command: CommandItem,
  query: string,
  recentCommandHrefs: string[]
) {
  if (!query) {
    return recentCommandHrefs.includes(command.href) ? 100 : 10;
  }

  const title = command.title.toLowerCase();
  const haystack = commandSearchText(command);
  const tokens = queryTokens(query);

  if (tokens.length === 0) {
    return 0;
  }

  if (!tokens.every((token) => haystack.includes(token))) {
    return 0;
  }

  let score = 20;

  if (title === query) {
    score += 100;
  } else if (title.startsWith(query)) {
    score += 70;
  } else if (title.includes(query)) {
    score += 45;
  } else if (haystack.includes(query)) {
    score += 25;
  }

  score += tokens.filter((token) => title.includes(token)).length * 12;

  if (recentCommandHrefs.includes(command.href)) {
    score += 8;
  }

  return score;
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
  const [recordCommands, setRecordCommands] = useState<CommandItem[]>([]);
  const [isResolvingRecords, setIsResolvingRecords] = useState(false);
  const [recentCommandHrefs, setRecentCommandHrefs] = useState(
    loadRecentCommandHrefs
  );
  const searchInputRef = useRef<HTMLInputElement>(null);
  const business = searchParams.get("business") ?? "rnl-creations";
  const canResolveRecords = isOpen && query.trim().length >= 2;

  const commands = useMemo<CommandItem[]>(
    () => [
      {
        title: "Dashboard",
        detail: "Open the accounting and operations command view.",
        href: `/?business=${business}`,
        tone: "system",
        keywords: ["home", "overview", "command", "today", "platinum"],
      },
      {
        title: "Platinum Signal",
        detail: "Jump to the dashboard command signal and top operating metrics.",
        href: `/?business=${business}#dashboard-focus`,
        tone: "system",
        keywords: ["platinum", "signal", "hero", "hud", "dashboard"],
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
        title: "Risk Radar",
        detail: "Review proof gaps for reminders, PDFs, and payment images.",
        href: `/?business=${business}#dashboard-accounting`,
        tone: "security",
        keywords: [
          "risk",
          "radar",
          "audit",
          "proof",
          "pdf",
          "reminder",
          "image",
        ],
      },
      {
        title: "Audit Export",
        detail: "Open the activity center and export a filtered evidence CSV.",
        href: `/activity?business=${business}`,
        tone: "report",
        keywords: [
          "audit",
          "export",
          "csv",
          "proof",
          "activity",
          "evidence",
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
  const recordLookupQuery = query.trim();
  const recentCommands = recentCommandHrefs
    .map((href) => commands.find((command) => command.href === href))
    .filter((command): command is CommandItem => Boolean(command));
  const fallbackRecordCommands = useMemo<CommandItem[]>(() => {
    const lookup = canonicalDocumentSearch(recordLookupQuery);
    const cleanValue = normalizeLookupValue(lookup.value);
    const encoded = encodeURIComponent(cleanValue || recordLookupQuery);

    if (!cleanValue) {
      return [];
    }

    if (lookup.type === "invoice") {
      return [
        {
          title: `Search invoices for ${cleanValue}`,
          detail: "No exact invoice shortcut yet. Open invoice search with this value.",
          href: `/invoices?business=${business}&q=${encoded}`,
          tone: "cash",
          keywords: ["invoice", cleanValue],
          source: "fallback",
        },
      ];
    }

    if (lookup.type === "estimate") {
      return [
        {
          title: `Search estimates for ${cleanValue}`,
          detail: "No exact estimate shortcut yet. Open estimate search with this value.",
          href: `/estimates?business=${business}&q=${encoded}`,
          tone: "create",
          keywords: ["estimate", cleanValue],
          source: "fallback",
        },
      ];
    }

    if (lookup.type === "queue") {
      return [
        {
          title: `Search queue for ${cleanValue}`,
          detail: "Open queue search for this unit, property, or request.",
          href: `/queue?business=${business}&q=${encoded}`,
          tone: "queue",
          keywords: ["queue", "unit", cleanValue],
          source: "fallback",
        },
      ];
    }

    if (lookup.type === "client") {
      return [
        {
          title: `Search clients for ${cleanValue}`,
          detail: "Open the client book with this search filled in.",
          href: `/clients?business=${business}&q=${encoded}`,
          tone: "client",
          keywords: ["client", "customer", cleanValue],
          source: "fallback",
        },
      ];
    }

    return [
      {
        title: `Search invoices for ${cleanValue}`,
        detail: "Search invoice numbers, customers, projects, and statuses.",
        href: `/invoices?business=${business}&q=${encoded}`,
        tone: "cash",
        keywords: ["invoice", cleanValue],
        source: "fallback",
      },
      {
        title: `Search queue for ${cleanValue}`,
        detail: "Search active queue units, properties, notes, and paint due dates.",
        href: `/queue?business=${business}&q=${encoded}`,
        tone: "queue",
        keywords: ["queue", "unit", cleanValue],
        source: "fallback",
      },
    ];
  }, [business, recordLookupQuery]);
  const visibleCommands = (
    normalizedQuery
      ? [
          ...(canResolveRecords ? recordCommands : []),
          ...fallbackRecordCommands.filter(
            (fallback) =>
              !(canResolveRecords ? recordCommands : []).some(
                (record) => record.href === fallback.href
              )
          ),
          ...commands
            .map((command) => ({
              command,
              score: commandSearchScore(
                command,
                normalizedQuery,
                recentCommandHrefs
              ),
            }))
            .filter((result) => result.score > 0)
            .sort((first, second) => second.score - first.score)
            .map((result) => result.command),
        ]
      : [
          ...recentCommands,
          ...commands.filter(
            (command) => !recentCommandHrefs.includes(command.href)
          ),
        ]
  )
    .slice(0, 10);
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
    setRecordCommands([]);
    setIsResolvingRecords(false);
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
    if (!isOpen || recordLookupQuery.trim().length < 2) {
      return;
    }

    let isActive = true;
    const timer = window.setTimeout(async () => {
      const lookup = canonicalDocumentSearch(recordLookupQuery);
      const lookupValue = normalizeLookupValue(lookup.value);
      const needle = safeIlikeNeedle(displayIdNeedle(lookupValue));
      const queueNeedles = queueUnitNeedles(lookupValue);

      if (!lookupValue || (!needle && queueNeedles.length === 0)) {
        setRecordCommands([]);
        setIsResolvingRecords(false);
        return;
      }

      setIsResolvingRecords(true);

      const { data: businessData } = await supabase
        .from("businesses")
        .select("id, slug")
        .eq("slug", business)
        .limit(1)
        .maybeSingle();

      if (!isActive) {
        return;
      }

      const selectedBusiness = businessData as BusinessRecord | null;

      if (!selectedBusiness?.id) {
        setRecordCommands([]);
        setIsResolvingRecords(false);
        return;
      }

      const nextCommands: CommandItem[] = [];

      if (
        (lookup.type === "invoice" || lookup.type === "general") &&
        needle.length >= 2
      ) {
        const { data } = await supabase
          .from("invoices")
          .select("id, display_id, customer_name, project_title, status")
          .eq("business_id", selectedBusiness.id)
          .ilike("display_id", `%${needle}%`)
          .order("created_at", { ascending: false })
          .limit(5);

        ((data ?? []) as InvoiceSearchRecord[]).forEach((invoice) => {
          nextCommands.push({
            title: invoice.display_id ?? "Invoice",
            detail: [
              invoice.customer_name,
              invoice.project_title,
              invoice.status,
            ]
              .filter(Boolean)
              .join(" / ") || "Open invoice record",
            href: `/invoices/${invoice.id}?business=${business}`,
            tone: "cash",
            keywords: [
              "invoice",
              invoice.display_id ?? "",
              invoice.customer_name ?? "",
              invoice.project_title ?? "",
            ],
            source: "record",
          });
        });
      }

      if (
        (lookup.type === "estimate" || lookup.type === "general") &&
        needle.length >= 2
      ) {
        const { data } = await supabase
          .from("estimates")
          .select("id, display_id, customer_name, project_title, status")
          .eq("business_id", selectedBusiness.id)
          .ilike("display_id", `%${needle}%`)
          .order("created_at", { ascending: false })
          .limit(5);

        ((data ?? []) as EstimateSearchRecord[]).forEach((estimate) => {
          nextCommands.push({
            title: estimate.display_id ?? "Estimate",
            detail: [
              estimate.customer_name,
              estimate.project_title,
              estimate.status,
            ]
              .filter(Boolean)
              .join(" / ") || "Open estimate record",
            href: `/estimates/${estimate.id}?business=${business}`,
            tone: "create",
            keywords: [
              "estimate",
              estimate.display_id ?? "",
              estimate.customer_name ?? "",
              estimate.project_title ?? "",
            ],
            source: "record",
          });
        });
      }

      if (lookup.type === "queue" || lookup.type === "general") {
        const queueNeedle = safeIlikeNeedle(queueNeedles[0] ?? lookupValue);

        if (queueNeedle.length >= 1) {
          const { data } = await supabase
            .from("queue_items")
            .select("id, property, unit, status, priority, ready_date")
            .eq("business_id", selectedBusiness.id)
            .or(
              `unit.ilike.%${queueNeedle}%,property.ilike.%${queueNeedle}%,notes.ilike.%${queueNeedle}%`
            )
            .order("created_at", { ascending: false })
            .limit(5);

          ((data ?? []) as QueueSearchRecord[]).forEach((item) => {
            nextCommands.push({
              title: `Queue ${item.unit ?? "Item"}`,
              detail: [
                item.property,
                item.status,
                item.priority ? `${item.priority} priority` : "",
                item.ready_date ? `Paint due ${item.ready_date}` : "",
              ]
                .filter(Boolean)
                .join(" / ") || "Open queue item",
              href: `/queue/${item.id}?business=${business}`,
              tone: "queue",
              keywords: [
                "queue",
                "unit",
                item.unit ?? "",
                item.property ?? "",
                item.status ?? "",
              ],
              source: "record",
            });
          });
        }
      }

      if (lookup.type === "client" || lookup.type === "general") {
        const clientNeedle = safeIlikeNeedle(lookupValue);

        if (clientNeedle.length >= 2) {
          const { data } = await supabase
            .from("clients")
            .select("id, name, contact_name, email, phone")
            .eq("business_id", selectedBusiness.id)
            .or(
              `name.ilike.%${clientNeedle}%,contact_name.ilike.%${clientNeedle}%,email.ilike.%${clientNeedle}%,phone.ilike.%${clientNeedle}%`
            )
            .order("name", { ascending: true })
            .limit(5);

          ((data ?? []) as ClientSearchRecord[]).forEach((client) => {
            nextCommands.push({
              title: client.name ?? "Client",
              detail: [client.contact_name, client.email, client.phone]
                .filter(Boolean)
                .join(" / ") || "Open client record",
              href: `/clients/${client.id}?business=${business}`,
              tone: "client",
              keywords: [
                "client",
                "customer",
                client.name ?? "",
                client.contact_name ?? "",
                client.email ?? "",
              ],
              source: "record",
            });
          });
        }
      }

      if (!isActive) {
        return;
      }

      const uniqueCommands = Array.from(
        new Map(nextCommands.map((command) => [command.href, command])).values()
      ).slice(0, 8);

      setRecordCommands(uniqueCommands);
      setIsResolvingRecords(false);
    }, 180);

    return () => {
      isActive = false;
      window.clearTimeout(timer);
    };
  }, [business, isOpen, recordLookupQuery]);

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
                  const nextQuery = event.target.value;
                  setQuery(nextQuery);
                  setSelectedIndex(0);

                  if (nextQuery.trim().length < 2) {
                    setRecordCommands([]);
                    setIsResolvingRecords(false);
                  }
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
                placeholder="Try: INV 502, EST 505, Q G03, North Creek..."
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
              <div className="quick-command-brief">
                <div>
                  <p className="quick-command-brief-kicker">Command Matrix</p>
                  <p className="quick-command-brief-title">
                    Jump to invoices, estimates, queue units, clients, and workflows.
                  </p>
                </div>
                <span>
                  {isResolvingRecords ? "Searching..." : `${visibleCommands.length} ready`}
                </span>
              </div>

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
                  {recordCommands.length > 0
                    ? `${recordCommands.length} record match${
                        recordCommands.length === 1 ? "" : "es"
                      } / `
                    : ""}
                  {visibleCommands.length} total match
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
                        {command.source === "record" ? (
                          <span className="quick-command-recent-pill">
                            Record
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
