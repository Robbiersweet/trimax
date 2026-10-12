import {ImageResponse} from 'next/og';
export const alt='R&L Creations — General Contracting · Homes. Projects. People.';
export const size={width:1200,height:630};
export const contentType='image/png';
export default function Image(){return new ImageResponse(<div style={{display:'flex',flexDirection:'column',justifyContent:'center',width:'100%',height:'100%',background:'#171916',color:'#f5f1e9',padding:'85px',borderBottom:'18px solid #ff850a'}}><div style={{fontSize:23,color:'#ff850a',letterSpacing:5}}>GENERAL CONTRACTING · EST. 2020</div><div style={{fontSize:91,fontWeight:800,marginTop:30}}>R&L CREATIONS</div><div style={{fontSize:34,marginTop:28}}>Homes. Projects. People.</div><div style={{fontSize:24,color:'#b9bead',marginTop:55}}>rnlcreations.com</div></div>,size);}
