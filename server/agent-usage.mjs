// Subscription windows only. Never infer quotas from context size or token counts.
export const USAGE_MAX_AGE=15*60*1000;
export const unavailableUsage=(reason='not_reported')=>({status:'unavailable',reason,updatedAt:null,windows:{fiveHour:null,week:null}});
function windowValue(value,percentKey,resetKey){
 const used=value?.[percentKey],reset=value?.[resetKey];
 if(typeof used!=='number'||!Number.isFinite(used)||used<0||used>100)return null;
 const resetsAt=typeof reset==='number'&&Number.isFinite(reset)&&reset>0&&reset<8640000000000?new Date(reset*1000).toISOString():null;
 return {usedPercent:used,resetsAt};
}
function snapshot(windows,now){return Object.values(windows).some(Boolean)?{status:'available',updatedAt:new Date(now).toISOString(),windows}:unavailableUsage();}
export function codexUsage(result,now=Date.now()){
 // Prefer the Codex bucket. Never substitute another model's limit or assume primary is five hours.
 const bucket=result?.rateLimitsByLimitId?.codex||(result?.rateLimits?.limitId==null||result?.rateLimits?.limitId==='codex'?result?.rateLimits:null);
 const windows={fiveHour:null,week:null};
 for(const value of [bucket?.primary,bucket?.secondary]){
  const key=value?.windowDurationMins===300?'fiveHour':value?.windowDurationMins===10080?'week':null;
  if(key)windows[key]=windowValue(value,'usedPercent','resetsAt');
 }
 return snapshot(windows,now);
}
export function claudeUsage(input,now=Date.now()){
 return snapshot({fiveHour:windowValue(input?.rate_limits?.five_hour,'used_percentage','resets_at'),week:windowValue(input?.rate_limits?.seven_day,'used_percentage','resets_at')},now);
}
export function validateUsage(value,now=Date.now()){
 const stamp=Date.parse(value?.updatedAt);
 if(value?.status!=='available'||!Number.isFinite(stamp)||stamp>now+5000)return unavailableUsage();
 const windows={fiveHour:null,week:null};
 for(const key of Object.keys(windows)){
  const w=value.windows?.[key],reset=Date.parse(w?.resetsAt);
  windows[key]=windowValue({used:w?.usedPercent,reset:Number.isFinite(reset)?reset/1000:null},'used','reset');
 }
 return snapshot(windows,stamp);
}
