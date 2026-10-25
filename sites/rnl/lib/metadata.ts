import {brandPreview} from './brandMetadata';
import type {Metadata} from 'next';
import {site} from './content';
export function pageMetadata(title:string,description:string,path:string):Metadata{return {title,description,alternates:{canonical:site.origin+path},openGraph:{title:`${title} | ${site.name}`,description,url:site.origin+path,siteName:site.name,type:'website',images:[brandPreview]}};}
