import {test} from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {createApi} from '../examples/sample-crm-app/api.mjs';
test('server API enforces role, session expiration, forged-cookie rejection and exact data',async()=>{
 let now=0;const api=createApi({now:()=>now});const server=http.createServer(async(req,res)=>{await api(req,res);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${server.address().port}`;
 try{
  assert.equal((await fetch(url+'/api/accounts/export')).status,401);
  assert.equal((await fetch(url+'/api/accounts/export',{headers:{cookie:'crm-session=forged'}})).status,401);
  for(const role of ['admin','manager','sales','viewer']){
   const login=await fetch(url+'/api/session',{method:'POST',body:JSON.stringify({email:`${role}@example.com`,password:'password'})});
   const cookie=login.headers.get('set-cookie').split(';')[0];const response=await fetch(url+'/api/accounts/export',{headers:{cookie}});
   assert.equal(response.status,['admin','manager'].includes(role)?200:403);
   if(response.status===200)assert.deepEqual((await response.json()).accounts.map(a=>a.id),['a1','a2']);
   now+=3600001;assert.equal((await fetch(url+'/api/accounts/export',{headers:{cookie}})).status,401);
  }
  assert.equal((await fetch(url+'/api/session',{method:'POST',body:'not-json'})).status,400);
   assert.equal((await fetch(url+'/api/session',{method:'POST',body:'null'})).status,400);
 }finally{await new Promise(r=>server.close(r));}
});
