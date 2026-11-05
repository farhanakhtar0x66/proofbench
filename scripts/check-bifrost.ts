import {checkBifrostStack} from '../packages/tavily/src/bifrost-status';
try{console.log(JSON.stringify(await checkBifrostStack(),null,2));}
catch(error){console.error(error instanceof Error?error.message:'Local stack check failed');process.exitCode=1;}
