import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {type z} from 'zod';
export class JsonStore {
 constructor(private root:string){}
 private file(kind:string,id:string){
  if(!/^[a-z-]+$/.test(kind)||!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('Invalid storage identifier');
  return join(this.root,`${kind}-${id}.json`);
 }
 async put(kind:string,id:string,value:unknown){
  const path=this.file(kind,id);await mkdir(this.root,{recursive:true,mode:0o700});
  const temp=`${path}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(value),{mode:0o600});await rename(temp,path);
 }
 async get<T>(kind:string,id:string,schema:z.ZodType<T>):Promise<T|null>{
  try{return schema.parse(JSON.parse(await readFile(this.file(kind,id),'utf8')));}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
 }
}
