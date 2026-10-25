import type {Metadata} from 'next';
import localFont from 'next/font/local';
import Header from '../components/Header';
import {Footer} from '../components/Site';
import {site} from '../lib/content';
import {brandMetadata,brandPreview} from '../lib/brandMetadata';
import './globals.css';
import {previewNotice} from '../lib/previewNotice';
const script=localFont({src:'../.shared/book/fonts/Allura-Regular.ttf',variable:'--font-craftsman-script',weight:'400',display:'swap'});
export const metadata:Metadata={metadataBase:new URL(site.origin),title:{default:'R&L Creations | General Contracting & Property Care',template:'%s | R&L Creations'},description:'Repairs, painting, apartment turns and thoughtful property care. Start your next project with R&L Creations.',robots:process.env.VERCEL_ENV==='production'?{index:true,follow:true}:{index:false,follow:false},...brandMetadata,openGraph:{siteName:site.name,type:'website',images:[brandPreview]}};
export default function Layout({children}:{children:React.ReactNode}){const notice=previewNotice();return <html lang="en" className={script.variable}><body><a className="skip-link" href="#main-content">Skip to content</a>{notice&&<div className="preview-notice">{notice.title} <span>·</span> {notice.message}</div>}<Header/><main id="main-content">{children}</main><Footer/><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({'@context':'https://schema.org','@type':'Organization',name:site.name,url:site.origin,foundingDate:'2020',slogan:site.tagline,email:site.email,telephone:site.phoneHref})}}/></body></html>;}
