const rank={approval:0,waiting:1,error:2,working:3,stale:4,idle:5,completed:6,interrupted:7};
export function sortSessions(sessions){return [...sessions].sort((a,b)=>(rank[a.status]??8)-(rank[b.status]??8)||Date.parse(b.updatedAt)-Date.parse(a.updatedAt));}
export function sessionGroups(sessions){
 const sorted=sortSessions(sessions);
 return [
  {id:'current',title:'Сейчас',sessions:sorted.filter(s=>['approval','waiting','error','working'].includes(s.status))},
  {id:'other',title:'Другие состояния',sessions:sorted.filter(s=>!['approval','waiting','error','working','completed','interrupted'].includes(s.status))},
  {id:'recent',title:'Недавно',sessions:sorted.filter(s=>['completed','interrupted'].includes(s.status))}
 ].filter(group=>group.sessions.length);
}
export function agentSummary(sessions){
 const counts={};for(const s of sessions)counts[s.status]=(counts[s.status]||0)+1;
 return [['working','в работе'],['waiting','ждут ответа'],['approval','ждут разрешения'],['error','с ошибкой'],['stale','без свежих событий'],['completed','завершено'],['interrupted','прервано'],['idle','ожидают задачу']].filter(([key])=>counts[key]).map(([key,label])=>counts[key]+' '+(counts[key]===1?label.replace('ждут','ждёт').replace('ожидают','ожидает'):label)).join(' · ');
}
export function statusAge(session,now=Date.now()){
 const since=Date.parse(session.statusSince);if(!Number.isFinite(since)||since>now)return '';
 const seconds=Math.floor((now-since)/1000),minutes=Math.floor(seconds/60),hours=Math.floor(minutes/60);
 const age=seconds<60?'меньше минуты':hours?hours+' ч'+(minutes%60?' '+minutes%60+' мин':''):minutes+' мин';
 return session.status==='working'?'Ход · '+age:['completed','interrupted','error'].includes(session.status)?age+' назад':age;
}
export function attentionNotice(snapshot){
 for(const provider of ['codex','claude']){
  const state=snapshot[provider];if(state?.connection!=='connected')continue;
  const pending=sortSessions(state.sessions.filter(s=>['approval','waiting'].includes(s.status)));
  if(!pending.length)continue;
  const name=provider==='codex'?'Codex':'Claude',kind=pending[0].status==='approval'?'ждёт разрешения':'ждёт ответа';
  return {provider,label:name+' '+kind+' · '+(pending.length===1?pending[0].title:pending.length+' чатов требуют внимания')+' →'};
 }
 return null;
}
