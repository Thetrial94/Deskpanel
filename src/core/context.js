import {sortSessions} from './agent-view.js';
export function isEvening(settings,now=Date.now()){
 if(!settings.eveningMode)return false;
 const hour=new Date(now).getHours(),start=settings.eveningStart,end=settings.eveningEnd;
 return start===end?false:start>end?hour>=start||hour<end:hour>=start&&hour<end;
}
export function timedMeetings(calendar,now=Date.now()){
 if(calendar?.connection!=='connected')return [];
 return (calendar.events||[]).filter(e=>!e.allDay&&Number.isFinite(Date.parse(e.start))&&Date.parse(e.end)>now).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
}
export function approachingMeeting(calendar,now=Date.now()){
 return timedMeetings(calendar,now).find(e=>Date.parse(e.start)-now<=300000&&Date.parse(e.start)-now>=-120000)||null;
}
export function agentAttention(agents){
 const list=[];
 for(const provider of ['codex','claude'])if(agents?.[provider]?.connection==='connected'){
  for(const s of agents[provider].sessions||[])if(['approval','waiting'].includes(s.status))list.push({...s,provider});
 }
 return sortSessions(list);
}
export function activeTimer({timer,focus,breaks},now=Date.now()){
 return [{mode:'timer',label:'Таймер',value:timer},{mode:'focus',label:'Фокус',value:focus},{mode:'breaks',label:breaks?.phase==='rest'?'Перерыв':'Рабочий интервал',value:breaks}].filter(t=>t.value?.deadline).sort((a,b)=>a.value.deadline-b.value.deadline).map(t=>({mode:t.mode,label:t.label,seconds:t.value.seconds(now)}))[0]||null;
}
export function overviewContext({calendar,agents,timer,focus,breaks,quiet=false},now=Date.now()){
 if(quiet)return null;
 const meeting=approachingMeeting(calendar,now);
 if(meeting)return {kind:'meeting',event:meeting,target:'meeting'};
 const attention=agentAttention(agents)[0];
 if(attention)return {kind:'agent',session:attention,target:attention.provider};
 const running=activeTimer({timer,focus,breaks},now);if(running)return {kind:'timer',...running,target:'timers'};
 const event=calendar?.connection==='connected'?(calendar.events||[]).filter(e=>Date.parse(e.end)>now).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start))[0]:null;
 return event?{kind:'calendar',event,target:'calendar'}:null;
}
export function countdown(seconds){const n=Math.max(0,Math.ceil(seconds));return (n>=3600?String(Math.floor(n/3600))+':':'')+String(Math.floor(n/60)%60).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
export function meetingCountdown(event,now=Date.now()){
 const delta=Date.parse(event.start)-now;
 return delta<=0?'Уже началась':countdown(delta/1000);
}
// Keeps only event keys and timestamps; no meeting titles or chat text.
export class SmartTransitions {
 constructor(storage){this.storage=storage;let rows;try{rows=JSON.parse(storage?.getItem('deskpanel.smart.v1')||'[]');}catch{}this.seen=new Map(Array.isArray(rows)?rows.filter(x=>Array.isArray(x)&&typeof x[0]==='string'&&Number.isFinite(x[1])):[]);this.holdUntil=0;this.quietEntered=false;}
 save(now){for(const [key,stamp] of this.seen)if(now-stamp>86400000)this.seen.delete(key);while(this.seen.size>200)this.seen.delete(this.seen.keys().next().value);try{this.storage?.setItem('deskpanel.smart.v1',JSON.stringify([...this.seen]));}catch{}}
 next({calendar,agents,quiet,enabled,blocked,allow=true,now=Date.now()}){
  if(!quiet)this.quietEntered=false;
  if(blocked||!allow)return null;
  if(quiet){if(!this.quietEntered){this.quietEntered=true;this.holdUntil=0;return {target:'overview',kind:'evening'};}return null;}
  if(!enabled||now<this.holdUntil)return null;
  const meeting=approachingMeeting(calendar,now);
  const candidates=[...(meeting?[{target:'meeting',kind:'meeting',key:'meeting:'+meeting.id+':'+meeting.start}]:[]),...agentAttention(agents).map(s=>({target:s.provider,kind:'agent',key:s.provider+':'+s.id+':'+s.status+':'+(s.statusSince||'episode')}))];
  const next=candidates.find(c=>!this.seen.has(c.key));if(!next)return null;
  this.seen.set(next.key,now);this.save(now);this.holdUntil=now+20000;return next;
 }
}
