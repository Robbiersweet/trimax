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
    email: field(row, ["Email", "Email Address", "Client Email"]),
    phone: field(row, ["Phone", "Phone Number", "Mobile"]),
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

function isDuplicateClient(existingClients: Client[], row: ClientImportRow) {
  const rowName = row.name.trim().toLowerCase();
  const rowEmail = row.email.trim().toLowerCase();

  return existingClients.some((client) => {
    const clientName = client.name.trim().toLowerCase();
    const clientEmail = (client.email ?? "").trim().toLowerCase();

    return (
      (rowName && clientName === rowName) ||
      (rowEmail && clientEmail === rowEmail)
    );
  });
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
      .select("id, name, email")
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
      if (isDuplicateClient(existingClients, row)) {
        skippedCount += 1;
        importRows.push({
          business_id: business.id,
          row_number: index + 1,
          import_type: "clients",
          raw_data: rawRows[index] ?? {},
          mapped_data: row,
          status: "skipped",
          target_table: "clients",
          error_message: "Skipped possible duplicate client.",
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
        .select("id, name, email")
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
      .select("id, name, email")
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
      .select("id, name, email")
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

            <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm leading-6 text-blue-100">
              {importType === "clients"
                ? "Client import looks for columns like Client Name, Customer, Email, Phone, Billing Address, Service Address, and Notes."
                : "FreshBooks invoice import groups CSV line-item rows into invoices, preserves historical invoice numbers like INV-0404, imports tax labels/rates, and creates the matching Trimax line items."}
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
            <div className="app-data-table overflow-hidden rounded-2xl border border-zinc-800">
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
                      className="app-data-table-row grid grid-cols-4 gap-4 border-t border-zinc-800 px-4 py-3 text-sm text-zinc-200"
                    >
                      <span>{client.name}</span>
                      <span>{client.contactName || "-"}</span>
                      <span>{client.email || "-"}</span>
                      <span>{client.phone || "-"}</span>
                    </div>
                  );
                }

                const invoice = row as InvoiceImportRow;
                return (
                  <div
                    key={`${invoice.customerName}-${index}`}
                    className="app-data-table-row grid grid-cols-4 gap-4 border-t border-zinc-800 px-4 py-3 text-sm text-zinc-200"
                  >
                    <span>{invoice.customerName}</span>
                    <span>
                      {getFreshBooksInvoiceDisplayId(invoice.freshBooksNumber) ||
                        invoice.reference}
                    </span>
                    <span>
                      ${invoice.amount.toFixed(2)} / {invoice.lineItems.length}{" "}
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
