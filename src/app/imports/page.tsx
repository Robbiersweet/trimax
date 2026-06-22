"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AppShell from "../components/AppShell";
import Button from "../components/Button";
import Card from "../components/Card";
import Toast from "../components/Toast";
import {
  getNextDocumentDisplayId,
  normalizeDocumentDisplayId,
} from "../lib/documentNumbers";
import { logActivity } from "../lib/activityLog";
import { assertCanWriteDuringMaintenance } from "../lib/maintenanceMode";
import { createSplitInvoices } from "../lib/splitInvoices";
import { supabase } from "../lib/supabase";
import { looksLikeApartmentUnitPaintJob } from "../utils/jobWorkflow";

type ImportType = "clients" | "invoices";

type Business = {
  id: string;
  name: string;
  slug: string;
  split_warning_amount: number | string | null;
};

type Client = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  contact_name: string | null;
  billing_address: string | null;
  service_address: string | null;
  notes: string | null;
};

type CsvRow = Record<string, string>;

type ClientImportRow = {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  billingAddress: string;
  serviceAddress: string;
  notes: string;
};

type InvoiceImportRow = {
  customerName: string;
  freshBooksNumber: string;
  projectTitle: string;
  issueDate: string;
  dueDate: string;
  amount: number;
  amountPaid: number;
  subtotal: number;
  taxAmount: number;
  taxLabel: string;
  taxRate: number;
  status: string;
  reference: string;
  notes: string;
  lineItems: InvoiceImportLineItem[];
  sourceRowNumbers: number[];
};

type InvoiceImportLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  taxLabel: string;
  taxAmount: number;
};

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let currentCell = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"' && inQuotes && nextCharacter === '"') {
      currentCell += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      currentRow.push(currentCell.trim());
      currentCell = "";

      if (currentRow.some(Boolean)) {
        rows.push(currentRow);
      }

      currentRow = [];
      continue;
    }

    currentCell += character;
  }

  currentRow.push(currentCell.trim());

  if (currentRow.some(Boolean)) {
    rows.push(currentRow);
  }

  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].map(normalizeHeader);

  return rows.slice(1).map((row) => {
    return headers.reduce<CsvRow>((mappedRow, header, index) => {
      if (header) {
        mappedRow[header] = row[index] ?? "";
      }

      return mappedRow;
    }, {});
  });
}

function field(row: CsvRow, aliases: string[]) {
  for (const alias of aliases) {
    const value = row[normalizeHeader(alias)];

    if (value) {
      return value.trim();
    }
  }

  return "";
}

function moneyValue(value: string) {
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundRate(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function dateValue(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  const date = new Date(trimmed);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function joinAddressParts(parts: string[]) {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

function normalizeFreshBooksClientName(name: string) {
  const trimmedName = name.trim();

  if (trimmedName.toLowerCase() === "north creek") {
    return "North Creek Apartments";
  }

  return trimmedName;
}

function statusLabel(value: string) {
  const normalized = value.trim().toLowerCase();

  if (normalized === "paid") {
    return "Paid";
  }

  if (normalized === "overdue") {
    return "Overdue";
  }

  if (normalized === "sent") {
    return "Sent";
  }

  return "Draft";
}

function mapClientRow(row: CsvRow): ClientImportRow {
  const firstName = field(row, ["First Name", "First"]);
  const lastName = field(row, ["Last Name", "Last"]);
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  const organization = field(row, [
    "Client",
    "Client Name",
    "Customer",
    "Customer Name",
    "Organization",
    "Company",
    "Name",
  ]);
  const addressLine1 = field(row, [
    "Address Line 1",
    "Billing Address",
    "Address",
    "Street",
    "Client Address",
  ]);
  const addressLine2 = field(row, ["Address Line 2", "Suite", "Unit"]);
  const city = field(row, ["City"]);
  const state = field(row, ["Province/State", "State", "Province"]);
  const postalCode = field(row, ["Postal Code", "Zip", "Zip Code"]);
  const country = field(row, ["Country"]);
  const billingAddress = joinAddressParts([
    addressLine1,
    addressLine2,
    city,
    state,
    postalCode,
    country,
  ]);

  return {
    name: normalizeFreshBooksClientName(organization || fullName),
    contactName:
      field(row, ["Contact Name", "Contact", "Primary Contact"]) ||
      (organization ? fullName : ""),
    email: field(row, [
      "Email",
      "Email Address",
      "Client Email",
      "Primary Email",
      "Contact Email",
      "Billing Email",
      "Customer Email",
    ]),
    phone: field(row, [
      "Phone",
      "Phone Number",
      "Mobile",
      "Mobile Phone",
      "Work Phone",
      "Business Phone",
      "Client Phone",
    ]),
    billingAddress,
    serviceAddress: field(row, [
      "Service Address",
      "Shipping Address",
      "Location",
    ]) || billingAddress,
    notes: field(row, ["Notes", "Note", "Description"]),
  };
}

function mapInvoiceLineItem(row: CsvRow): InvoiceImportLineItem {
  const itemName = field(row, ["Item Name", "Item", "Service"]);
  const itemDescription = field(row, [
    "Item Description",
    "Description",
    "Line Description",
  ]);
  const lineSubtotal = moneyValue(
    field(row, ["Line Subtotal", "Subtotal", "Amount"])
  );
  const taxAmount =
    moneyValue(field(row, ["Tax 1 Amount"])) +
    moneyValue(field(row, ["Tax 2 Amount"]));

  return {
    description:
      [itemName, itemDescription].filter(Boolean).join(" - ") ||
      "FreshBooks line item",
    quantity: moneyValue(field(row, ["Quantity", "Qty"])) || 1,
    unitPrice: moneyValue(field(row, ["Rate", "Unit Price", "Price"])),
    lineTotal: lineSubtotal,
    taxLabel: [
      field(row, ["Tax 1 Type"]),
      field(row, ["Tax 2 Type"]),
    ]
      .filter(Boolean)
      .join(" + "),
    taxAmount,
  };
}

function mapInvoiceRows(rows: CsvRow[]): InvoiceImportRow[] {
  const groupedInvoices = new Map<string, InvoiceImportRow>();

  rows.forEach((row, index) => {
    const freshBooksNumber = field(row, [
      "Invoice Number",
      "Invoice #",
      "Number",
      "Invoice",
    ]);
    const customerName = normalizeFreshBooksClientName(
      field(row, [
        "Client",
        "Client Name",
        "Customer",
        "Customer Name",
        "Organization",
        "Company",
      ])
    );
    const groupKey =
      getFreshBooksInvoiceDisplayId(freshBooksNumber) ||
      `${customerName}-${field(row, ["Date Issued", "Issue Date", "Date"])}-${
        index + 1
      }`;
    const lineItem = mapInvoiceLineItem(row);
    const existingInvoice = groupedInvoices.get(groupKey);

    if (existingInvoice) {
      existingInvoice.lineItems.push(lineItem);
      existingInvoice.sourceRowNumbers.push(index + 1);
      existingInvoice.subtotal = roundMoney(
        existingInvoice.subtotal + lineItem.lineTotal
      );
      existingInvoice.taxAmount = roundMoney(
        existingInvoice.taxAmount + lineItem.taxAmount
      );
      existingInvoice.amount = roundMoney(
        existingInvoice.subtotal + existingInvoice.taxAmount
      );
      existingInvoice.taxRate =
        existingInvoice.subtotal > 0
          ? roundRate(
              (existingInvoice.taxAmount / existingInvoice.subtotal) * 100
            )
          : 0;
      existingInvoice.taxLabel = Array.from(
        new Set(
          existingInvoice.lineItems
            .map((item) => item.taxLabel)
            .filter(Boolean)
        )
      ).join(" + ");

      if (existingInvoice.status === "Paid") {
        existingInvoice.amountPaid = existingInvoice.amount;
      }

      return;
    }

    const subtotal = roundMoney(lineItem.lineTotal);
    const taxAmount = roundMoney(lineItem.taxAmount);
    const amount = roundMoney(subtotal + taxAmount);
    const status = statusLabel(field(row, ["Status", "Invoice Status"]));

    groupedInvoices.set(groupKey, {
      customerName,
      freshBooksNumber,
      projectTitle:
        field(row, ["Project", "Project Title", "Subject"]) ||
        (freshBooksNumber
          ? `FreshBooks invoice ${freshBooksNumber}`
          : "Imported FreshBooks invoice"),
      issueDate: dateValue(
        field(row, [
          "Date Issued",
          "Issue Date",
          "Date",
          "Invoice Date",
          "Created Date",
        ])
      ),
      dueDate: dateValue(field(row, ["Date Due", "Due Date", "Due"])),
      amount,
      amountPaid:
        status === "Paid"
          ? amount
          : moneyValue(field(row, ["Paid", "Amount Paid", "Payments"])),
      subtotal,
      taxAmount,
      taxLabel: lineItem.taxLabel,
      taxRate:
        subtotal > 0 ? roundRate((taxAmount / subtotal) * 100) : 0,
      status,
      reference: freshBooksNumber
        ? `FreshBooks ${freshBooksNumber}`
        : "FreshBooks import",
      notes: field(row, ["Notes", "Note"]),
      lineItems: [lineItem],
      sourceRowNumbers: [index + 1],
    });
  });

  return Array.from(groupedInvoices.values()).filter(
    (row) => row.customerName && row.amount > 0
  );
}

function getFreshBooksInvoiceDisplayId(freshBooksNumber: string) {
  return normalizeDocumentDisplayId(freshBooksNumber, "INV");
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function findMatchingClient(existingClients: Client[], row: ClientImportRow) {
  const rowName = row.name.trim().toLowerCase();
  const rowEmail = row.email.trim().toLowerCase();

  return existingClients.find((client) => {
    const clientName = client.name.trim().toLowerCase();
    const clientEmail = (client.email ?? "").trim().toLowerCase();

    return (
      (rowName && clientName === rowName) ||
      (rowEmail && clientEmail === rowEmail)
    );
  });
}

function getClientBackfill(row: ClientImportRow, client: Client) {
  const backfill: Record<string, string> = {};

  if (row.email && !client.email?.trim()) {
    backfill.email = row.email.trim().toLowerCase();
  }

  if (row.phone && !client.phone?.trim()) {
    backfill.phone = row.phone;
  }

  if (row.contactName && !client.contact_name?.trim()) {
    backfill.contact_name = row.contactName;
  }

  if (row.billingAddress && !client.billing_address?.trim()) {
    backfill.billing_address = row.billingAddress;
  }

  if (row.serviceAddress && !client.service_address?.trim()) {
    backfill.service_address = row.serviceAddress;
  }

  if (row.notes && !client.notes?.trim()) {
    backfill.notes = row.notes;
  }

  return backfill;
}

function ImportsPageContent() {
  const searchParams = useSearchParams();
  const businessSlug =
    searchParams.get("business") ?? "rnl-creations";

  const [business, setBusiness] = useState<Business | null>(null);
  const [importType, setImportType] =
    useState<ImportType>("clients");
  const [fileName, setFileName] = useState("");
  const [rawRows, setRawRows] = useState<CsvRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [lastResult, setLastResult] = useState("");

  const clientRows = useMemo(
    () => rawRows.map(mapClientRow).filter((row) => row.name),
    [rawRows]
  );
  const invoiceRows = useMemo(
    () => mapInvoiceRows(rawRows),
    [rawRows]
  );
  const previewRows =
    importType === "clients" ? clientRows : invoiceRows;
  const splitTargetAmount = Number(business?.split_warning_amount) || 0;
  const invoicePreviewRows = importType === "invoices" ? invoiceRows : [];
  const clientPreviewRows = importType === "clients" ? clientRows : [];
  const previewInvoiceTotal = invoicePreviewRows.reduce(
    (total, row) => total + row.amount,
    0
  );
  const previewInvoiceLineCount = invoicePreviewRows.reduce(
    (total, row) => total + row.lineItems.length,
    0
  );
  const previewSplitReadyCount = invoicePreviewRows.filter(
    (row) =>
      splitTargetAmount > 0 &&
      row.amount - row.amountPaid > splitTargetAmount &&
      looksLikeApartmentUnitPaintJob(
        row.customerName,
        row.projectTitle,
        row.lineItems
      )
  ).length;
  const previewOpenInvoiceCount = invoicePreviewRows.filter(
    (row) => row.amount > row.amountPaid
  ).length;
  const clientRowsWithEmail = clientPreviewRows.filter((row) =>
    row.email.trim()
  ).length;
  const clientRowsWithPhone = clientPreviewRows.filter((row) =>
    row.phone.trim()
  ).length;
  const clientRowsWithAddress = clientPreviewRows.filter(
    (row) => row.billingAddress.trim() || row.serviceAddress.trim()
  ).length;
  const clientRowsMissingContact = clientPreviewRows.filter(
    (row) => !row.email.trim() && !row.phone.trim()
  ).length;
  const invoiceRowsMissingDueDate = invoicePreviewRows.filter(
    (row) => !row.dueDate
  ).length;
  const ignoredRawRowCount = Math.max(rawRows.length - previewRows.length, 0);
  const clientContactCoverage =
    clientPreviewRows.length > 0
      ? Math.round(
          ((clientPreviewRows.length - clientRowsMissingContact) /
            clientPreviewRows.length) *
            100
        )
      : 0;
  const invoiceDueDateCoverage =
    invoicePreviewRows.length > 0
      ? Math.round(
          ((invoicePreviewRows.length - invoiceRowsMissingDueDate) /
            invoicePreviewRows.length) *
            100
        )
      : 0;
  const importQualityScore =
    previewRows.length === 0
      ? 0
      : importType === "clients"
        ? Math.round(
            (clientContactCoverage +
              (clientPreviewRows.length > 0
                ? Math.round(
                    (clientRowsWithAddress / clientPreviewRows.length) * 100
                  )
                : 0)) /
              2
          )
        : Math.round(
            (invoiceDueDateCoverage +
              (previewOpenInvoiceCount > 0 || previewInvoiceTotal > 0
                ? 100
                : 0)) /
              2
          );
  const importChecklist =
    importType === "clients"
      ? [
          {
            label: "CSV parsed",
            detail:
              rawRows.length > 0
                ? `${rawRows.length} raw row${rawRows.length === 1 ? "" : "s"} detected.`
                : "Choose a CSV file to start the preview.",
            complete: rawRows.length > 0,
          },
          {
            label: "Client names found",
            detail:
              previewRows.length > 0
                ? `${previewRows.length} client row${previewRows.length === 1 ? "" : "s"} can be imported.`
                : "Trimax needs a readable client or customer name.",
            complete: previewRows.length > 0,
          },
          {
            label: "Contact path ready",
            detail:
              clientRowsMissingContact > 0
                ? `${clientRowsMissingContact} row${clientRowsMissingContact === 1 ? "" : "s"} missing email and phone.`
                : "Every previewed client has email or phone.",
            complete: previewRows.length > 0 && clientRowsMissingContact === 0,
          },
          {
            label: "Location context",
            detail:
              clientRowsWithAddress > 0
                ? `${clientRowsWithAddress} row${clientRowsWithAddress === 1 ? "" : "s"} include billing or service address.`
                : "Addresses are optional, but useful for invoices and jobs.",
            complete: clientRowsWithAddress > 0,
          },
        ]
      : [
          {
            label: "CSV parsed",
            detail:
              rawRows.length > 0
                ? `${rawRows.length} raw line item row${rawRows.length === 1 ? "" : "s"} detected.`
                : "Choose a CSV file to start the preview.",
            complete: rawRows.length > 0,
          },
          {
            label: "Invoices grouped",
            detail:
              previewRows.length > 0
                ? `${previewRows.length} invoice${previewRows.length === 1 ? "" : "s"} ready from ${previewInvoiceLineCount} line item${previewInvoiceLineCount === 1 ? "" : "s"}.`
                : "Trimax needs customer names and invoice amounts.",
            complete: previewRows.length > 0,
          },
          {
            label: "Dates readable",
            detail:
              invoiceRowsMissingDueDate > 0
                ? `${invoiceRowsMissingDueDate} invoice${invoiceRowsMissingDueDate === 1 ? "" : "s"} missing due dates.`
                : "Every previewed invoice has a due date.",
            complete: previewRows.length > 0 && invoiceRowsMissingDueDate === 0,
          },
          {
            label: "Split logic checked",
            detail:
              previewSplitReadyCount > 0
                ? `${previewSplitReadyCount} apartment-paint invoice${previewSplitReadyCount === 1 ? "" : "s"} can create split drafts.`
                : "No split candidates found in this preview.",
            complete: splitTargetAmount > 0,
          },
        ];
  const importGateCards =
    importType === "clients"
      ? [
          {
            label: "Contactable",
            value: `${clientPreviewRows.length - clientRowsMissingContact}/${
              clientPreviewRows.length
            }`,
            detail: "Rows with at least email or phone.",
            tone: clientRowsMissingContact > 0 ? "amber" : "emerald",
          },
          {
            label: "Address Ready",
            value: `${clientRowsWithAddress}/${clientPreviewRows.length}`,
            detail: "Rows with billing or service address.",
            tone:
              clientRowsWithAddress === clientPreviewRows.length
                ? "emerald"
                : "amber",
          },
          {
            label: "Needs Review",
            value: String(clientRowsMissingContact),
            detail: "Rows missing both email and phone.",
            tone: clientRowsMissingContact > 0 ? "rose" : "zinc",
          },
        ]
      : [
          {
            label: "Open Balance",
            value: formatMoney(
              invoicePreviewRows.reduce(
                (total, row) => total + Math.max(row.amount - row.amountPaid, 0),
                0
              )
            ),
            detail: "Potential collectible balance from this file.",
            tone: "emerald",
          },
          {
            label: "Split Candidates",
            value: String(previewSplitReadyCount),
            detail: "Apartment paint invoices over the split threshold.",
            tone: previewSplitReadyCount > 0 ? "cyan" : "zinc",
          },
          {
            label: "Needs Due Date",
            value: String(invoiceRowsMissingDueDate),
            detail: "Invoice rows without a readable due date.",
            tone: invoiceRowsMissingDueDate > 0 ? "amber" : "zinc",
          },
        ];
  const importGateReady =
    previewRows.length > 0 &&
    (importType === "clients"
      ? clientRowsMissingContact === 0 || clientRowsWithAddress > 0
      : invoiceRowsMissingDueDate === 0 || previewOpenInvoiceCount > 0);

  useEffect(() => {
    async function loadBusiness() {
      const { data, error } = await supabase
        .from("businesses")
        .select("id, name, slug, split_warning_amount")
        .eq("slug", businessSlug)
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        setToast({
          type: "error",
          message: "Unable to load selected business.",
        });
        return;
      }

      setBusiness(data as Business);
    }

    loadBusiness();
  }, [businessSlug]);

  async function handleFileChange(file: File | null) {
    setToast(null);
    setLastResult("");

    try {
      await assertCanWriteDuringMaintenance(businessSlug);
    } catch (error) {
      setToast({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Trimax is being updated. Try again in a few minutes.",
      });
      return;
    }

    if (!file) {
      setFileName("");
      setRawRows([]);
      return;
    }

    const text = await file.text();
    const parsedRows = parseCsv(text);

    setFileName(file.name);
    setRawRows(parsedRows);

    if (parsedRows.length === 0) {
      setToast({
        type: "error",
        message:
          "Trimax could not find CSV rows. Make sure the first row has column names.",
      });
    }
  }

  async function createImportBatch(
    importedCount: number,
    skippedCount: number,
    errorCount: number
  ) {
    if (!business) {
      return null;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("import_batches")
      .insert({
        business_id: business.id,
        source: "csv",
        import_type: importType,
        file_name: fileName || null,
        status: errorCount > 0 ? "failed" : "completed",
        row_count: previewRows.length,
        imported_count: importedCount,
        skipped_count: skippedCount,
        error_count: errorCount,
        created_by_user_id: user?.id ?? null,
        created_by_email: user?.email ?? null,
      })
      .select("id")
      .single();

    if (error || !data) {
      console.warn("Import batch log skipped:", error?.message);
      return null;
    }

    return data.id as string;
  }

  async function importClients() {
    if (!business) {
      return;
    }

    const { data: existingData } = await supabase
      .from("clients")
      .select(
        "id, name, email, phone, contact_name, billing_address, service_address, notes"
      )
      .eq("business_id", business.id);
    const existingClients = (existingData ?? []) as Client[];
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let importedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const importRows: Record<string, unknown>[] = [];

    for (const [index, row] of clientRows.entries()) {
      const matchingClient = findMatchingClient(existingClients, row);

      if (matchingClient) {
        const backfill = getClientBackfill(row, matchingClient);

        if (Object.keys(backfill).length > 0) {
          const { error } = await supabase
            .from("clients")
            .update(backfill)
            .eq("id", matchingClient.id)
            .eq("business_id", business.id);

          if (error) {
            errorCount += 1;
            importRows.push({
              business_id: business.id,
              row_number: index + 1,
              import_type: "clients",
              raw_data: rawRows[index] ?? {},
              mapped_data: row,
              status: "error",
              target_table: "clients",
              target_id: matchingClient.id,
              error_message:
                error.message ?? "Unable to update existing client.",
            });
            continue;
          }

          Object.assign(matchingClient, backfill);
          importedCount += 1;
          importRows.push({
            business_id: business.id,
            row_number: index + 1,
            import_type: "clients",
            raw_data: rawRows[index] ?? {},
            mapped_data: row,
            status: "imported",
            target_table: "clients",
            target_id: matchingClient.id,
          });
          continue;
        }

        skippedCount += 1;
        importRows.push({
          business_id: business.id,
          row_number: index + 1,
          import_type: "clients",
          raw_data: rawRows[index] ?? {},
          mapped_data: row,
          status: "skipped",
          target_table: "clients",
          error_message: "Skipped duplicate client with no blank fields to fill.",
        });
        continue;
      }

      const { data, error } = await supabase
        .from("clients")
        .insert({
          business_id: business.id,
          created_by_user_id: user?.id ?? null,
          name: row.name,
          contact_name: row.contactName || null,
          email: row.email || null,
          phone: row.phone || null,
          billing_address: row.billingAddress || null,
          service_address: row.serviceAddress || row.billingAddress || null,
          notes: row.notes || null,
        })
        .select(
          "id, name, email, phone, contact_name, billing_address, service_address, notes"
        )
        .single();

      if (error || !data) {
        errorCount += 1;
        importRows.push({
          business_id: business.id,
          row_number: index + 1,
          import_type: "clients",
          raw_data: rawRows[index] ?? {},
          mapped_data: row,
          status: "error",
          target_table: "clients",
          error_message: error?.message ?? "Client import failed.",
        });
        continue;
      }

      importedCount += 1;
      existingClients.push(data as Client);
      importRows.push({
        business_id: business.id,
        row_number: index + 1,
        import_type: "clients",
        raw_data: rawRows[index] ?? {},
        mapped_data: row,
        status: "imported",
        target_table: "clients",
        target_id: (data as Client).id,
      });
    }

    const batchId = await createImportBatch(
      importedCount,
      skippedCount,
      errorCount
    );

    if (batchId && importRows.length > 0) {
      await supabase.from("import_rows").insert(
        importRows.map((row) => ({
          ...row,
          batch_id: batchId,
        }))
      );
    }

    await logActivity({
      businessId: business.id,
      action: "import.clients_csv_completed",
      entityType: "import_batch",
      entityId: batchId,
      entityLabel: fileName || "Client CSV import",
      details: {
        importedCount,
        skippedCount,
        errorCount,
      },
    });

    setLastResult(
      `Imported ${importedCount} client${
        importedCount === 1 ? "" : "s"
      }. Skipped ${skippedCount}. Errors ${errorCount}.`
    );
  }

  async function findOrCreateClient(
    clients: Client[],
    customerName: string
  ) {
    if (!business) {
      return null;
    }

    const matchingClient = clients.find(
      (client) =>
        client.name.trim().toLowerCase() ===
        customerName.trim().toLowerCase()
    );

    if (matchingClient) {
      return matchingClient;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data } = await supabase
      .from("clients")
      .insert({
        business_id: business.id,
        created_by_user_id: user?.id ?? null,
        name: customerName,
        notes: "Created during CSV invoice import.",
      })
      .select(
        "id, name, email, phone, contact_name, billing_address, service_address, notes"
      )
      .single();

    if (!data) {
      return null;
    }

    const client = data as Client;
    clients.push(client);
    return client;
  }

  async function importInvoices() {
    if (!business) {
      return;
    }

    const { data: existingClientData } = await supabase
      .from("clients")
      .select(
        "id, name, email, phone, contact_name, billing_address, service_address, notes"
      )
      .eq("business_id", business.id);
    const clients = (existingClientData ?? []) as Client[];
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: existingInvoiceData } = await supabase
      .from("invoices")
      .select("display_id")
      .eq("business_id", business.id);
    const usedInvoiceDisplayIds = new Set(
      (existingInvoiceData ?? [])
        .map((invoice) => invoice.display_id as string | null)
        .filter((displayId): displayId is string => Boolean(displayId))
    );

    let importedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const importRows: Record<string, unknown>[] = [];

    for (const [index, row] of invoiceRows.entries()) {
      const client = await findOrCreateClient(clients, row.customerName);

      if (!client) {
        errorCount += 1;
        importRows.push({
          business_id: business.id,
          row_number: index + 1,
          import_type: "invoices",
          raw_data: row.sourceRowNumbers.map(
            (rowNumber) => rawRows[rowNumber - 1] ?? {}
          ),
          mapped_data: row,
          status: "error",
          target_table: "invoices",
          error_message: "Unable to find or create invoice client.",
        });
        continue;
      }

      const importedDisplayId = getFreshBooksInvoiceDisplayId(
        row.freshBooksNumber
      );
      let displayId = importedDisplayId;

      if (displayId && usedInvoiceDisplayIds.has(displayId)) {
        skippedCount += 1;
        importRows.push({
          business_id: business.id,
          row_number: index + 1,
          import_type: "invoices",
          raw_data: row.sourceRowNumbers.map(
            (rowNumber) => rawRows[rowNumber - 1] ?? {}
          ),
          mapped_data: row,
          status: "skipped",
          target_table: "invoices",
          error_message: `${displayId} already exists in Trimax.`,
        });
        continue;
      }

      if (!displayId) {
        displayId = await getNextDocumentDisplayId({
          table: "invoices",
          prefix: "INV",
          businessId: business.id,
        });
      }

      usedInvoiceDisplayIds.add(displayId);
      const status =
        row.status.toLowerCase().includes("paid") ||
        row.amountPaid >= row.amount
          ? "Paid"
          : row.status || "Draft";
      const notes = [
        row.notes,
        importedDisplayId
          ? `Imported from FreshBooks invoice ${importedDisplayId}.`
          : row.freshBooksNumber
            ? `Imported from FreshBooks invoice ${row.freshBooksNumber}.`
            : "Imported from FreshBooks CSV.",
      ]
        .filter(Boolean)
        .join("\n");
      const splitTargetAmount =
        Number(business.split_warning_amount) || 0;
      const splitSubtotal =
        row.subtotal > 0
          ? row.subtotal
          : Math.max(row.amount - row.taxAmount, 0);
      const shouldCreateSplitInvoices =
        splitTargetAmount > 0 &&
        row.amount > row.amountPaid &&
        looksLikeApartmentUnitPaintJob(
          row.customerName,
          row.projectTitle,
          row.lineItems.map((item) => ({
            description: item.description,
          }))
        );

      const { data, error } = await supabase
        .from("invoices")
        .insert({
          business_id: business.id,
          client_id: client.id,
          created_by_user_id: user?.id ?? null,
          display_id: displayId,
          customer_name: row.customerName,
          project_title: row.projectTitle,
          invoice_amount: `$${row.amount.toFixed(2)}`,
          issue_date: row.issueDate || null,
          due_date: row.dueDate || null,
          reference: row.reference,
          tax_mode: row.taxAmount > 0 ? "taxable" : "no_tax",
          tax_label: row.taxLabel || null,
          tax_rate: row.taxRate,
          amount_paid: row.amountPaid,
          split_warning_enabled: shouldCreateSplitInvoices,
          split_target_amount: shouldCreateSplitInvoices
            ? splitTargetAmount
            : null,
          terms: "",
          notes,
          status,
        })
        .select("id")
        .single();

      if (error || !data) {
        errorCount += 1;
        importRows.push({
          business_id: business.id,
          row_number: index + 1,
          import_type: "invoices",
          raw_data: row.sourceRowNumbers.map(
            (rowNumber) => rawRows[rowNumber - 1] ?? {}
          ),
          mapped_data: row,
          status: "error",
          target_table: "invoices",
          error_message: error?.message ?? "Invoice import failed.",
        });
        continue;
      }

      const { error: lineItemError } = await supabase
        .from("invoice_line_items")
        .insert(
          row.lineItems.map((item, itemIndex) => ({
            invoice_id: (data as { id: string }).id,
            business_id: business.id,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            line_total: item.lineTotal,
            sort_order: itemIndex,
          }))
        );

      if (lineItemError) {
        await supabase
          .from("invoices")
          .delete()
          .eq("id", (data as { id: string }).id)
          .eq("business_id", business.id);
        usedInvoiceDisplayIds.delete(displayId);
        errorCount += 1;
        importRows.push({
          business_id: business.id,
          row_number: index + 1,
          import_type: "invoices",
          raw_data: row.sourceRowNumbers.map(
            (rowNumber) => rawRows[rowNumber - 1] ?? {}
          ),
          mapped_data: row,
          status: "error",
          target_table: "invoice_line_items",
          target_id: (data as { id: string }).id,
          error_message: lineItemError.message,
        });
        continue;
      }

      if (shouldCreateSplitInvoices) {
        try {
          await createSplitInvoices({
            sourceInvoice: {
              id: (data as { id: string }).id,
              displayId,
              businessId: business.id,
              businessSlug: business.slug,
              clientId: client.id,
              customerName: row.customerName,
              projectTitle: row.projectTitle,
              issueDate: row.issueDate || null,
              dueDate: row.dueDate || null,
              reference: row.reference,
              serviceAddress: "",
              terms: "",
              notes,
            },
            subtotalAmount: splitSubtotal,
            targetAmount: splitTargetAmount,
            taxLabel: row.taxLabel || "Tax",
            taxRate: row.taxRate,
            taxMode: row.taxAmount > 0 ? "taxable" : "no_tax",
            taxNumber: null,
            createdByUserId: user?.id ?? null,
          });
        } catch (splitError) {
          console.error(splitError);
          errorCount += 1;
          importRows.push({
            business_id: business.id,
            row_number: index + 1,
            import_type: "invoices",
            raw_data: row.sourceRowNumbers.map(
              (rowNumber) => rawRows[rowNumber - 1] ?? {}
            ),
            mapped_data: row,
            status: "error",
            target_table: "invoices",
            target_id: (data as { id: string }).id,
            error_message:
              "Invoice imported, but automatic split drafts failed.",
          });
          continue;
        }
      }

      importedCount += 1;
      importRows.push({
        business_id: business.id,
        row_number: index + 1,
        import_type: "invoices",
        raw_data: row.sourceRowNumbers.map(
          (rowNumber) => rawRows[rowNumber - 1] ?? {}
        ),
        mapped_data: row,
        status: "imported",
        target_table: "invoices",
        target_id: (data as { id: string }).id,
      });
    }

    const batchId = await createImportBatch(
      importedCount,
      skippedCount,
      errorCount
    );

    if (batchId && importRows.length > 0) {
      await supabase.from("import_rows").insert(
        importRows.map((row) => ({
          ...row,
          batch_id: batchId,
        }))
      );
    }

    await logActivity({
      businessId: business.id,
      action: "import.invoices_csv_completed",
      entityType: "import_batch",
      entityId: batchId,
      entityLabel: fileName || "Invoice CSV import",
      details: {
        importedCount,
        skippedCount,
        errorCount,
      },
    });

    setLastResult(
      `Imported ${importedCount} invoice${
        importedCount === 1 ? "" : "s"
      }. Skipped ${skippedCount}. Errors ${errorCount}.`
    );
  }

  async function handleImport() {
    setToast(null);
    setLastResult("");

    try {
      await assertCanWriteDuringMaintenance(businessSlug);
    } catch (error) {
      setToast({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Trimax is being updated. Try again in a few minutes.",
      });
      return;
    }

    if (!business) {
      setToast({
        type: "error",
        message: "Business is still loading.",
      });
      return;
    }

    if (previewRows.length === 0) {
      setToast({
        type: "error",
        message: "No importable rows found in this CSV.",
      });
      return;
    }

    setSaving(true);

    try {
      if (importType === "clients") {
        await importClients();
      } else {
        await importInvoices();
      }
    } catch (error) {
      console.error(error);
      setToast({
        type: "error",
        message:
          "Import failed. Make sure the import SQL has been run in Supabase.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      {toast ? (
        <Toast
          type={toast.type}
          message={toast.message}
        />
      ) : null}

      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
              Data Import
            </p>

            <h1 className="mt-3 text-5xl font-bold">
              FreshBooks CSV Import
            </h1>

            <p className="mt-3 max-w-3xl text-zinc-400">
              Bring FreshBooks clients and older invoices into Trimax using CSV
              exports. Preview first, then import only when the rows look right.
            </p>
          </div>

          <Link href={`/clients?business=${businessSlug}`}>
            <Button variant="secondary">Open Clients</Button>
          </Link>
        </div>

        <Card>
          <div className="grid gap-5">
            <div className="grid gap-4 md:grid-cols-[260px_1fr]">
              <div>
                <label className="app-form-label mb-2 block text-sm text-zinc-400">
                  Import Type
                </label>

                <select
                  value={importType}
                  onChange={(event) => {
                    setImportType(event.target.value as ImportType);
                    setLastResult("");
                  }}
                  className="app-form-input w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-orange-500"
                >
                  <option value="clients">Clients</option>
                  <option value="invoices">Invoices</option>
                </select>
              </div>

              <div>
                <label className="app-form-label mb-2 block text-sm text-zinc-400">
                  CSV File
                </label>

                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) =>
                    handleFileChange(event.target.files?.[0] ?? null)
                  }
                  className="app-file-input w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white file:mr-4 file:rounded-xl file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:font-semibold file:text-white"
                />
              </div>
            </div>

            <div className="import-guidance rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm leading-6 text-blue-100">
              {importType === "clients"
                ? "Client import looks for columns like Client Name, Customer, Email, Phone, Billing Address, Service Address, and Notes."
                : "FreshBooks invoice import groups line-item rows into invoices, preserves historical invoice numbers like INV-0404, imports tax labels/rates, and automatically creates apartment-paint split drafts when a matching invoice is over the threshold."}
            </div>

            {lastResult ? (
              <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-4 text-sm font-semibold text-green-100">
                {lastResult}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-zinc-400">
                {fileName
                  ? `${fileName}: ${previewRows.length} importable row${
                      previewRows.length === 1 ? "" : "s"
                    } found.`
                  : "Choose a CSV file to preview rows."}
              </p>

              <Button
                onClick={handleImport}
                disabled={saving || previewRows.length === 0}
              >
                {saving ? "Importing..." : "Import Previewed Rows"}
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <div className="import-readiness-panel rounded-3xl border border-white/10 bg-zinc-950/70 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-sky-300">
                  Import Readiness
                </p>
                <h2 className="mt-2 text-2xl font-bold">
                  {fileName
                    ? importType === "clients"
                      ? "Client rows ready to review"
                      : "Invoice rows ready to review"
                    : "Choose a CSV to preview"}
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                  {importType === "clients"
                    ? "Trimax checks for usable contact details before you import, so client records arrive clean enough for invoices, estimates, and reminders."
                    : "Apartment paint invoices over the split threshold will create draft split invoices automatically. Other imported invoices stay as original invoices."}
                </p>
              </div>

              {importType === "invoices" ? (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                  Split threshold:{" "}
                  <span className="font-bold">
                    {splitTargetAmount > 0
                      ? formatMoney(splitTargetAmount)
                      : "Not set"}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <div className="import-readiness-metric rounded-2xl border border-white/10 bg-black/30 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                  Rows
                </p>
                <p className="mt-2 text-3xl font-bold">{previewRows.length}</p>
              </div>

              {importType === "clients" ? (
                <>
                  <div className="import-readiness-metric rounded-2xl border border-white/10 bg-black/30 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                      Email Ready
                    </p>
                    <p className="mt-2 text-3xl font-bold">
                      {clientRowsWithEmail}
                    </p>
                  </div>
                  <div className="import-readiness-metric rounded-2xl border border-white/10 bg-black/30 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                      Phone Ready
                    </p>
                    <p className="mt-2 text-3xl font-bold">
                      {clientRowsWithPhone}
                    </p>
                  </div>
                  <div className="import-readiness-metric rounded-2xl border border-white/10 bg-black/30 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                      Address Ready
                    </p>
                    <p className="mt-2 text-3xl font-bold">
                      {clientRowsWithAddress}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="import-readiness-metric rounded-2xl border border-white/10 bg-black/30 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                      Open Invoices
                    </p>
                    <p className="mt-2 text-3xl font-bold">
                      {previewOpenInvoiceCount}
                    </p>
                  </div>
                  <div className="import-readiness-metric rounded-2xl border border-white/10 bg-black/30 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                      Import Total
                    </p>
                    <p className="mt-2 text-3xl font-bold">
                      {formatMoney(previewInvoiceTotal)}
                    </p>
                  </div>
                  <div className="import-readiness-metric rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">
                      Split Drafts
                    </p>
                    <p className="mt-2 text-3xl font-bold">
                      {previewSplitReadyCount}
                    </p>
                    <p className="mt-1 text-xs text-zinc-400">
                      {previewInvoiceLineCount} line item
                      {previewInvoiceLineCount === 1 ? "" : "s"} detected.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </Card>

        <Card className="import-decision-gate border-emerald-500/20 bg-zinc-950/70 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.26em] text-emerald-200">
                Import Decision Gate
              </p>
              <h2 className="mt-2 text-2xl font-black text-white">
                {importGateReady
                  ? "Preview looks ready for a controlled import"
                  : "Preview needs a little more confidence"}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
                Review the data quality signals before writing anything into
                Trimax. This keeps historical imports useful without creating
                cleanup work later.
              </p>
            </div>

            <Button
              onClick={handleImport}
              disabled={saving || previewRows.length === 0}
            >
              {saving ? "Importing..." : "Import Preview"}
            </Button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {importGateCards.map((card) => (
              <div
                key={card.label}
                data-tone={card.tone}
                className="import-decision-card rounded-2xl border border-white/10 bg-black/25 p-4"
              >
                <p className="text-xs font-black uppercase tracking-[0.2em] text-zinc-500">
                  {card.label}
                </p>
                <p className="mt-3 text-2xl font-black text-white">
                  {card.value}
                </p>
                <p className="mt-2 text-sm leading-5 text-zinc-400">
                  {card.detail}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="import-quality-panel border-orange-500/20 bg-zinc-950/70 p-4">
          <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
            <div className="import-quality-score rounded-2xl border border-white/10 bg-black/25 p-5">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-300">
                Import Quality
              </p>
              <div className="mt-4 flex items-end gap-3">
                <p className="text-5xl font-black text-white">
                  {importQualityScore}
                </p>
                <p className="pb-2 text-sm font-black uppercase tracking-[0.16em] text-zinc-500">
                  / 100
                </p>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                {previewRows.length === 0
                  ? "Upload a CSV and Trimax will score the file before anything is saved."
                  : importQualityScore >= 85
                    ? "This file is organized well enough for a confident import."
                    : "This file can still import, but the checklist shows what deserves a second look."}
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                    Ignored Rows
                  </p>
                  <p className="mt-2 text-2xl font-black text-white">
                    {ignoredRawRowCount}
                  </p>
                </div>
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-3">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-zinc-500">
                    Mode
                  </p>
                  <p className="mt-2 text-2xl font-black text-white">
                    {importType === "clients" ? "Clients" : "Invoices"}
                  </p>
                </div>
              </div>
            </div>

            <div className="import-checklist rounded-2xl border border-white/10 bg-black/25 p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-zinc-500">
                    Pre-Import Checklist
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-white">
                    Catch cleanup work before it lands
                  </h2>
                </div>
                <span
                  className={`import-quality-badge ${
                    importQualityScore >= 85
                      ? "import-quality-badge-ready"
                      : "import-quality-badge-review"
                  }`}
                >
                  {importQualityScore >= 85 ? "Ready" : "Review"}
                </span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {importChecklist.map((item) => (
                  <div
                    key={item.label}
                    className="import-checklist-item rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4"
                    data-complete={item.complete ? "true" : "false"}
                  >
                    <div className="flex items-start gap-3">
                      <span className="import-check-dot mt-1" />
                      <div>
                        <p className="text-sm font-black text-white">
                          {item.label}
                        </p>
                        <p className="mt-1 text-sm leading-5 text-zinc-400">
                          {item.detail}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-orange-400">
                Preview
              </p>
              <h2 className="mt-2 text-2xl font-bold">
                Rows Trimax Can Read
              </h2>
            </div>
          </div>

          {previewRows.length === 0 ? (
            <p className="app-empty-state rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
              No rows to preview yet.
            </p>
          ) : (
            <div className="app-data-table import-preview-table overflow-hidden rounded-2xl border border-zinc-800">
              <div className="app-data-table-head grid grid-cols-4 gap-4 bg-zinc-950 px-4 py-3 text-sm font-bold text-zinc-400">
                <span>Name</span>
                <span>Reference</span>
                <span>{importType === "clients" ? "Email" : "Total / Lines"}</span>
                <span>{importType === "clients" ? "Phone" : "Status / Tax"}</span>
              </div>

              {previewRows.slice(0, 25).map((row, index) => {
                if (importType === "clients") {
                  const client = row as ClientImportRow;
                  return (
                    <div
                      key={`${client.name}-${index}`}
                      className="app-data-table-row import-preview-row grid grid-cols-4 gap-4 border-t border-zinc-800 px-4 py-3 text-sm text-zinc-200"
                    >
                      <span>{client.name}</span>
                      <span>{client.contactName || "-"}</span>
                      <span>{client.email || "-"}</span>
                      <span>{client.phone || "-"}</span>
                    </div>
                  );
                }

                const invoice = row as InvoiceImportRow;
                const invoiceDisplayId =
                  getFreshBooksInvoiceDisplayId(invoice.freshBooksNumber) ||
                  invoice.reference;
                const splitReady =
                  splitTargetAmount > 0 &&
                  invoice.amount - invoice.amountPaid > splitTargetAmount &&
                  looksLikeApartmentUnitPaintJob(
                    invoice.customerName,
                    invoice.projectTitle,
                    invoice.lineItems
                  );
                const invoicePaid = invoice.amount <= invoice.amountPaid;
                return (
                  <div
                    key={`${invoice.customerName}-${index}`}
                    className="app-data-table-row import-preview-row grid grid-cols-4 gap-4 border-t border-zinc-800 px-4 py-3 text-sm text-zinc-200"
                  >
                    <span>{invoice.customerName}</span>
                    <span className="space-y-1">
                      <span className="block font-semibold">
                        {invoiceDisplayId}
                      </span>
                      <span
                        className={`import-status-pill ${
                          splitReady
                            ? "import-status-pill-split"
                            : invoicePaid
                              ? "import-status-pill-paid"
                              : "import-status-pill-open"
                        }`}
                      >
                        {splitReady
                          ? "Split drafts ready"
                          : invoicePaid
                            ? "Paid"
                            : "Open"}
                      </span>
                    </span>
                    <span>
                      {formatMoney(invoice.amount)} / {invoice.lineItems.length}{" "}
                      line{invoice.lineItems.length === 1 ? "" : "s"}
                    </span>
                    <span>
                      {invoice.status}
                      {invoice.taxLabel
                        ? ` / ${invoice.taxLabel} ${invoice.taxRate}%`
                        : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

export default function ImportsPage() {
  return (
    <Suspense>
      <ImportsPageContent />
    </Suspense>
  );
}
