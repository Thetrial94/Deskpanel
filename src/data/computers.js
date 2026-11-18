import {FeatureSource,request} from './features.js';
import {MusicSource} from './music.js';
export class ComputerSources {
 constructor(storage){
  this.storage=storage;this.fleet=new FeatureSource('/api/nodes',5000);this.listeners=new Set();this.targets=new Map();
  try{this.selected=storage.getItem('deskpanel.computer')||'local';}catch{this.selected='local';}
  this.snapshot={connection:'loading',nodes:[],bindings:{music:'local'}};
 }
 emit(){for(const fn of this.listeners)fn({...this.snapshot,selected:this.selected});}
 subscribe(fn){
  this.listeners.add(fn);fn({...this.snapshot,selected:this.selected});
  if(this.listeners.size===1)this.stop=this.fleet.subscribe(s=>{
   this.snapshot=s.connection==='connected'?s:{...this.snapshot,connection:s.connection,nodes:(this.snapshot.nodes||[]).map(n=>({...n,connection:'disconnected'}))};
   if(s.connection==='connected'&&!s.nodes.some(n=>n.id===this.selected)){this.selected='local';this.save();}
   this.emit();
  });
  return ()=>{this.listeners.delete(fn);if(!this.listeners.size){this.stop?.();this.stop=null;}};
 }
 save(){try{this.storage.setItem('deskpanel.computer',this.selected);}catch{}}
 select(id){if(!this.snapshot.nodes?.some(n=>n.id===id))return;this.selected=id;this.save();this.emit();}
 async selectMusic(id){await request('/api/nodes',{command:'configure',bindings:{music:id}});await this.fleet.refresh(true);}
 refresh(force=false){return this.fleet.refresh(force);}
 target(kind){return kind==='music'?(this.snapshot.bindings?.music??'unassigned'):this.selected;}
 get(kind,interval){
  const id=this.target(kind),key=kind+':'+id;
  if(!this.targets.has(key)){const path='/api/nodes/'+encodeURIComponent(id)+'/'+kind;this.targets.set(key,kind==='music'?new MusicSource(path):new FeatureSource(path,interval));}
  return this.targets.get(key);
 }
 source(kind,interval=5000){
  const owner=this,listeners=new Set();let active,stopSource,stopFleet;
  const current=()=>owner.get(kind,interval);
  const emit=()=>{const s=current();for(const fn of listeners)fn(s.snapshot,s.pending,s.message);};
  return {
   get snapshot(){return current().snapshot;},get pending(){return current().pending;},
   subscribe(fn){
    listeners.add(fn);
    if(listeners.size===1)stopFleet=owner.subscribe(()=>{const next=current();if(next!==active){stopSource?.();active=next;stopSource=next.subscribe(emit);}});
    else emit();
    return ()=>{listeners.delete(fn);if(!listeners.size){stopSource?.();stopFleet?.();active=null;}};
   },
   refresh(force=false){return current().refresh(force);},
   capture(){return current();},
   command(...args){const target=current();return target.command(...args);}
  };
 }
}
