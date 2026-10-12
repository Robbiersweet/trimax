import 'server-only';
import {getPublicBusiness} from '../.shared/lib/publicScheduling/domain';
import {productionConfig,productionBusiness,restrictedRpc} from '../.shared/lib/publicScheduling/productionRuntime';
import type {PublicPageBusiness} from '../.shared/book/RequestForm';
export const isPreview=()=>process.env.VERCEL_ENV!=='production';
export async function publicScheduling(){
  // Preview never reads production configuration, even if credentials are accidentally present.
  const preview=isPreview();
  let business=preview?getPublicBusiness('rnl-creations'):null;
  let siteKey:string|undefined;
  if(!preview){try{const config=productionConfig();business=await productionBusiness('rnl-creations',restrictedRpc(config));siteKey=config.siteKey;}catch{/* Fail closed; no development fallback in production. */}}
  if(!business)return null;
  const publicBusiness:PublicPageBusiness={slug:business.slug,displayName:business.displayName,rules:business.rules,requestTypes:business.requestTypes.map(({id,publicLabel,active,displayOrder})=>({id,publicLabel,active,displayOrder}))};
  return {business:publicBusiness,preview,siteKey};
}
