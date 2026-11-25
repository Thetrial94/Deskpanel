import {readFile,writeFile,mkdir,copyFile,rename} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {CLAUDE_EVENTS} from '../server/claude-state.mjs';
import {defaultClaudeStateDir} from './claude-hook.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hook=join(root,'scripts','claude-hook.mjs');
// Claude Code runs hook commands through Git Bash on Windows, so paths use forward slashes.
const posix=p=>p.replace(/\\/g,'/');
export function mergeClaudeHooks(config,command){
 const result=structuredClone(config);result.hooks??={};
 for(const event of CLAUDE_EVENTS){result.hooks[event]??=[];if(!result.hooks[event].some(group=>group.hooks?.some(h=>h.command===command)))result.hooks[event].push({hooks:[{type:'command',command,timeout:3}]});}
 return result;
}
export function mergeClaudeStatusline(config,command){
 const result=structuredClone(config),previous=config.statusLine;
 const isDeskPanel=typeof previous?.command==='string'&&previous.command.replace(/\\/g,'/').includes('/scripts/claude-statusline.mjs');
 result.statusLine={...previous,type:'command',command};
 return {config:result,previous:previous&&!isDeskPanel?previous:null};
}
async function install(){
 const configDir=process.env.CLAUDE_CONFIG_DIR||join(homedir(),'.claude'),file=join(configDir,'settings.json');
 let current={},original=null;try{original=await readFile(file,'utf8');current=JSON.parse(original.replace(/^﻿/,'')||'{}');}catch(e){if(e.code!=='ENOENT')throw Error('Existing settings could not be parsed; no changes made');}
 const command='"'+posix(process.execPath)+'" "'+posix(hook)+'"';
 const statusCommand='"'+posix(process.execPath)+'" "'+posix(join(root,'scripts','claude-statusline.mjs'))+'"';
 const {config:next,previous}=mergeClaudeStatusline(mergeClaudeHooks(current,command),statusCommand);
 const stateDir=defaultClaudeStateDir();await mkdir(stateDir,{recursive:true});
 if(previous)await writeFile(join(stateDir,'previous-statusline.json'),JSON.stringify(previous)+'\n',{mode:0o600});
 await mkdir(configDir,{recursive:true});const backup=join(root,'.runtime','backups','claude-settings-'+Date.now()+'.json');await mkdir(dirname(backup),{recursive:true});if(original!==null)await copyFile(file,backup);
 const temp=file+'.deskpanel.tmp';await writeFile(temp,JSON.stringify(next,null,2)+'\n',{mode:0o600});await rename(temp,file);
 await writeFile(join(stateDir,'installed.json'),JSON.stringify({schemaVersion:1,installedAt:new Date().toISOString()}));
 console.log('DeskPanel hooks and quota statusLine installed in Claude Code settings. Existing statusLine output, other settings and hooks preserved. Restart Claude Code sessions to load them.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))install().catch(()=>{console.error('Hook installation failed; inspect local paths and permissions.');process.exitCode=1;});
