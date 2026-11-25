// Reload a long-running page (a kiosk) after the panel's files change on the computer.
// A new build must be seen twice in a row, so a half-finished save or checkout does not trigger it.
export class BuildWatcher {
 constructor({fetcher=(...a)=>fetch(...a),reload,canReload=()=>true}={}){this.fetcher=fetcher;this.reload=reload;this.canReload=canReload;this.loaded=null;this.seen=null;this.count=0;}
 async read(){
  try{const r=await this.fetcher('/api/build',{cache:'no-store'});if(!r.ok)return null;const d=await r.json();return typeof d?.build==='string'&&d.build?d.build:null;}
  catch{return null;}
 }
 async check(){
  const build=await this.read();if(!build)return false;
  if(!this.loaded){this.loaded=build;return false;}
  if(build===this.loaded){this.seen=null;this.count=0;return false;}
  this.count=build===this.seen?this.count+1:1;this.seen=build;
  if(this.count<2||!this.canReload())return false;
  this.reload();return true;
 }
}
