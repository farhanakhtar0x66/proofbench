import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {bifrostSettings} from '../packages/tavily/src/bifrost-interpreter';
import {buildBifrostConfig} from '../packages/tavily/src/bifrost-config';

const settings=bifrostSettings();
const directory=`.local/b05-bifrost-${settings.provider}`;
const expected=buildBifrostConfig();
if(JSON.stringify(JSON.parse(await readFile(`${directory}/config.json`,'utf8')))!==JSON.stringify(expected))throw new Error('Gateway config differs; run bifrost:prepare and review it before starting');
const origin=new URL(settings.endpoint);
// Inherits ignored .env loaded by Node. Keys remain environment references in config.
const child=spawn('.local/bifrost-bin/v2.4.0/bifrost-http',['-app-dir',directory,'-host',origin.hostname,'-port',origin.port||'80'],{stdio:'inherit',env:process.env});
child.on('error',()=>{console.error('Local gateway binary unavailable. See docs/B05-MODEL-PROVIDERS.md for installation.');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>child.kill(signal));
