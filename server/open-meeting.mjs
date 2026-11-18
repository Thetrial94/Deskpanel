import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {safeMeetingURL} from './meeting-link.mjs';
export async function openMeeting(url,{platform=process.platform,execute=execFile}={}){
 const safe=safeMeetingURL(url);if(!safe)throw Error('invalid_meeting');
 if(platform!=='win32')return {accepted:false,error:'windows_required'};
 return new Promise(resolve=>execute(join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./windows-meeting.ps1',import.meta.url)),safe],{windowsHide:true,timeout:8000,maxBuffer:1024},error=>resolve({accepted:!error})));
}
