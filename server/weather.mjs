const UA='DeskPanel/0.1 https://github.com/Thetrial94/Deskpanel';
const minute=60000;
const symbolCode=s=>{s=String(s||'').replace(/_(day|night|polartwilight)$/,'');if(s.includes('thunder'))return 95;if(s.includes('sleet'))return 67;if(s.includes('snow'))return s.startsWith('heavy')?75:s.startsWith('light')?71:73;if(s.includes('rain'))return s.startsWith('heavy')?65:s.startsWith('light')?61:63;return {clearsky:0,fair:1,partlycloudy:2,cloudy:3,fog:45}[s]??null;};
export function mapMET(raw,now=Date.now()){
 const rows=raw?.properties?.timeseries;if(!Array.isArray(rows)||!rows.length)throw Error('invalid_weather');
 const series=rows.filter(r=>Number.isFinite(Date.parse(r.time))&&Number.isFinite(r.data?.instant?.details?.air_temperature));
 const current=[...series].sort((a,b)=>Math.abs(Date.parse(a.time)-now)-Math.abs(Date.parse(b.time)-now))[0];
 if(!current||Math.abs(Date.parse(current.time)-now)>3*3600000)throw Error('old_weather');
 const symbol=r=>(r.data.next_1_hours||r.data.next_6_hours||r.data.next_12_hours)?.summary?.symbol_code;
 const d=current.data.instant.details,days=new Map();
 const day=r=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(r.time));
 for(const row of series.filter(r=>Date.parse(r.time)>=Date.parse(current.time))){const key=day(row),value=row.data.instant.details.air_temperature;const slot=days.get(key)||{min:value,max:value,code:symbolCode(symbol(row))};slot.min=Math.min(slot.min,value);slot.max=Math.max(slot.max,value);days.set(key,slot);}
 const entries=[...days].slice(0,5);
 return {current:{temperature_2m:d.air_temperature,apparent_temperature:null,relative_humidity_2m:Number.isFinite(d.relative_humidity)?Math.round(d.relative_humidity):null,weather_code:symbolCode(symbol(current)),wind_speed_10m:Number.isFinite(d.wind_speed)?d.wind_speed*3.6:null},daily:{time:entries.map(([date])=>date),temperature_2m_max:entries.map(([,v])=>v.max),temperature_2m_min:entries.map(([,v])=>v.min),weather_code:entries.map(([,v])=>v.code)},timezone:'Europe/Moscow'};
}
export class Weather {
 constructor(fetcher=fetch){this.fetcher=fetcher;this.cache=new Map();this.cities=new Map();}
 async json(url,headers={}){const r=await this.fetcher(url,{headers:{'User-Agent':UA,...headers},redirect:'error',signal:AbortSignal.timeout(7000)});if(r.status===304)return {response:r};if(!r.ok)throw Error('weather_unavailable');const bytes=await r.arrayBuffer();if(bytes.byteLength>2000000)throw Error('weather_too_large');return {response:r,data:JSON.parse(new TextDecoder().decode(bytes))};}
 async get(latitude,longitude,now=Date.now()){
  const lat=Number(latitude),lon=Number(longitude);if(latitude===null||longitude===null||latitude===''||longitude===''||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw Error('invalid_coordinates');
  const key=lat.toFixed(4)+','+lon.toFixed(4);let entry=this.cache.get(key);
  if(entry?.pending)return entry.pending;if(entry?.retryAt>now){if(entry.value&&now-entry.at<6*3600000)return {...entry.value,stale:true};throw Error('weather_unavailable');}
  if(entry?.value&&entry.expires>now)return entry.value;
  if(!entry){if(this.cache.size>=32){const idle=[...this.cache].find(([,v])=>!v.pending);if(!idle)throw Error('busy');this.cache.delete(idle[0]);}entry={};this.cache.set(key,entry);}
  entry.pending=(async()=>{
   for(const provider of ['met','open-meteo']){try{
    const url=provider==='met'?'https://api.met.no/weatherapi/locationforecast/2.0/compact?'+new URLSearchParams({lat:lat.toFixed(4),lon:lon.toFixed(4)}):'https://api.open-meteo.com/v1/forecast?'+new URLSearchParams({latitude:String(lat),longitude:String(lon),timezone:'auto',forecast_days:'5',current:'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',daily:'weather_code,temperature_2m_max,temperature_2m_min'});
    const {response,data}=await this.json(url,provider==='met'&&entry.modified?{'If-Modified-Since':entry.modified}:{});
    const mapped=response.status===304&&entry.value?.provider==='met'?entry.value:provider==='met'?mapMET(data,now):data;
    if(!Number.isFinite(mapped?.current?.temperature_2m)||!Array.isArray(mapped.daily?.time)||!mapped.daily.time.length||Date.parse(mapped.current.time||new Date(now).toISOString())<now-3*3600000)throw Error('invalid_weather');
    const expires=Date.parse(response.headers.get('Expires')||'');entry.expires=Math.max(now+10*minute,Number.isFinite(expires)?expires:0);entry.at=now;entry.retryAt=0;if(provider==='met')entry.modified=response.headers.get('Last-Modified')||entry.modified;
    entry.value={current:mapped.current,daily:mapped.daily,timezone:mapped.timezone,provider,updatedAt:now,stale:false};return entry.value;
   }catch{}}
   entry.retryAt=now+minute;if(entry.value&&now-entry.at<6*3600000)return {...entry.value,stale:true};throw Error('weather_unavailable');
  })();try{return await entry.pending;}finally{entry.pending=null;}
 }
 async search(query){
  if(typeof query!=='string'||query.trim().length<2||query.length>80)throw Error('invalid_city');
  const key=query.trim().toLowerCase(),old=this.cities.get(key);if(old?.expires>Date.now())return old.value;
  const {data}=await this.json('https://geocoding-api.open-meteo.com/v1/search?'+new URLSearchParams({name:query.trim(),count:'5',language:'ru',format:'json'}));
  const value=(data.results||[]).map(c=>({name:c.name,latitude:c.latitude,longitude:c.longitude,country:[c.admin1,c.country].filter(Boolean).join(', ')}));if(this.cities.size>=50)this.cities.delete(this.cities.keys().next().value);this.cities.set(key,{value,expires:Date.now()+3600000});return value;
 }
}
