'use client';
import {useEffect,useRef,useState} from 'react';
type Turnstile={render:(node:HTMLElement,options:Record<string,unknown>)=>string;remove:(id:string)=>void};
declare global {interface Window {turnstile?:Turnstile}}
export default function TurnstileChallenge({siteKey,onToken}:{siteKey:string;onToken:(token:string)=>void}){
 const container=useRef<HTMLDivElement>(null),callback=useRef(onToken);
 const [failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{callback.current=onToken;},[onToken]);
 useEffect(()=>{
  let cancelled=false,widget:string|undefined,script:HTMLScriptElement|undefined;
  const fail=()=>{if(!cancelled){callback.current('');setFailed(true);}};
  const mount=()=>{if(cancelled||!container.current||!window.turnstile)return;clearTimeout(timer);widget=window.turnstile.render(container.current,{sitekey:siteKey,action:'public-scheduling',callback:(token:string)=>{if(!cancelled){setFailed(false);callback.current(token);}},'expired-callback':fail,'error-callback':fail});};
  const timer=setTimeout(fail,10000);
  if(window.turnstile)mount();else{script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.onload=mount;script.onerror=fail;document.head.appendChild(script);}
  return ()=>{cancelled=true;clearTimeout(timer);script?.remove();if(widget)window.turnstile?.remove(widget);callback.current('');};
 },[siteKey,retry]);
 return <div><div ref={container}/>{failed&&<p role="alert">Security check unavailable or expired. <button type="button" onClick={()=>{setFailed(false);setRetry(n=>n+1);}}>Retry security check</button></p>}</div>;
}
