import type {MetadataRoute} from 'next';
import {site} from '../lib/content';
export default function sitemap():MetadataRoute.Sitemap{return ['','/services','/gallery','/about','/property-managers','/schedule','/contact','/privacy','/request-terms'].map(path=>({url:site.origin+path,changeFrequency:'monthly',priority:path?0.7:1}));}
