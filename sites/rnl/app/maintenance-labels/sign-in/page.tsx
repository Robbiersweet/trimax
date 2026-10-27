import LabLogin from './signin';
export const metadata={title:'Sign in | TriMax lab',robots:{index:false,follow:false}};
export default function Login(){
 if(process.env.VERCEL_ENV!=='preview'||process.env.NEXT_PUBLIC_SUPABASE_URL!=='https://yzyfmvoswucyauogueca.supabase.co')return <p>Use <a href="https://app.rnlcreations.com/login">TriMax sign in</a>.</p>;
 return <LabLogin/>;
}
