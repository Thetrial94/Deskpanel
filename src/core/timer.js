const KEY='deskpanel.timer.v1';
export class QuickTimer {
 constructor(storage){this.storage=storage;let v;try{v=JSON.parse(storage?.getItem(KEY)||'{}');}catch{}v=v||{};this.duration=Number.isInteger(v.duration)&&v.duration>=1&&v.duration<=86400?v.duration:300;this.remaining=Number.isInteger(v.remaining)&&v.remaining>=0&&v.remaining<=this.duration?v.remaining:this.duration;this.deadline=Number.isFinite(v.deadline)&&v.deadline>0?v.deadline:null;this.completed=v.completed===true;this.notice=v.notice===true;}
 save(){try{this.storage?.setItem(KEY,JSON.stringify({duration:this.duration,remaining:this.remaining,deadline:this.deadline,completed:this.completed,notice:this.notice}));}catch{}}
 seconds(now=Date.now()){return this.deadline?Math.max(0,Math.ceil((this.deadline-now)/1000)):this.remaining;}
 set(minutes){if(!Number.isInteger(minutes)||minutes<1||minutes>1440)return false;this.duration=minutes*60;this.reset();return true;}
 start(now=Date.now()){if(this.deadline)return;if(this.remaining<=0)this.remaining=this.duration;this.deadline=now+this.remaining*1000;this.completed=false;this.notice=false;this.save();}
 pause(now=Date.now()){this.remaining=this.seconds(now);this.deadline=null;this.save();}
 reset(){this.deadline=null;this.remaining=this.duration;this.completed=false;this.notice=false;this.save();}
 dismiss(){this.notice=false;this.save();}
 extend(now=Date.now()){this.set(5);this.start(now);}
 tick(now=Date.now()){if(this.deadline&&this.seconds(now)===0){this.deadline=null;this.remaining=0;this.completed=true;this.notice=true;this.save();return true;}return false;}
}
