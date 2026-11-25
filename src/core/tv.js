// Pure helpers for the TV screen and the overview module.
export const tvConnectionLabel=c=>({loading:'Проверяем…',pair_required:'Нужна привязка',bridge_offline:'Мост couch-tv не запущен',not_paired:'ТВ не привязан к мосту',tv_offline:'ТВ не в сети',unavailable:'Нет связи'}[c]||'Нет связи');
export function tvPlaybackLabel(state){return {playing:'Идёт',paused:'Пауза',buffering:'Загрузка',stopped:'Остановлено'}[state]||'';}
export function tvSummary(s){
 if(!s||s.connection!=='connected')return {title:tvConnectionLabel(s?.connection),detail:'Открыть телевизор →',status:'offline'};
 if(s.waking)return {title:'Включаем…',detail:s.name,status:'waiting'};
 if(s.power==='off')return {title:'Выключен',detail:s.name,status:'idle'};
 const p=s.playing,episode=p?.season&&p?.episode?'S'+p.season+':E'+p.episode:'';
 if(p?.title)return {title:p.title,detail:[tvPlaybackLabel(p.state),episode,s.app?.name].filter(Boolean).join(' · '),status:p.state==='playing'?'working':'idle'};
 return {title:s.app?.name||'Главный экран',detail:s.name+(s.volume?.muted?' · без звука':''),status:'idle'};
}
export function tvProgress(p,now=Date.now()){
 if(!p||!Number.isFinite(p.positionMs)||!Number.isFinite(p.durationMs)||p.durationMs<=0)return null;
 const drift=p.state==='playing'&&p.updated?Math.max(0,now-Date.parse(p.updated)):0;
 return Math.max(0,Math.min(1,(p.positionMs+(Number.isFinite(drift)?drift:0))/p.durationMs));
}
