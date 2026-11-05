import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {readFile} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import {buildBifrostConfig} from '../packages/tavily/src/bifrost-config';
import {LiveStartupError,liveDevelopmentConfig,checkLiveGateway} from './dev-live-config';

try{
 const config=liveDevelopmentConfig(process.argv.slice(2),process.env);
 let stored:unknown;
 try{stored=JSON.parse(await readFile(`.local/b05-bifrost-${config.settings.provider}/config.json`,'utf8'));}catch{throw new LiveStartupError('Prepared gateway configuration is missing or unreadable. Run npm run bifrost:prepare first.');}
 if(!isDeepStrictEqual(stored,buildBifrostConfig(config.env)))throw new LiveStartupError('Prepared gateway configuration differs from the selected provider/model. Review it with bifrost:prepare before starting the gateway.');
 console.log(`LIVE configuration: ${config.settings.provider} / ${config.settings.model}. Rules extraction; model evidence comparison.`);
 console.log(`Server-lifetime allowance: at most ${config.limit} Tavily Basic searches and ${config.limit} model comparisons. No automatic retries or provider fallback. Saved .env is unchanged.`);
 if(config.configurationOnly){console.log('Configuration-only check passed. No services, health probes, Tavily searches or model requests were started.');}
 else{
  await checkLiveGateway(config);
  for(const port of [Number(config.env.PORT),5173])await new Promise<void>((resolve,reject)=>{
   const probe=createServer();probe.once('error',()=>reject(new LiveStartupError(`Development port ${port} is unavailable. Stop the previous development server first; no verification request was made.`)));
   probe.listen(port,'127.0.0.1',()=>probe.close(()=>resolve()));
  });
  console.log('Gateway health passed. Starting the API and website. Select General claim analysis and Current sources.');
  console.log('Allowance inspection: GET /api/analysis/readiness (no provider calls). Stop this terminal with Ctrl+C.');
  const child=spawn(process.execPath,['node_modules/concurrently/dist/bin/concurrently.js','-k','-n','api,web','npm:dev:api','npm run dev:web -- --strictPort'],{env:config.env,stdio:'inherit'});
  for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>child.kill(signal));
  child.once('error',()=>{console.error('Could not start the installed development runner. Check npm install.');process.exitCode=1;});
  child.once('exit',code=>{process.exitCode=code??1;});
 }
}catch(error){console.error(error instanceof LiveStartupError?error.message:'Live startup failed before the development runner started. Review the local configuration; raw errors and credentials are not displayed.');process.exitCode=1;}
