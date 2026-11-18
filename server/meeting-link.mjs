// Only known HTTPS meeting providers can be opened by an event action.
export function safeMeetingURL(value){
 try{if(typeof value!=='string'||value.length>2048||/[\x00-\x20]/.test(value))return null;const u=new URL(value),host=u.hostname;
 const allowed=['telemost.yandex.ru','telemost.360.yandex.ru','telemost.yandex-team.ru','meet.google.com','teams.microsoft.com','teams.live.com'].includes(host)||host==='zoom.us'||host.endsWith('.zoom.us')||host==='zoom.com'||host.endsWith('.zoom.com');
 return allowed&&u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&u.pathname!=='/'?u.href:null;
 }catch{return null;}
}
export function findMeetingURL(event){
 const text=[event?.url,event?.location,event?.description].map(v=>typeof v==='string'?v:typeof v?.val==='string'?v.val:'').join('\n').slice(0,100000);
 for(const candidate of text.match(/https:\/\/[^\s<>"']+/g)||[]){const url=safeMeetingURL(candidate.replace(/[),.;]+$/,'' ).replace(/&amp;/g,'&'));if(url)return url;}
 return null;
}
