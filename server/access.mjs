import {randomInt,randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {localRequest} from './http-guard.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
export class DeviceAccess {
 constructor(store){this.store=store;this.code=null;this.attempts=new Map();}
 async authorized(req){
  if(localRequest(req))return true;
  const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('deskpanel_device='))?.slice(17);
  if(!token||!/^[a-f0-9]{64}$/.test(token))return false;
  const candidate=hash(token);
  return ((await this.store.get()).devices||[]).some(d=>d.expires>Date.now()&&d.hash===candidate);
 }
 issue(){this.code={value:String(randomInt(100000,1000000)),expires:Date.now()+180000};return {code:this.code.value,expiresAt:this.code.expires};}
 async pair(code,address){
  const now=Date.now(),record=this.attempts.get(address)||{tries:0,until:now+600000};
  if(record.until<now){record.tries=0;record.until=now+600000;}
  if(record.tries>=5)throw Error('pair_rate_limit');
  record.tries++;this.attempts.set(address,record);
  if(this.attempts.size>1000)for(const [key,value] of this.attempts)if(value.until<now)this.attempts.delete(key);
  if(!this.code||this.code.expires<now||typeof code!=='string'||!/^\d{6}$/.test(code)||!timingSafeEqual(Buffer.from(code),Buffer.from(this.code.value)))throw Error('invalid_pair_code');
  const token=randomBytes(32).toString('hex');this.code=null;
  await this.store.update(data=>({...data,devices:[...(data.devices||[]).filter(d=>d.expires>now).slice(-9),{hash:hash(token),expires:now+30*86400000}]}));
  this.attempts.delete(address);return token;
 }
}
