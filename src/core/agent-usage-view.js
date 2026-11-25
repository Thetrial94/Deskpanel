import {escapeHTML as esc} from './dom.js';
const MAX_AGE=15*60*1000;
export function usageWindowView(usage,key,now=Date.now()){
 const w=usage?.windows?.[key],stamp=Date.parse(usage?.updatedAt),reset=Date.parse(w?.resetsAt);
 const valid=usage?.status==='available'&&Number.isFinite(stamp)&&stamp<=now+5000&&typeof w?.usedPercent==='number'&&Number.isFinite(w.usedPercent)&&w.usedPercent>=0&&w.usedPercent<=100;
 if(!valid)return {remaining:null,note:'Нет данных',tone:'unknown'};
 if(Number.isFinite(reset)&&reset<=now)return {remaining:null,note:'Ожидаем обновление',tone:'unknown'};
 const remaining=Math.floor(100-w.usedPercent),stale=now-stamp>MAX_AGE||usage.refreshFailed;
 const resetText=Number.isFinite(reset)?'Сброс '+new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',...(key==='week'?{day:'numeric',month:'short'}:{}),hour:'2-digit',minute:'2-digit'}).format(new Date(reset)):'';
 return {remaining,note:stale?'Данные устарели':resetText||'Время сброса неизвестно',tone:stale?'stale':remaining<=10?'critical':remaining<=25?'warning':'normal'};
}
export function agentUsageHTML(usage,now=Date.now()){
 return [['fiveHour','5 часов'],['week','Неделя']].map(([key,label])=>{
  const v=usageWindowView(usage,key,now),known=v.remaining!==null;
  return '<div class="agent-quota quota-'+v.tone+'" data-quota="'+key+'"><div class="quota-heading"><span>'+label+'</span><strong>'+(known?v.remaining+'% <small>осталось</small>':'—')+'</strong></div>'+(known?'<meter min="0" max="100" low="10" high="25" optimum="100" value="'+v.remaining+'" aria-label="'+label+': осталось '+v.remaining+'%"></meter>':'<div class="quota-empty-bar"></div>')+'<span class="quota-note">'+esc(v.note)+'</span></div>';
 }).join('');
}
