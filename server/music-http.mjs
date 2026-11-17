import { networkInterfaces } from 'node:os';
import { MUSIC_COMMANDS } from './music.mjs';
// The remote is limited to this machine's hostnames/IPs and the page's own origin.
function hosts() {
  const names=new Set(['localhost','127.0.0.1','[::1]']);
  for(const items of Object.values(networkInterfaces()))for(const item of items||[])names.add(item.family==='IPv6'?'['+item.address+']':item.address);
  return names;
}
export async function handleMusic(req,send,bridge) {
  let expected;
  try {
    expected=new URL('http://'+req.headers.host);
    if(!hosts().has(expected.hostname.toLowerCase()))throw new Error();
  } catch { send(403,JSON.stringify({error:'invalid_host'}));return; }
  const origin=req.headers.origin;
  if(origin && origin!==expected.origin){send(403,JSON.stringify({error:'invalid_origin'}));return;}
  if(req.method==='GET'||req.method==='HEAD'){
    send(200,JSON.stringify(await bridge.status()));return;
  }
  if(req.method!=='POST'){send(405,JSON.stringify({error:'method_not_allowed'}));return;}
  if(origin!==expected.origin || req.headers['x-deskpanel']!=='1' ||
     (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site']!=='same-origin') ||
     req.headers['content-type']?.split(';')[0].trim()!=='application/json'){
    send(403,JSON.stringify({error:'invalid_origin'}));return;
  }
  let body='',size=0;
  try {
    for await(const chunk of req){size+=chunk.length;if(size>1024){send(413,JSON.stringify({error:'body_too_large'}));return;}body+=chunk;}
    const data=JSON.parse(body);
    if(!data || !MUSIC_COMMANDS.has(data.command) ||
       (data.command==='volume' ? Object.keys(data).length!==2 || !Number.isInteger(data.value) || data.value<0 || data.value>100 : Object.keys(data).length!==1)){send(400,JSON.stringify({error:'invalid_command'}));return;}
    const result=await bridge.command(data.command,data.value);
    send(result.accepted?200:409,JSON.stringify(result));
  } catch { send(400,JSON.stringify({error:'command_failed'})); }
}
