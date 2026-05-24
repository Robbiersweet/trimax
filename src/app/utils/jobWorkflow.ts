export type SplitWarningLineItem = {
  description: string;
};

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function compactText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function looksLikeApartmentUnitPaintJob(
  customerName: string,
  projectTitle: string,
  lineItems: SplitWarningLineItem[]
) {
  const normalizedCustomerName = compactText(customerName);
  const workText = normalizeText(
    [projectTitle, ...lineItems.map((item) => item.description)].join(" ")
  );

  const isNorthCreek = normalizedCustomerName.includes("northcreek");
  const mentionsPaint =
    workText.includes("paint") ||
    workText.includes("repaint") ||
    workText.includes("touch up") ||
    workText.includes("touch-up") ||
    workText.includes("classic");
  const mentionsApartmentUnitWork =
    workText.includes("unit") ||
    workText.includes("turn") ||
    workText.includes("apartment") ||
    workText.includes("apt") ||
    workText.includes("classic") ||
    workText.includes("touch up") ||
    workText.includes("touch-up");
  const looksLikeGeneralProject =
    workText.includes("fence") ||
    workText.includes("tree") ||
    workText.includes("deck") ||
    workText.includes("roof") ||
    workText.includes("siding") ||
    workText.includes("gutter") ||
    workText.includes("concrete") ||
    workText.includes("demo") ||
    workText.includes("remodel");

  return (
    isNorthCreek &&
    mentionsPaint &&
    mentionsApartmentUnitWork &&
    !looksLikeGeneralProject
  );
}
