import {createOllamaInterpreter,type LanguageInterpreter} from './interpretation';
import {createBifrostInterpreter} from './bifrost-interpreter';

export function createLanguageInterpreter(env:NodeJS.ProcessEnv=process.env,fetcher:typeof fetch=fetch):LanguageInterpreter|undefined{
 if(!env.LANGUAGE_MODE||env.LANGUAGE_MODE==='rules')return;
 if(env.LANGUAGE_MODE==='bifrost')return createBifrostInterpreter(env,fetcher);
 // Retained for existing local users/tests; B05's selected hybrid path is bifrost.
 if(env.LANGUAGE_MODE==='ollama')return createOllamaInterpreter(env,fetcher);
 throw new Error('LANGUAGE_MODE must be rules, bifrost or ollama');
}
