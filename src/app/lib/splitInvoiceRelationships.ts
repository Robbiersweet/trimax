export type SplitRelationshipInvoice = {
  id: string | null;
  display_id: string | null;
  status: string | null;
  split_sequence: number | null;
  split_count: number | null;
};

export type SplitRelationshipItem = {
  id: string;
  displayId: string;
  status: string;
  splitLabel: string;
};

export function splitLabelFor(invoice: SplitRelationshipInvoice) {
  return invoice.split_sequence && invoice.split_count
    ? `Split ${invoice.split_sequence} of ${invoice.split_count}`
    : "Split invoice";
}

export function buildSplitSourceRelationshipItems(
  children: SplitRelationshipInvoice[]
) {
  return children
    .filter((invoice) => Boolean(invoice.id))
    .map((invoice) => ({
      id: invoice.id!,
      displayId: invoice.display_id || "Invoice",
      status: invoice.status || "Draft",
      splitLabel: splitLabelFor(invoice),
    }));
}

export function buildSplitChildSourceRelationship(
  parent: SplitRelationshipInvoice | null
) {
  if (!parent?.id) {
    return null;
  }

  return {
    id: parent.id,
    displayId: parent.display_id || "Invoice",
    status: parent.status || "Draft",
    splitLabel: splitLabelFor(parent),
  };
}
