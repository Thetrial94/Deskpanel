import {parentPort,workerData} from 'node:worker_threads';
import ical from 'node-ical';
try {
 const data=ical.sync.parseICS(workerData.text),from=new Date(workerData.now),to=new Date(workerData.now+7*86400000),events=[];
 for(const event of Object.values(data)){
  if(event.type!=='VEVENT'||event.status==='CANCELLED'||!event.start)continue;
  const instances=ical.expandRecurringEvent(event,{from,to,expandOngoing:true,maxIterations:2000});
  for(const instance of instances){
   if(instance.event?.status==='CANCELLED')continue;
   const date=value=>instance.isFullDay?new Date(new Date(value).toISOString().slice(0,10)+'T00:00:00+03:00'):new Date(value);
   const start=date(instance.start),end=date(instance.end||instance.start);
   if(!Number.isFinite(+start)||!Number.isFinite(+end)||+end<=workerData.now||+start>+to)continue;
   events.push({id:String(event.uid).slice(0,200)+':'+start.toISOString(),title:String(instance.summary||event.summary||'Встреча').slice(0,240),start:start.toISOString(),end:end.toISOString(),allDay:!!instance.isFullDay});
   if(events.length>2000)throw Error('calendar_too_large');
  }
 }
 events.sort((a,b)=>a.start.localeCompare(b.start));
 parentPort.postMessage({events:events.slice(0,30)});
} catch {parentPort.postMessage({error:'invalid_calendar'});}
