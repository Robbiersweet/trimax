type CapturableLineItem = {
  serviceItemId?: string;
  description: string;
  quantity: string | number;
  unitPrice: string | number;
};

export async function captureServicesFromLineItems({
  businessId,
  lineItems,
}: {
  businessId: string | null | undefined;
  lineItems: CapturableLineItem[];
}) {
  void businessId;
  void lineItems;

  return {
    createdCount: 0,
    skippedReason:
      "Automatic line-item capture is disabled. Use an explicit Save as Service flow for reusable templates.",
  };
}
