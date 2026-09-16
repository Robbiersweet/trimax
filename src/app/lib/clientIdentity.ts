export type ClientIdentityRecord = {
  id: string;
  name: string | null;
  property_aliases?: string[] | null;
  email?: string | null;
  cc_email?: string | null;
};

export type ClientIdentityConflict = {
  hasConflict: boolean;
  message: string | null;
  matchedClientId: string | null;
  matchedClientName: string | null;
};

export function normalizeClientIdentityText(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\b(apartments|apartment|apts|apt|property|properties)\b/g, "")
    .replace(/\b(the)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function identityTokens(value: string) {
  return value.split(" ").filter(Boolean);
}

function containsWholeIdentity(haystack: string, needle: string) {
  if (!haystack || !needle) {
    return false;
  }

  const haystackTokens = identityTokens(haystack);
  const needleTokens = identityTokens(needle);

  if (
    needleTokens.length === 0 ||
    needleTokens.length > haystackTokens.length
  ) {
    return false;
  }

  return haystackTokens.some((_token, startIndex) => {
    return needleTokens.every(
      (needleToken, offset) =>
        haystackTokens[startIndex + offset] === needleToken,
    );
  });
}

export function findExactClientForProperty<T extends ClientIdentityRecord>(
  clients: T[],
  propertyName: string | null | undefined,
) {
  const normalizedProperty = normalizeClientIdentityText(propertyName);

  if (!normalizedProperty) {
    return null;
  }

  const exactMatches = clients.filter((client) =>
    [client.name, ...(client.property_aliases ?? [])].some(
      (name) => normalizeClientIdentityText(name) === normalizedProperty,
    ),
  );

  return exactMatches.length === 1 ? exactMatches[0] : null;
}

export function detectClientIdentityConflict({
  clients,
  currentClientId,
  customerName,
  projectTitle,
}: {
  clients: ClientIdentityRecord[];
  currentClientId: string | null | undefined;
  customerName: string | null | undefined;
  projectTitle: string | null | undefined;
}): ClientIdentityConflict {
  const normalizedProject = normalizeClientIdentityText(projectTitle);
  const normalizedCustomer = normalizeClientIdentityText(customerName);

  const selected = clients.find((client) => client.id === currentClientId);
  if (
    !selected ||
    (normalizedCustomer &&
      ![selected.name, ...(selected.property_aliases ?? [])].some(
        (name) => normalizeClientIdentityText(name) === normalizedCustomer,
      ))
  ) {
    return {
      hasConflict: true,
      message: "Customer and property do not match. Review before continuing.",
      matchedClientId: selected?.id ?? null,
      matchedClientName: selected?.name ?? null,
    };
  }

  if (!normalizedProject) {
    return {
      hasConflict: false,
      message: null,
      matchedClientId: null,
      matchedClientName: null,
    };
  }

  const projectClientMatches = clients
    .flatMap((client) =>
      [client.name, ...(client.property_aliases ?? [])].map((name) => ({
        client,
        normalizedName: normalizeClientIdentityText(name),
      })),
    )
    .filter(({ normalizedName }) => {
      const tokens = identityTokens(normalizedName);

      return (
        normalizedName.length >= 8 &&
        tokens.length >= 2 &&
        containsWholeIdentity(normalizedProject, normalizedName)
      );
    })
    .sort(
      (first, second) =>
        second.normalizedName.length - first.normalizedName.length ||
        second.normalizedName.split(" ").length -
          first.normalizedName.split(" ").length,
    );

  const bestProjectClient = projectClientMatches[0]?.client ?? null;
  const bestLength = projectClientMatches[0]?.normalizedName.length;
  if (
    new Set(
      projectClientMatches
        .filter((match) => match.normalizedName.length === bestLength)
        .map((match) => match.client.id),
    ).size > 1
  ) {
    return {
      hasConflict: true,
      message: "Customer and property do not match. Review before continuing.",
      matchedClientId: null,
      matchedClientName: null,
    };
  }

  if (!bestProjectClient || bestProjectClient.id === currentClientId) {
    return {
      hasConflict: false,
      message: null,
      matchedClientId: bestProjectClient?.id ?? null,
      matchedClientName: bestProjectClient?.name ?? null,
    };
  }

  const currentClient = clients.find((client) => client.id === currentClientId);
  const normalizedCurrentClient = normalizeClientIdentityText(
    currentClient?.name,
  );

  if (
    normalizedCurrentClient &&
    normalizedCustomer &&
    normalizedCurrentClient !== normalizedCustomer
  ) {
    return {
      hasConflict: true,
      message: "Customer and property do not match. Review before continuing.",
      matchedClientId: bestProjectClient.id,
      matchedClientName: bestProjectClient.name,
    };
  }

  return {
    hasConflict: true,
    message: "Customer and property do not match. Review before continuing.",
    matchedClientId: bestProjectClient.id,
    matchedClientName: bestProjectClient.name,
  };
}
