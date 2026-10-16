import 'server-only';
import {getPublicBusiness} from '../.shared/lib/publicScheduling/domain.ts';
import {productionBusiness} from '../.shared/lib/publicScheduling/productionRuntime.ts';
import type {PublicPageBusiness} from '../.shared/book/RequestForm';
import {websiteSubmissionRuntime} from './submissionRuntime.ts';
export const isPreview=()=>process.env.VERCEL_ENV!=='production';
export async function publicScheduling(){
  // Preview never reads production configuration, even if credentials are accidentally present.
  const preview=isPreview();
  if(!preview&&process.env.PUBLIC_SCHEDULING_PRODUCTION_ENABLED!=='enabled')return null;
  let business=preview?getPublicBusiness('rnl-creations'):null;
  let siteKey:string|undefined;
  if(!preview){try{const runtime=websiteSubmissionRuntime();business=await productionBusiness('rnl-creations',runtime.client);siteKey=process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;}catch{/* Fail closed; no development fallback in production. */}}
  if(!business)return null;
  const publicBusiness:PublicPageBusiness={slug:business.slug,displayName:business.displayName,rules:business.rules,requestTypes:business.requestTypes.map(({id,publicLabel,active,displayOrder})=>({id,publicLabel,active,displayOrder}))};
  return {business:publicBusiness,preview,siteKey};
}

