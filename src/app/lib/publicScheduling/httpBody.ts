export async function readBoundedJson(request:Request,maximumBytes:number):Promise<unknown>{
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw Error('JSON required.');
 const reader=request.body?.getReader();if(!reader)throw Error('Request body required.');
 let bytes=0,text='';const decoder=new TextDecoder();
 while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>maximumBytes){await reader.cancel();throw Error('Request too large.');}text+=decoder.decode(part.value,{stream:true});}
 return JSON.parse(text+decoder.decode());
}
