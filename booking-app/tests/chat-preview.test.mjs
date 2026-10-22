import test from 'node:test';
import assert from 'node:assert/strict';
import {privateIPv4,previewAddress,configuredChatOrigin} from '../chat/preview-config.mjs';
test('phone preview chooses a private interface and local preview remains loopback-only',()=>{
  const interfaces={utun0:[{address:'100.64.1.2',internal:false}],en1:[{address:'192.168.0.10',internal:false}],lo0:[{address:'127.0.0.1',internal:true}]};
  assert.equal(previewAddress({interfaces}).host,'127.0.0.1');
  assert.deepEqual(previewAddress({lan:true,interfaces}),{host:'192.168.0.10',port:4319,origin:'http://192.168.0.10:4319'});
  for(const address of ['8.8.8.8','100.64.1.2','172.32.0.1','192.168.999.1','::1'])assert.equal(privateIPv4(address),false);
  assert.throws(()=>previewAddress({lan:true,interfaces:{}}),/No private/);
  assert.throws(()=>previewAddress({port:80}),/port/);
});
test('LAN HTTP requires an explicit development preview; production still requires HTTPS',()=>{
  const origin='http://192.168.0.10:4319',env={NODE_ENV:'development',SHOPIFY_APP_URL:origin};
  assert.equal(configuredChatOrigin(env),undefined);
  assert.equal(configuredChatOrigin(env,origin),origin);
  assert.equal(configuredChatOrigin({...env,NODE_ENV:'production'},origin),undefined);
  assert.equal(configuredChatOrigin({...env,SHOPIFY_APP_URL:'http://8.8.8.8:4319'},'http://8.8.8.8:4319'),undefined);
  assert.equal(configuredChatOrigin({...env,SHOPIFY_APP_URL:'ftp://localhost'}),undefined);
  assert.equal(configuredChatOrigin({NODE_ENV:'test',SHOPIFY_APP_URL:'http://127.0.0.1:4317'}),'http://127.0.0.1:4317');
  assert.equal(configuredChatOrigin({NODE_ENV:'production',SHOPIFY_APP_URL:'https://app.example.azurewebsites.net'}),'https://app.example.azurewebsites.net');
});
