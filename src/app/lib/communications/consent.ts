export const SMS_DISCLOSURE_VERSION = 'transactional-sms-2026-10-25';
export const SMS_DISCLOSURE = 'I agree to receive service-related texts from this business about my request, appointments, estimates, invoices and payments. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is optional and is not a condition of purchase.';
export function normalizeSmsPhone(value: string): string | null {
  const digits = value.replace(/[ ().-]/g, '');
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits;
  if (/^\d{10}$/.test(digits)) return `+1${digits}`;
  if (/^1\d{10}$/.test(digits)) return `+${digits}`;
  return null;
}
