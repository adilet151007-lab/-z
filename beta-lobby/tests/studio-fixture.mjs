import {PlatformStore,memoryBackend} from '../platform-store.mjs';
import {Platform} from '../platform-domain.mjs';
import {createPortalServer} from '../portal-server.mjs';
export async function studioFixture(userId='owner',fixedPort=0){
 const secret='studio-synthetic-owner-secret-at-least-32-characters',store=await new PlatformStore(memoryBackend()).init(),platform=new Platform(store,{ownerCode:secret});
 for(const id of ['owner','teacher','student'])await platform.authenticate({id:'google:'+id,name:id,email:id+'@example.test'});await platform.redeem('google:owner',secret);const invite=await platform.invite('google:owner');await platform.redeem('google:teacher',invite.code);
 let nonce;const oauth={generateAuthUrl(p){nonce=p.nonce;return 'https://accounts.google.com/o/oauth2/v2/auth?state='+p.state;},getToken:async()=>({tokens:{id_token:'synthetic'}}),verifyIdToken:async()=>({getPayload:()=>({sub:userId,name:userId,email:userId+'@example.test',email_verified:true,nonce})})};
 const server=createPortalServer({platformStore:store,publicOrigin:'http://127.0.0.1:3000',sessionSecret:secret,clientId:'synthetic-client',clientSecret:'synthetic-secret',oauth}),port=await server.listen(fixedPort,'127.0.0.1'),origin='http://127.0.0.1:'+port;
 const flow=await fetch(origin+'/auth/google',{redirect:'manual'}),state=new URL(flow.headers.get('location')).searchParams.get('state'),response=await fetch(origin+'/auth/google/callback?state='+state+'&code=synthetic',{redirect:'manual',headers:{Cookie:flow.headers.getSetCookie()[0].split(';')[0]}}),cookie=response.headers.getSetCookie().find(c=>c.startsWith('cq_account=')).split(';')[0];
 async function api(path,data){return fetch(origin+'/api/platform/'+path,{method:data===undefined?'GET':'POST',headers:{Cookie:cookie,Origin:'http://127.0.0.1:3000','X-CQ-Lobby':'1',...(data===undefined?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data)});}
 return {store,platform,server,origin,cookie,api};
}
