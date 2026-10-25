import {isolatedLabConfig} from './isolatedLabBoundary';
export function previewNotice(env:Record<string,string|undefined>=process.env){
 if(env.VERCEL_ENV==='production')return null;
 try{isolatedLabConfig(env);return {title:'ISOLATED ACCEPTANCE LAB',message:'Approved synthetic requests only. Test records are enabled; real customer messages are disabled.'};}catch{return {title:'WEBSITE PREVIEW',message:'Explore the design. Service request submissions are disabled.'};}
}
