'use client';
import { useState } from 'react';
import { supabase } from '../lib/supabase';
/** Deliberately not prefilled from either engine's predictions. */
export default function OcrShadowTruth({legacyId,sourceHash}:{legacyId:string;sourceHash:string}) {
  const [text,setText]=useState(''),[verified,setVerified]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  async function save(){setBusy(true);try{const truth=JSON.parse(text);const {error}=await supabase.rpc('trimax_verify_shadow_truth',{p_legacy:legacyId,p_truth:{...truth,sourceImageHash:sourceHash,businessTruthVerified:verified,freshUnseenConfirmed:verified}});if(error)throw Error(error.message);setMessage('Verified truth saved separately from frozen inference. No training intake or payment change occurred.');}catch(error){setMessage(error instanceof Error?error.message:'Could not save verification');}finally{setBusy(false);}}
  return <details className="rounded border border-white/15 p-3 text-sm"><summary>Fresh-document verification (after business review)</summary>
    <p className="my-2">Record independently verified truth only. Historical development documents do not count. Repeated captures use the same independentDocumentId. Neither engine reads this record.</p>
    <pre className="overflow-auto text-xs">{'{ "independentDocumentId": "", "rows": [{ "invoiceRecordId": "", "invoiceNumber": "", "unit": "", "amountCents": 0 }], "totalCents": 0, "checkNumber": null, "checkDate": null, "customerPayor": "", "finalPaymentResult": "" }'}</pre>
    <textarea aria-label="Verified business truth JSON" className="mt-2 w-full rounded bg-slate-900 p-2" rows={7} value={text} onChange={e=>setText(e.target.value)}/>
    <label className="block"><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)}/> I verified this against the document and business records; it is fresh and was not used for development.</label>
    <button className="mt-2 rounded border px-3 py-2" disabled={!verified||busy} onClick={()=>void save()}>Freeze verified truth</button>
    {message&&<p role="status">{message}</p>}
  </details>;
}
