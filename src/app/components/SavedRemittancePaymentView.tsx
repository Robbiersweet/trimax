"use client";
import {useEffect, useState} from 'react';
import Image from 'next/image';
import {moneyFixed} from '../lib/money';
import {scanOptical} from '../lib/ocrHistoryClient';
import {remittanceDeadline} from '../lib/remittanceDeadline';
import {savedRemittancePayment, type SavedRemittanceLookup} from '../lib/savedRemittancePaymentClient';

export function SavedRemittancePaymentView({history}: {history: SavedRemittanceLookup}) {
  const [image, setImage] = useState(''), [imageError, setImageError] = useState('');
  useEffect(() => {
    let current = true;
    if (history.status !== 'applied') return;
    void remittanceDeadline(scanOptical(history.canonicalReference), 15000, 'Original image lookup timed out.').then(optical => {
      const original = optical?.images?.find((item: {sha256?: string; base64?: string}) => item.sha256 === history.sourceImageHash && item.base64);
      if (!original) throw Error('Original remittance image is unavailable or expired. Payment history remains retained.');
      if (current) setImage('data:' + original.mime + ';base64,' + original.base64);
    }).catch(error => {if (current) setImageError(error instanceof Error ? error.message : 'Original image unavailable.');});
    return () => {current = false;};
  }, [history]);
  if (history.status === 'none') return null;
  const payment = history.payment;
  return <section role="status" aria-label="Saved remittance payment history" className="my-4 rounded-xl border border-emerald-400 bg-slate-950 p-4 text-white">
    <h3 className="text-xl font-bold">{history.status === 'applied' ? 'Payment already applied' : history.status === 'reversed' ? 'Previous payment reversed' : 'Payment history needs review'}</h3>
    <p>{history.status === 'applied' ? 'This remittance has already been processed. No action is required.' : history.status === 'reversed' ? 'The prior application was reversed. Review the remittance and current eligibility before any new payment.' : 'Historical payment records are incomplete or conflicting. New application is blocked until the history is reviewed.'}</p>
    {payment && <>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <dt>Check number</dt><dd>{payment.checkNumber}</dd><dt>Check date</dt><dd>{payment.checkDate}</dd>
        <dt>Original check amount</dt><dd>${moneyFixed(payment.amount)}</dd><dt>Payor</dt><dd>{payment.payor}</dd>
        <dt>Applied at</dt><dd>{payment.appliedAt ? new Date(payment.appliedAt).toLocaleString() : 'Retained in audit history'}</dd>
        <dt>Received date</dt><dd>{payment.receivedDate}</dd>
      </dl>
      <table className="mt-3 w-full text-left text-sm"><thead><tr><th>Invoice paid</th><th>Amount applied</th></tr></thead>
        <tbody>{payment.allocations.map(row => <tr key={row.invoiceId}><td>{row.invoiceNumber || row.invoiceId}</td><td>${moneyFixed(row.amount)}</td></tr>)}</tbody></table>
      <details className="mt-3 text-xs"><summary>Payment audit references</summary>{payment.activityLogIds.map(id => <p className="break-all" key={id}>{id}</p>)}</details>
    </>}
    {history.reasons.map(reason => <p key={reason}>{reason}</p>)}
    {image && <figure className="mt-3"><Image src={image} unoptimized width={1200} height={800} alt="Original applied remittance" className="max-h-96 w-full object-contain"/><figcaption>Original remittance image</figcaption></figure>}
    {imageError && <p className="mt-3 text-sm">{imageError}</p>}
  </section>;
}

/** History banner for forensic attempt pages; it never starts OCR or a payment. */
export default function SavedRemittancePaymentStatus({businessId, attemptId}: {businessId: string; attemptId: string}) {
  const [state, setState] = useState<{id: string; history?: SavedRemittanceLookup; error?: string} | null>(null);
  useEffect(() => {
    let current = true;
    void savedRemittancePayment(businessId, attemptId).then(history => {if (current) setState({id: attemptId, history});})
      .catch(() => {if (current) setState({id: attemptId, error: 'Payment history could not be verified. These are retained OCR diagnostics, not approval to apply a payment.'});});
    return () => {current = false;};
  }, [businessId, attemptId]);
  if (state?.id !== attemptId) return <p role="status">Checking payment history…</p>;
  if (state.error) return <p role="alert">{state.error}</p>;
  return state.history ? <SavedRemittancePaymentView key={attemptId} history={state.history}/> : null;
}
