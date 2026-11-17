import {readFile,writeFile,mkdir,copyFile,rename} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {EVENTS} from '../server/codex-state.mjs';
import {defaultStateDir} from './codex-hook.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hook=join(root,'scripts','codex-hook.mjs');
export function mergeHooks(config,command){
 const result=structuredClone(config);result.hooks??={};
 for(const event of EVENTS){result.hooks[event]??=[];if(!result.hooks[event].some(group=>group.hooks?.some(h=>h.command===command)))result.hooks[event].push({hooks:[{type:'command',command,timeout:3,statusMessage:'DeskPanel: статус агента'}]});}
 return result;
}
async function install(){
 const configDir=process.env.CODEX_HOME||join(homedir(),'.codex'),file=join(configDir,'hooks.json');
 let current={},original=null;try{original=await readFile(file,'utf8');current=JSON.parse(original.replace(/^\uFEFF/,''));}catch(e){if(e.code!=='ENOENT')throw Error('Existing hooks could not be parsed; no changes made');}
 const command='"'+process.execPath+'" "'+hook+'"',next=mergeHooks(current,command);
 await mkdir(configDir,{recursive:true});const backup=join(root,'.runtime','backups','codex-hooks-'+Date.now()+'.json');await mkdir(dirname(backup),{recursive:true});if(original!==null)await copyFile(file,backup);
 const temp=file+'.deskpanel.tmp';await writeFile(temp,JSON.stringify(next,null,2)+'\n',{mode:0o600});await rename(temp,file);
 const stateDir=defaultStateDir();await mkdir(stateDir,{recursive:true});await writeFile(join(stateDir,'installed.json'),JSON.stringify({schemaVersion:1,installedAt:new Date().toISOString()}));
 console.log('DeskPanel hooks installed. Existing hooks preserved. Review and trust in Codex Settings > Hooks.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))install().catch(()=>{console.error('Hook installation failed; inspect local paths and permissions.');process.exitCode=1;});
