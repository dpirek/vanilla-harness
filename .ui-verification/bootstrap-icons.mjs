import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const targets = await (await fetch('http://127.0.0.1:9236/json')).json();
const ws = new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);
let id=0; const pending=new Map(); const errors=[];
ws.onmessage=({data})=>{const m=JSON.parse(data); if(m.method==='Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text); if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}};
const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result.value;
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});


await send('Page.navigate',{url:'http://localhost:8010/models'});
await new Promise(r=>setTimeout(r,2000));
const report = await evaluate(`(async () => {
  const icons = [...document.querySelectorAll("svg.bsIcon use")];
  const refs = [...new Set(icons.map(icon=>icon.getAttribute("href")))];
  const response = await fetch("/vendor/bootstrap-icons/bootstrap-icons.svg");
  const sprite = new DOMParser().parseFromString(await response.text(), "image/svg+xml");
  return {
    count: icons.length,
    local: refs.every(ref=>ref.startsWith("/vendor/bootstrap-icons/")),
    missing: refs.filter(ref=>!sprite.getElementById(ref.split("#")[1])),
    emptyVisible: icons.filter(use=>use.closest("svg").getBoundingClientRect().width > 0 && use.getBBox().width === 0).map(use=>use.getAttribute("href")),
  };
})()`);
assert.ok(report.count > 20, JSON.stringify(report));
assert.equal(report.local,true);
assert.deepEqual(report.missing,[]);
assert.deepEqual(report.emptyVisible,[]);
await evaluate('document.querySelector("#providerShortcutButton").click()');
assert.equal(await evaluate('document.querySelector("#closeSettingsButton use").getAttribute("href")'),'/vendor/bootstrap-icons/bootstrap-icons.svg#x-lg');
await evaluate('document.querySelector("#closeSettingsButton").click()');
assert.equal(await evaluate('document.querySelector("#settingsDialog").open'),false);
await fs.writeFile('screenshots/bootstrap-models.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
await send('Page.navigate',{url:'http://localhost:8010/'});
await new Promise(r=>setTimeout(r,1500));
assert.equal(await evaluate('document.querySelector("#sendButton use").getAttribute("href")'),'/vendor/bootstrap-icons/bootstrap-icons.svg#arrow-up');
await fs.writeFile('screenshots/bootstrap-chat.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
assert.deepEqual(errors,[]);
console.log(JSON.stringify({ ...report, result: "Modal interaction, local sprite references, rendered icons, chat controls, and runtime errors checked." }));
await send('Browser.close');
ws.close();
