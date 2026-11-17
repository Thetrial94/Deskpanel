import { networkInterfaces } from 'node:os';
export function localRequest(req){return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)&&['localhost','127.0.0.1','[::1]'].includes(new URL('http://'+req.headers.host).hostname);}
export function checkRequest(req,write=false){
 const hosts=new Set(['localhost','127.0.0.1','[::1]']);
 for(const items of Object.values(networkInterfaces()))for(const item of items||[])hosts.add(item.family==='IPv6'?'['+item.address+']':item.address);
 let url;try{url=new URL('http://'+req.headers.host);}catch{return false;}
 if(!hosts.has(url.hostname))return false;
 if(req.headers.origin&&req.headers.origin!==url.origin)return false;
 if(write&&(req.headers.origin!==url.origin||req.headers['x-deskpanel']!=='1'||req.headers['content-type']?.split(';')[0].trim()!=='application/json'||(req.headers['sec-fetch-site']&&req.headers['sec-fetch-site']!=='same-origin')))return false;
 return true;
}
export async function readJSON(req,limit=8192){
 const chunks=[];let size=0;
 for await(const part of req){size+=part.length;if(size>limit)throw Error('body_too_large');chunks.push(part);}
 const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 if(!result||typeof result!=='object'||Array.isArray(result))throw Error('invalid_request');
 return result;
}
