import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { networkInterfaces } from 'node:os';
import { readAgentSnapshot } from './bridge.mjs';
import { Features } from './features.mjs';
import { MusicBridge } from './music.mjs';
import { handleMusic } from './music-http.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8'};
export function createAppServer({music=new MusicBridge(),features=new Features()}={}) {
  const server = createServer(async (req, res) => {
    const send = (status, body, type = 'application/json; charset=utf-8') => {
      res.writeHead(status, {'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if(await features.handle(path,req,res,send))return;
      if(path === '/api/music'){await handleMusic(req,send,music);return;}
      if (!['GET','HEAD'].includes(req.method)) { res.setHeader('Allow','GET, HEAD'); send(405, '{"error":"method_not_allowed"}'); return; }
      if (path === '/api/health') { send(200, JSON.stringify({ok:true,version:'0.1.0'})); return; }
      if (path === '/api/agents') { send(200, JSON.stringify(await readAgentSnapshot())); return; }
      if (path !== '/' && path !== '/index.html' && !path.startsWith('/src/') && !path.startsWith('/public/')) { send(404, '{"error":"not_found"}'); return; }
      if (path.includes('\\') || path.includes('\0') || path.split('/').includes('..')) { send(400, '{"error":"invalid_path"}'); return; }
      const file = resolve(root, path === '/' ? 'index.html' : path.slice(1));
      if (!file.startsWith(root + sep) || !types[extname(file)]) { send(404, '{"error":"not_found"}'); return; }
      send(200, await readFile(file), types[extname(file)]);
    } catch (error) {
      send(error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 400, '{"error":"not_found"}');
    }
  });
  server.on('close',()=>music.close());
  server.requestTimeout=15000;
  return server;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const host = process.argv.includes('--lan') ? '0.0.0.0' : '127.0.0.1';
  const portIndex = process.argv.indexOf('--port');
  const port = portIndex >= 0 ? Number(process.argv[portIndex+1]) : 4317;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Use a port between 1024 and 65535');
  const server = createAppServer();
  server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? 'Port is busy. Use --port 4318.' : 'Server failed: '+e.code); process.exitCode = 1; });
  server.listen(port, host, () => {
    console.log('DeskPanel: http://localhost:'+port);
    if (host === '0.0.0.0') {
      for (const addresses of Object.values(networkInterfaces())) for (const address of addresses || [])
        if (address.family === 'IPv4' && !address.internal) console.log('Phone: http://'+address.address+':'+port);
    }
  });
}
