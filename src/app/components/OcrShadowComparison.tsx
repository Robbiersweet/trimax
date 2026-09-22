'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { pairedScanSummary } from '../lib/ocrHistoryClient';
import { attemptPath } from '../lib/ocrDebug';
import type { ScanSummary } from '../lib/ocrHistory';
export default function OcrShadowComparison({summary,businessSlug}:{summary:ScanSummary;businessSlug:string}) {
  const [other,setOther] = useState<ScanSummary|null>(null);
  const otherId = summary.ocrEngine === 'v2-shadow' ? summary.legacyAttemptId : summary.shadowAttemptId;
  useEffect(() => {
    let current=true;
    if(otherId)void pairedScanSummary(otherId).then(data => {if(current)setOther(data);}).catch(()=>{});
    return () => {current=false;};
  },[otherId]);
  if(!otherId)return null;
  const legacy=summary.ocrEngine==='v2-shadow'?other:summary,shadow=summary.ocrEngine==='v2-shadow'?summary:other;
  return <div className="space-y-2 rounded border border-white/15 p-3 text-sm">
    <h3 className="font-semibold">Legacy / OCR v2 shadow</h3>
    <p>Comparison only · legacy controls payment review</p>
    <table className="w-full text-left"><thead><tr><th>Evidence</th><th>Legacy</th><th>v2 shadow</th></tr></thead><tbody>
      {(['rowsDetected','invoicesResolved','documentTotal','durationMs'] as const).map(key=><tr key={key}><th>{({rowsDetected:'Rows',invoicesResolved:'Resolved invoices',documentTotal:'Total',durationMs:'OCR time (ms)'})[key]}</th><td>{legacy?.[key]??'Unknown'}</td><td>{shadow?.[key]??'Pending'}</td></tr>)}
      <tr><th>Result</th><td>{legacy?.result??'Unknown'}</td><td>{shadow?.result??'Pending'}</td></tr>
      <tr><th>Identity</th><td>{legacy?.identity??'See legacy details'}</td><td>{shadow?.identity??'Unknown'}</td></tr>
      <tr><th>OCR amount rows</th><td>{legacy?.amountRows??'See legacy details'}</td><td>{shadow?.amountRows??'Pending'}</td></tr>
      <tr><th>Reconciliation</th><td>{legacy?.reconciled?'Exact / eligible':'Review'}</td><td>{shadow?.reconciled?'Exact / diagnostic only':'Review'}</td></tr>
    </tbody></table>
    <p className="break-all text-xs">Shared source SHA-256: {summary.sourceImageHash??'Unavailable'}</p>
    <Link className="underline" href={attemptPath(otherId,businessSlug)}>Open {summary.ocrEngine==='v2-shadow'?'legacy':'shadow'} details</Link>
  </div>;
}
