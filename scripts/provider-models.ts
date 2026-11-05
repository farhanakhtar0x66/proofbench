import {listAccountModels} from '../packages/tavily/src/provider-models';
try{console.log(JSON.stringify(await listAccountModels(),null,2));}
catch{console.error('Cannot list account models. Check the selected provider/key and connectivity. No inference was attempted; credentials and upstream errors are not printed.');process.exitCode=1;}
