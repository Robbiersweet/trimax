import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
export const alt='R&L Creations — General Contracting · Homes. Projects. People.';
export const size={width:1200,height:630};
export const contentType='image/png';
// Keep the former URL working for already shared links; new metadata is versioned.
export default async function Image(){return new Response(new Uint8Array(await readFile(join(process.cwd(),'public/brand/rnl-social-v1.png'))),{headers:{'Content-Type':contentType}});}
