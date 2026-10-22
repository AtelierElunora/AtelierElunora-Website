import {ManagedIdentityCredential} from '@azure/identity';

export function modelClient(env=process.env, fetcher=fetch) {
  const endpoint=new URL(env.ELUNORA_CHAT_AZURE_ENDPOINT || 'https://unconfigured.openai.azure.com');
  if (endpoint.protocol!=='https:' || !/^[a-z0-9-]+\.openai\.azure\.com$/.test(endpoint.hostname) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname!=='/') throw Error('Use an Azure OpenAI resource HTTPS endpoint.');
  if (!env.ELUNORA_CHAT_AZURE_DEPLOYMENT || !/^[a-zA-Z0-9._-]{1,100}$/.test(env.ELUNORA_CHAT_AZURE_DEPLOYMENT)) throw Error('Configure the chat model deployment.');
  if (!env.ELUNORA_CHAT_AZURE_ENDPOINT) throw Error('Configure the chat model endpoint.');
  const credential=env.ELUNORA_CHAT_AZURE_KEY ? null : new ManagedIdentityCredential(env.ELUNORA_CHAT_IDENTITY_CLIENT_ID ? {clientId:env.ELUNORA_CHAT_IDENTITY_CLIENT_ID} : {});
  return async messages => {
    const token=credential ? await credential.getToken('https://ai.azure.com/.default') : null;
    const headers={'Content-Type':'application/json', ...(token ? {Authorization:`Bearer ${token.token}`} : {'api-key':env.ELUNORA_CHAT_AZURE_KEY})};
    const response=await fetcher(new URL('/openai/v1/chat/completions',endpoint),{
      method:'POST',headers,signal:AbortSignal.timeout(12000),redirect:'error',
      body:JSON.stringify({model:env.ELUNORA_CHAT_AZURE_DEPLOYMENT,messages,max_completion_tokens:128,store:false,
        response_format:{type:'json_schema',json_schema:{name:'faq_match',strict:true,schema:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false}}}})
    });
    if (!response.ok) throw Error('Chat provider unavailable');
    const text=await response.text();
    if (text.length>64000) throw Error('Chat response too large');
    const result=JSON.parse(text), choice=result.choices?.[0];
    if (choice?.finish_reason!=='stop' || choice.message?.refusal) return {id:'NONE',tokens:result.usage?.total_tokens};
    const match=JSON.parse(choice.message?.content || '{}');
    return {id:typeof match.id==='string' ? match.id : 'NONE',tokens:result.usage?.total_tokens};
  };
}
