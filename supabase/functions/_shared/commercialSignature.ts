/** Mercado Pago: data.id e request-id são os valores efetivamente assinados. */
export async function validSignature(signature:string|null,requestId:string|null,id:string,secret:string):Promise<boolean>{
  if(!signature||!requestId)return false;
  const fields=Object.fromEntries(signature.split(',').map(s=>s.trim().split('=')));
  if(!/^\d+$/.test(fields.ts??'')||! /^[a-f0-9]{64}$/i.test(fields.v1??''))return false;
  const encoded=new TextEncoder();const key=await crypto.subtle.importKey('raw',encoded.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const digest=Uint8Array.from(fields.v1.match(/.{2}/g)!.map(s=>parseInt(s,16)));
  return crypto.subtle.verify('HMAC',key,digest,encoded.encode(`id:${id.toLowerCase()};request-id:${requestId};ts:${fields.ts};`));
}
