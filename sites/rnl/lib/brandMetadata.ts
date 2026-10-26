import type {Metadata} from 'next';
export const brandPreview={url:'/brand/rnl-social-v1.png',width:1200,height:630,alt:'R&L Creations — General Contracting · Homes. Projects. People.'};
export const brandMetadata:Metadata={
  manifest:'/manifest.webmanifest',
  icons:{icon:[{url:'/brand/rnl-favicon-v1.ico',sizes:'16x16 32x32 48x48',type:'image/x-icon'},{url:'/brand/rnl-mark-v1.svg',type:'image/svg+xml'},{url:'/brand/rnl-mark-32-v1.png',sizes:'32x32',type:'image/png'}],apple:[{url:'/brand/rnl-mark-180-v1.png',sizes:'180x180',type:'image/png'}]},
  twitter:{card:'summary_large_image',images:[brandPreview]}
};
