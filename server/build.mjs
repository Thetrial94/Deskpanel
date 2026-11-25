// Fingerprint of the files the browser loads. Kiosk pages poll it and reload once the client code changes on disk.
import {createHash} from 'node:crypto';
import {readdir,stat} from 'node:fs/promises';
import {join,relative} from 'node:path';
async function files(dir){
 let entries;try{entries=await readdir(dir,{withFileTypes:true});}catch{return [];}
 const nested=await Promise.all(entries.map(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]));
 return nested.flat();
}
export class Build {
 constructor(root,ttl=2000){this.root=root;this.ttl=ttl;this.cache=null;}
 async id(){
  if(this.cache&&Date.now()-this.cache.at<this.ttl)return this.cache.id;
  const list=[join(this.root,'index.html'),...await files(join(this.root,'src')),...await files(join(this.root,'public'))].sort();
  const hash=createHash('sha256');
  for(const file of list){try{const s=await stat(file);hash.update(relative(this.root,file)+'\0'+s.size+'\0'+s.mtimeMs+'\n');}catch{}}
  const id=hash.digest('hex').slice(0,16);
  this.cache={at:Date.now(),id};return id;
 }
}
