import type {MetadataRoute} from 'next';
import {site} from '../lib/content';
export default function robots():MetadataRoute.Robots{return {rules:{userAgent:'*',...(process.env.VERCEL_ENV==='production'?{allow:'/',disallow:'/api/'}:{disallow:'/'})},sitemap:site.origin+'/sitemap.xml'};}
