import {requestPhotosEnabled} from './photoBoundary.ts';
import {smsConsentCollectionEnabled} from './smsConsentBoundary.ts';
import 'server-only';
import {getPublicBusiness} from '../.shared/lib/publicScheduling/domain.ts';
import {productionBusiness} from '../.shared/lib/publicScheduling/productionRuntime.ts';
import type {PublicPageBusiness} from '../.shared/book/RequestForm';
import {websiteSubmissionRuntime} from './submissionRuntime.ts';
import {isolatedLabConfig} from './isolatedLabBoundary.ts';
import {isolatedLabRuntime} from './isolatedLabRuntime.ts';
export const isPreview=()=>process.env.VERCEL_ENV!=='production';
export async function publicScheduling(){
  if(process.env.VERCEL_ENV==='preview'&&process.env.RNL_ISOLATED_INTAKE_ENABLED==='enabled'){
    try{const lab=isolatedLabConfig();const business=await productionBusiness(lab.slug,isolatedLabRuntime().client);if(!business)return null;
      return {business:{slug:business.slug,displayName:business.displayName,rules:business.rules,requestTypes:business.requestTypes.map(({id,publicLabel,active,displayOrder})=>({id,publicLabel,active,displayOrder}))},preview:false,isolatedLab:true,siteKey:undefined,smsConsentEnabled:true,photosEnabled:false};
    }catch{return null;}
  }
  // Preview never reads production configuration, even if credentials are accidentally present.
  const preview=isPreview();
  if(!preview&&process.env.PUBLIC_SCHEDULING_PRODUCTION_ENABLED!=='enabled')return null;
  let business=preview?getPublicBusiness('rnl-creations'):null;
  let siteKey:string|undefined;
  if(!preview){try{const runtime=websiteSubmissionRuntime();business=await productionBusiness('rnl-creations',runtime.client);siteKey=process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;}catch{/* Fail closed; no development fallback in production. */}}
  if(!business)return null;
  const publicBusiness:PublicPageBusiness={slug:business.slug,displayName:business.displayName,rules:business.rules,requestTypes:business.requestTypes.map(({id,publicLabel,active,displayOrder})=>({id,publicLabel,active,displayOrder}))};
  return {business:publicBusiness,preview,isolatedLab:false,siteKey,smsConsentEnabled:preview||smsConsentCollectionEnabled(),photosEnabled:requestPhotosEnabled()};
}

