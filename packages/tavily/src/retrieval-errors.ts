export class TavilyRetrievalError extends Error {}

export function retrievalFailureMessage(error:unknown):string{
 if(error instanceof TavilyRetrievalError)return error.message;
 if(error instanceof Error&&['AbortError','TimeoutError'].includes(error.name))return 'Tavily retrieval timed out. No retry was made; the attempted search counts toward the server budget.';
 return 'Tavily retrieval failed or the network is unavailable. No retry was made; the attempted search counts toward the server budget.';
}
