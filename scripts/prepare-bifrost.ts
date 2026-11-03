import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {bifrostSettings} from '../packages/tavily/src/bifrost-interpreter';
import {buildBifrostConfig} from '../packages/tavily/src/bifrost-config';

const settings=bifrostSettings();
const config=buildBifrostConfig();
const directory=`.local/b05-bifrost-${settings.provider}`;
const expected=JSON.stringify(config,null,2)+'\n';
await mkdir(directory,{recursive:true});
try{await writeFile(`${directory}/config.json`,expected,{flag:'wx',mode:0o600});}
catch(error){
 if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
 if(await readFile(`${directory}/config.json`,'utf8')!==expected)throw new Error('Existing local Bifrost configuration differs. Review it manually; it was not overwritten.');
}
console.log(`Single-provider configuration ready at ${directory}/config.json. No services started or inference requests made.`);
