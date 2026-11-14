import {createReadStream,existsSync,statSync} from 'node:fs';
import {extname,join,resolve,sep} from 'node:path';
import {createApp} from './app';
const app=await createApp();

// One-service deployment: with WEB_DIR set (the built web app, e.g. dist/web), the API
// also serves the frontend on the same origin, so its relative /api calls just work.
// Page routes such as /benchmarks fall back to index.html; /api stays JSON-only.
const webDir=process.env.WEB_DIR?resolve(process.env.WEB_DIR):undefined;
if(webDir&&existsSync(join(webDir,'index.html'))){
 const types:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.json':'application/json',
  '.woff2':'font/woff2','.woff':'font/woff','.wasm':'application/wasm','.txt':'text/plain; charset=utf-8'};
 app.setNotFoundHandler((request,reply)=>{
  const path=decodeURIComponent((request.url.split('?')[0])||'/');
  if(request.method!=='GET'&&request.method!=='HEAD'||path.startsWith('/api'))return reply.code(404).send({version:'1',error:'not_found'});
  const file=resolve(webDir,'.'+path);
  // Never serve outside the web directory.
  const inside=file===webDir||file.startsWith(webDir+sep);
  const asset=inside&&existsSync(file)&&statSync(file).isFile();
  const target=asset?file:join(webDir,'index.html');
  reply.header('Content-Type',types[extname(target)]??'application/octet-stream');
  // Hashed build assets never change; the page itself must always be fresh.
  reply.header('Cache-Control',asset&&path.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache');
  return reply.send(createReadStream(target));
 });
}

await app.listen({port:Number(process.env.PORT??3001),host:process.env.HOST??'127.0.0.1'});
console.log(`ProofBench API ready on ${app.server.address()&&JSON.stringify(app.server.address())}${webDir?` · serving web from ${webDir}`:''}`);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{void app.close().then(()=>process.exit(0));});
