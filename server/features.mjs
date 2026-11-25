import {openMeeting} from './open-meeting.mjs';
import {ConnectionStore,validateConfig} from './connections.mjs';
import {DeviceAccess} from './access.mjs';
import {Computer} from './computer.mjs';
import {Calendar} from './calendar.mjs';
import {Home} from './home.mjs';
import {checkRequest,readJSON,localRequest} from './http-guard.mjs';
export class Features {
 constructor({store=new ConnectionStore(),computer=new Computer(),meetingOpener=openMeeting}={}){this.meetingOpener=meetingOpener;this.store=store;this.access=new DeviceAccess(store);this.computer=computer;this.calendar=new Calendar(store);this.home=new Home(store);}
 async handle(path,req,res,send){
  if(!['/api/access','/api/connections','/api/computer','/api/remote','/api/calendar','/api/home'].includes(path))return false;
  if(!['GET','HEAD','POST'].includes(req.method)){send(405,'{"error":"method_not_allowed"}');return true;}
  if(!checkRequest(req,req.method==='POST')){send(403,'{"error":"invalid_origin"}');return true;}
  const json=(status,data)=>send(status,JSON.stringify(data));
  try{
   const local=localRequest(req);
   if(path==='/api/access'){
    if(req.method!=='POST'){json(200,{local,paired:await this.access.authorized(req)});return true;}
    const data=await readJSON(req);
    if(data.command==='code'&&local){json(200,this.access.issue());return true;}
    if(data.command==='pair'){
     const token=await this.access.pair(data.code,req.socket.remoteAddress);
     res.setHeader('Set-Cookie','deskpanel_device='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000');
     json(200,{paired:true});return true;
    }json(403,{error:'local_setup_required'});return true;
   }
   if(!(await this.access.authorized(req))){json(403,{error:'pair_required'});return true;}
   if(path==='/api/computer'&&req.method!=='POST'){json(200,this.computer.metrics());return true;}
   if(path==='/api/connections'){
    if(req.method==='POST'){
     if(!local){json(403,{error:'local_setup_required'});return true;}
     const change=validateConfig(await readJSON(req));
     await this.store.update(data=>({...data,[change.kind]:change.value}));
     this.calendar.clear();this.home.clear();
    }
    const config=await this.store.get();
    json(200,{local,calendar:!!config.calendar,home:config.home?.provider||null});return true;
   }
   if(path==='/api/calendar'){
    if(req.method==='POST'){const data=await readJSON(req);if(data.command!=='open'||Object.keys(data).some(k=>!['command','id'].includes(k)))throw Error('invalid_meeting');const result=await this.calendar.open(data.id,this.meetingOpener);json(result.accepted?200:409,result);}
    else json(200,await this.calendar.status());return true;
   }
   if(path==='/api/home'){
    if(req.method==='POST'){const data=await readJSON(req);json(200,await this.home.command(data.id,data.on));}
    else json(200,await this.home.status());
    return true;
   }
   if(path==='/api/remote'){
    if(req.method==='POST'){const data=await readJSON(req);const result=await this.computer.run(data.command,data.value);json(result.accepted?200:409,result);}
    else json(200,await this.computer.run());
    return true;
   }
   json(405,{error:'method_not_allowed'});
  }catch(error){const safe=['invalid_pair_code','pair_rate_limit','invalid_calendar_url','invalid_home_config','invalid_home_url','windows_required','confirmation_required','busy'];json(400,{error:safe.includes(error.message)?error.message:'request_failed'});}
  return true;
 }
}
