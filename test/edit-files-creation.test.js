import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createTools } from '../lib/tools/index.js';
import { createChangeHistory, fileHash } from '../lib/change-history.js';
async function fixture(t) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'edit-files-creation-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 return fs.realpath(root);
}
test('missing third path identifies the entry before permissions or any writes',async t=>{
 const root=await fixture(t);let approvals=0;
 const tool=createTools({root,approve:async()=>{approvals++;return true},authorize:async()=>{approvals++}}).find(t=>t.name==='edit_files');
 await assert.rejects(tool.execute({edits:[{path:path.join(root,'server.js'),old_text:'',new_text:'server'},{path:path.join(root,'public/index.html'),old_text:'',new_text:'page'},{old_text:'',new_text:'services'}]}),/edits\[2\]\.path is required/);
 assert.equal(approvals,0);assert.deepEqual(await fs.readdir(root),[]);
});
test('absolute and relative file creation share durable undo and redo',async t=>{
 const root=await fixture(t),tools=Object.fromEntries(createTools({root,approve:async()=>true}).map(t=>[t.name,t]));
 const edits=[{path:path.join(root,'server.js'),old_text:'',new_text:'const x = 1;\n',expected_hash:null},{path:'public/index.html',old_text:'',new_text:'<h1>Home</h1>',expected_hash:null},{path:'public/services.html',old_text:'',new_text:'<h1>Services</h1>',expected_hash:null}];
 const result=await tools.edit_files.execute({edits});assert.equal(result.ok,true);assert.equal(result.paths.length,3);
 assert.equal(await fs.readFile(path.join(root,'public/services.html'),'utf8'),edits[2].new_text);
 await tools.change_history.execute({action:'undo',change_id:result.change_id});await assert.rejects(fs.stat(path.join(root,'server.js')),{code:'ENOENT'});
 await tools.change_history.execute({action:'redo',change_id:result.change_id});assert.equal(await fs.readFile(path.join(root,'server.js'),'utf8'),edits[0].new_text);
});
test('empty old_text never overwrites nonempty files or partially creates a batch',async t=>{
 const root=await fixture(t),history=createChangeHistory({root});await fs.writeFile(path.join(root,'existing.js'),'keep me');
 await assert.rejects(history.apply([{path:'new.js',old_text:'',new_text:'new'},{path:'existing.js',old_text:'',new_text:'replace'}]),/file is not empty/);
 assert.equal(await fs.readFile(path.join(root,'existing.js'),'utf8'),'keep me');await assert.rejects(fs.stat(path.join(root,'new.js')),{code:'ENOENT'});assert.equal(history.list().length,0);
});
test('empty files may be populated with hashes, and invalid edits fail explicitly',async t=>{
 const root=await fixture(t),history=createChangeHistory({root});await fs.writeFile(path.join(root,'empty.js'),'');
 await history.apply([{path:'empty.js',old_text:'',new_text:'filled',expected_hash:fileHash('')}]);
 for(const edits of [[null],[{path:'a',old_text:'',new_text:3}],[{path:' ',old_text:'',new_text:'x'}]])await assert.rejects(history.apply(edits),/edits\[0\]/);
 await assert.rejects(history.apply([{path:'missing.js',old_text:'match',new_text:'x'}]),/does not exist/);
 await assert.rejects(history.apply([{path:'../escape.js',old_text:'',new_text:'x'}]),/outside/);
});
