// DeskPanel: records Claude Code lifecycle metadata only. Never forwards input or reads transcripts.
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {claudeEvent} from '../server/claude-state.mjs';
import {recordEvent as record} from './codex-hook.mjs';
export const defaultClaudeStateDir=()=>join(process.env.LOCALAPPDATA||join(homedir(),'.local','share'),'DeskPanel','claude');
export const recordClaudeEvent=(input,dir=defaultClaudeStateDir())=>record(input,dir,claudeEvent);
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{let text='';for await(const chunk of process.stdin){text+=chunk;if(text.length>2097152){text='';break;}}if(text)await recordClaudeEvent(JSON.parse(text));}catch{}
 // Neutral response: no permission decisions, no added context, no blocking.
 process.stdout.write('{}');
}
