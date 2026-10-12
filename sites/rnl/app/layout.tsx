import type {Metadata} from 'next';
import localFont from 'next/font/local';
import Header from '../components/Header';
import {Footer} from '../components/Site';
import {site} from '../lib/content';
import './globals.css';
const script=localFont({src:'../.shared/book/fonts/Allura-Regular.ttf',variable:'--font-craftsman-script',weight:'400',display:'swap'});
export const metadata:Metadata={metadataBase:new URL(site.origin),title:{default:'R&L Creations | General Contracting & Property Care',template:'%s | R&L Creations'},description:'Repairs, painting, apartment turns and thoughtful property care. Start your next project with R&L Creations.',robots:process.env.VERCEL_ENV==='production'?{index:true,follow:true}:{index:false,follow:false},icons:{icon:'/icon.svg'},openGraph:{siteName:site.name,type:'website',images:['/opengraph-image']}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en" className={script.variable}><body><a className="skip-link" href="#main-content">Skip to content</a>{process.env.VERCEL_ENV!=='production'&&<div className="preview-notice">WEBSITE PREVIEW <span>·</span> Explore the design. Service request submissions are disabled.</div>}<Header/><main id="main-content">{children}</main><Footer/><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({'@context':'https://schema.org','@type':'Organization',name:site.name,url:site.origin,foundingDate:'2020',slogan:site.tagline})}}/></body></html>;}
