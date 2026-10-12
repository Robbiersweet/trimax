import type {NextConfig} from 'next';
const config:NextConfig={
  outputFileTracingRoot:process.cwd(),
  poweredByHeader:false,
  async redirects(){return [{source:'/book/rnl-creations',destination:'/schedule',permanent:true}];},
  async headers(){return [{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'X-Frame-Options',value:'DENY'},{key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},...(process.env.VERCEL_ENV!=='production'?[{key:'X-Robots-Tag',value:'noindex, nofollow'}]:[])]}];}
};
export default config;
