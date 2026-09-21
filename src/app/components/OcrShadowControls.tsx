'use client';
import { useEffect,useState } from 'react';
import { supabase } from '../lib/supabase';
import { loadShadowFlags } from '../lib/ocrV2/shadow/client';
import { DISABLED_SHADOW } from '../lib/ocrV2/shadow/contract';
export default function OcrShadowControls({businessId}:{businessId:string}) {
  const [flags,setFlags]=useState(DISABLED_SHADOW),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{let current=true;void loadShadowFlags(businessId).then(value=>{if(current)setFlags(value);});return()=>{current=false;};},[businessId]);
  async function save(enabled:boolean,nativeStill:boolean){setBusy(true);const {error}=await supabase.rpc('trimax_set_ocr_shadow',{p_business:businessId,p_enabled:enabled,p_native:nativeStill});if(error)setMessage(error.message);else{setFlags({enabled,nativeStill});setMessage(enabled?'Shadow queue enabled. A configured worker must be online.':'Shadow processing disabled. Legacy remains authoritative.');}setBusy(false);}
  return <details className="rounded border border-white/15 p-3"><summary>Owner/admin shadow comparison: {flags.enabled?'enabled':'disabled'}</summary><div className="mt-3 space-y-2 text-sm">
    <p>V2 results are diagnostic only. Refresh Payments after changing capture mode.</p>
    <label className="block"><input type="checkbox" checked={flags.enabled} disabled={busy} onChange={e=>void save(e.target.checked,flags.nativeStill)}/> Enable shadow queue</label>
    <label className="block"><input type="checkbox" checked={flags.nativeStill} disabled={busy} onChange={e=>void save(flags.enabled,e.target.checked)}/> Use native still capture for owner/admin shadow scans</label>
    {message&&<p role="status">{message}</p>}
  </div></details>;
}
