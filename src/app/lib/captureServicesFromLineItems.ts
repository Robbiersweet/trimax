"use client";

import { supabase } from "./supabase";

type CapturableLineItem = {
  serviceItemId?: string;
  description: string;
  quantity: string | number;
  unitPrice: string | number;
};

type ExistingService = {
  name: string;
  description: string | null;
};

function normalizeServiceText(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function serviceNameFromDescription(description: string) {
  const firstLine =
    description
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? description.trim();

  return firstLine.length > 90
    ? `${firstLine.slice(0, 87).trim()}...`
    : firstLine;
}

export async function captureServicesFromLineItems({
  businessId,
  lineItems,
}: {
  businessId: string | null | undefined;
  lineItems: CapturableLineItem[];
}) {
  if (!businessId) {
    return { createdCount: 0 };
  }

  const serviceCandidates = lineItems
    .map((item) => ({
      description: item.description.trim(),
      quantity: Number(item.quantity) || 1,
      unitPrice: Number(item.unitPrice) || 0,
    }))
    .filter((item) => item.description.length > 0);

  if (serviceCandidates.length === 0) {
    return { createdCount: 0 };
  }

  const { data: existingServices, error: loadError } =
    await supabase
      .from("service_items")
      .select("name, description")
      .eq("business_id", businessId);

  if (loadError) {
    console.error(loadError);
    return { createdCount: 0, error: loadError };
  }

  const existingKeys = new Set(
    ((existingServices ?? []) as ExistingService[]).flatMap(
      (service) => [
        normalizeServiceText(service.name),
        normalizeServiceText(service.description),
      ]
    )
  );

  const newServices: Array<{
    business_id: string;
    name: string;
    description: string;
    default_quantity: number;
    default_unit_price: number;
    category: string;
    is_active: boolean;
  }> = [];

  serviceCandidates.forEach((item) => {
    const normalizedDescription = normalizeServiceText(
      item.description
    );

    if (!normalizedDescription || existingKeys.has(normalizedDescription)) {
      return;
    }

    const name = serviceNameFromDescription(item.description);
    const normalizedName = normalizeServiceText(name);

    if (existingKeys.has(normalizedName)) {
      return;
    }

    existingKeys.add(normalizedDescription);
    existingKeys.add(normalizedName);

    newServices.push({
      business_id: businessId,
      name,
      description: item.description,
      default_quantity: item.quantity,
      default_unit_price: item.unitPrice,
      category: "Auto Captured",
      is_active: true,
    });
  });

  if (newServices.length === 0) {
    return { createdCount: 0 };
  }

  const { error: insertError } = await supabase
    .from("service_items")
    .insert(newServices);

  if (insertError) {
    console.error(insertError);
    return { createdCount: 0, error: insertError };
  }

  return { createdCount: newServices.length };
}
