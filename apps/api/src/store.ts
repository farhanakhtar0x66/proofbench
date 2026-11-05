import {mkdir,readFile,writeFile,rename,readdir} from 'node:fs/promises';
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
 async list<T>(kind:string,schema:z.ZodType<T>,limit=50):Promise<T[]>{
  if(!/^[a-z-]+$/.test(kind)) throw new Error('Invalid storage kind');
  let entries: string[] = [];
  try{
   entries = await readdir(this.root);
  }catch(error){
   if((error as NodeJS.ErrnoException).code==='ENOENT')return [];
   throw error;
  }
  const prefix=`${kind}-`;
  const matchingFiles=entries.filter(f=>f.startsWith(prefix)&&f.endsWith('.json')&&!f.endsWith('.tmp'));
  const items:{item:T;sortKey:string}[]=[];
  for(const filename of matchingFiles){
   try{
    const content=await readFile(join(this.root,filename),'utf8');
    const parsed=schema.safeParse(JSON.parse(content));
    if(parsed.success){
     const val=parsed.data as Record<string,unknown>;
     const createdAt=typeof val.createdAt==='string'?val.createdAt:'';
     const id=typeof val.id==='string'?val.id:filename;
     items.push({item:parsed.data,sortKey:`${createdAt}|${id}`});
    }
   }catch{
    // Skip unreadable or corrupted files gracefully
   }
  }
  items.sort((a,b)=>b.sortKey.localeCompare(a.sortKey));
  return items.slice(0,Math.max(1,limit)).map(i=>i.item);
 }
}
