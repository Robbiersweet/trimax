"use client";
import {useState} from 'react';
import {supabase} from '../../../qr-shared/lib/supabase';
export default function LabLogin(){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 return <section className="wrap" style={{maxWidth:560,padding:'3rem 1rem'}}><h1>TriMax laboratory sign in</h1><p>Synthetic accounts only. This isolated preview does not access production.</p><form onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setError('');try{const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw Error('Sign in failed.');const next=new URLSearchParams(window.location.search).get('next');window.location.assign(next&&/^\/(maintenance-labels|property-requests)(\?|$)/.test(next)?next:'/maintenance-labels?business=88888888-8888-4888-8888-000000000101');}catch{setError('Sign in failed.');setBusy(false);}}}>
 <label>Email<input type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} style={{display:'block',width:'100%',padding:12,marginBottom:16}}/></label>
 <label>Password<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} style={{display:'block',width:'100%',padding:12,marginBottom:16}}/></label>
 <button className="button" disabled={busy}>{busy?'Signing in…':'Sign in'}</button>{error&&<p role="alert">{error}</p>}</form></section>;
}
