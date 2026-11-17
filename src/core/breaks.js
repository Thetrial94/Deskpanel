const KEY='deskpanel.breaks.v1';
export class BreakTimer {
 constructor(storage){
  this.storage=storage;let s={};try{s=JSON.parse(storage?.getItem(KEY)||'{}')||{};}catch{}
  this.work=[25,40,50,60,90].includes(s.work)?s.work:50;
  this.rest=[3,5,10,15].includes(s.rest)?s.rest:5;
  this.phase=s.phase==='rest'?'rest':'work';
  this.remaining=Number.isFinite(s.remaining)?Math.max(0,Math.min(s.remaining,this.duration()*60)):this.duration()*60;
  this.deadline=Number.isFinite(s.deadline)&&s.deadline>0?s.deadline:null;
  this.due=s.due===true;this.cycles=Number.isInteger(s.cycles)?Math.max(0,s.cycles):0;
 }
 duration(){return this.phase==='rest'?this.rest:this.work;}
 save(){try{this.storage?.setItem(KEY,JSON.stringify({work:this.work,rest:this.rest,phase:this.phase,remaining:this.remaining,deadline:this.deadline,due:this.due,cycles:this.cycles}));}catch{}}
 seconds(now=Date.now()){return this.deadline?Math.max(0,Math.ceil((this.deadline-now)/1000)):this.remaining;}
 start(now=Date.now()){if(this.deadline)return;if(this.due){if(this.phase==='work')this.phase='rest';else{this.phase='work';this.cycles++;}this.remaining=this.duration()*60;this.due=false;}this.deadline=now+this.remaining*1000;this.save();}
 pause(now=Date.now()){this.remaining=this.seconds(now);this.deadline=null;this.save();}
 reset(){this.phase='work';this.remaining=this.work*60;this.deadline=null;this.due=false;this.save();}
 configure(work,rest){if(![25,40,50,60,90].includes(work)||![3,5,10,15].includes(rest))return;this.work=work;this.rest=rest;this.reset();}
 tick(now=Date.now()){if(this.deadline&&this.seconds(now)===0){this.deadline=null;this.remaining=0;this.due=true;this.save();return this.phase;}return null;}
}
