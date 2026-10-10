import type { fuseOrganizationIdentity } from './organizationIdentity.ts';
type Identity = ReturnType<typeof fuseOrganizationIdentity>;
const key = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[\s.,]+/g, '');
/** A stem and its already-corroborated printed descriptor are the same evidence,
 * not two competing organizations. Never complete a name or use business aliases. */
export function selectObservedIdentity(identity: Identity, pageValue: string | null): string | null {
  if (identity.authority !== 'authoritative' || !identity.value) return pageValue;
  if (!pageValue || key(pageValue) === key(identity.value)) return identity.value;
  const candidate = identity.candidates.find(c => c.stem === identity.value);
  if (candidate && key(pageValue) === key(candidate.observedText)) return identity.value;
  return null;
}
