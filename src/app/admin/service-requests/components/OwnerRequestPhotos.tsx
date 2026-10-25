"use client";
import {useEffect,useState} from 'react';
import {supabase} from '../../../lib/supabase';
export default function OwnerRequestPhotos({requestId,business}:{requestId:string;business:string}){
 const [photos,setPhotos]=useState<{id:string;url:string}[]>([]),[message,setMessage]=useState('Loading photos…'),[revision,setRevision]=useState(0);
 useEffect(()=>{let active=true;void(async()=>{try{const {data:{session}}=await supabase.auth.getSession();if(!session)throw Error('Denied');const response=await fetch(`/api/request-photos?business=${encodeURIComponent(business)}&request=${encodeURIComponent(requestId)}`,{headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store'});if(!response.ok)throw Error('Denied');const result=await response.json();if(active){setPhotos(result.photos);setMessage(result.photos.length?'Photo links expire after one minute. Refresh to reopen.':'No photos attached.');}}catch{if(active)setMessage('Photos unavailable.');}})();return()=>{active=false;};},[requestId,business,revision]);
 return <section aria-label="Customer photos"><h3>Customer photos</h3><p role="status">{message}</p><button onClick={()=>{setPhotos([]);setMessage('Loading photos…');setRevision(x=>x+1);}}>Refresh photos</button><ul>{photos.map((p,i)=><li key={p.id}><a href={p.url} target="_blank" rel="noopener noreferrer">Open request photo {i+1}</a></li>)}</ul></section>;
}
