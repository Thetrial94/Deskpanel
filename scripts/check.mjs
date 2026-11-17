import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
let count = 0;
async function check(dir) {
  for (const entry of await readdir(dir, {withFileTypes:true})) {
    const file = resolve(dir, entry.name);
    if (entry.isDirectory()) await check(file);
    else if (/\.(m?js)$/.test(file)) {
      const result = spawnSync(process.execPath, ['--check',file], {encoding:'utf8'});
      if (result.status) { console.error(result.stderr); process.exitCode = 1; }
      count++;
    }
  }
}
for (const dir of ['src','server','scripts','tests']) await check(dir);
console.log('Syntax checked: '+count+' files');
