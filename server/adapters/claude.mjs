import {readFile,readdir,stat,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {defaultClaudeStateDir} from '../../scripts/claude-hook.mjs';
import {claudeSnapshot} from '../claude-state.mjs';
// Reads only the minimal records written by scripts/claude-hook.mjs. Transcripts are never opened.
export async function readClaudeStatus(dir=defaultClaudeStateDir()){
 let configured=false;try{configured=JSON.parse(await readFile(join(dir,'installed.json'),'utf8')).schemaVersion===1;}catch{}
 try{const names=(await readdir(dir)).filter(n=>/^[a-f0-9]{64}\.json$/.test(n)),records=[];
  for(const name of names.slice(0,1000)){try{const file=join(dir,name),info=await stat(file);if(info.size>4096)continue;if(Date.now()-info.mtimeMs>86400000){await unlink(file);continue;}const r=JSON.parse(await readFile(file,'utf8'));if(Number.isFinite(r.updatedAt))records.push(r);}catch{}}
  return claudeSnapshot(records,Date.now(),configured);
 }catch{return claudeSnapshot([],Date.now(),configured);}
}
