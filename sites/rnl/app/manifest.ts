import type {MetadataRoute} from 'next';
// Marketing bookmark only: separate identity/scope from the installed TriMax app.
export default function manifest():MetadataRoute.Manifest{return {
  id:'/',name:'R&L Creations',short_name:'R&L Creations',description:'General contracting and property care from R&L Creations.',
  start_url:'/',scope:'/',display:'browser',background_color:'#000000',theme_color:'#171916',
  icons:[{src:'/brand/rnl-mark-192-v1.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'/brand/rnl-mark-512-v1.png',sizes:'512x512',type:'image/png',purpose:'any'},{src:'/brand/rnl-maskable-512-v1.png',sizes:'512x512',type:'image/png',purpose:'maskable'}]
};}
