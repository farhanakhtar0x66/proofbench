import {createApp} from './app';
const app=await createApp();
await app.listen({port:Number(process.env.PORT??3001),host:process.env.HOST??'127.0.0.1'});
console.log(`ProofBench API ready on ${app.server.address()&&JSON.stringify(app.server.address())}`);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{void app.close().then(()=>process.exit(0));});
