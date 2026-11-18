import {readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {validateUsage,unavailableUsage} from '../agent-usage.mjs';
export async function readClaudeUsage(dir){
 try{const file=join(dir,'usage.json');if((await stat(file)).size>4096)return unavailableUsage();return validateUsage(JSON.parse(await readFile(file,'utf8')));}catch{return unavailableUsage('awaiting_statusline');}
}
