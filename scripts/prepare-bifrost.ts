import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {bifrostSettings} from '../packages/tavily/src/bifrost-interpreter';
import {buildBifrostConfig,isTimeoutOnlyRefresh} from '../packages/tavily/src/bifrost-config';
import {isDeepStrictEqual} from 'node:util';

const settings=bifrostSettings();
const config=buildBifrostConfig();
const directory=`.local/b05-bifrost-${settings.provider}`;
const expected=JSON.stringify(config,null,2)+'\n';
await mkdir(directory,{recursive:true});
try{await writeFile(`${directory}/config.json`,expected,{flag:'wx',mode:0o600});}
catch(error){
 if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
 const existing=JSON.parse(await readFile(`${directory}/config.json`,'utf8'));
 if(!isDeepStrictEqual(existing,config)){
  if(!process.argv.includes('--refresh-timeout'))throw new Error('Existing local Bifrost configuration differs. Review it; --refresh-timeout permits only a timeout-only change.');
  if(!isTimeoutOnlyRefresh(existing,config,settings.provider))throw new Error('Other gateway settings differ; they were not overwritten.');
  await writeFile(`${directory}/config.json`,expected,{mode:0o600});
 }
}
console.log(`Single-provider configuration ready at ${directory}/config.json. No services started or inference requests made.`);
