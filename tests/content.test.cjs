const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const VoiceDOM = require('../extension/voice-dom.js');
const source = fs.readFileSync(path.join(__dirname, '../extension/content.js'), 'utf8');

function setup(history = [], currentPath = '/', sendLabel = 'Send message') {
  let listener;
  let recording = false;
  let starts = 0;
  let confirmations = 0;
  let sends = 0;
  let text = '';
  function button(label, click) {
    return {disabled:false, getClientRects:()=>[{}], getAttribute:key=>key==='aria-label'?label:null, textContent:'', click};
  }
  const start = button('听写', () => {recording=true; starts++;});
  const confirm = button('Submit dictation', () => {recording=false; confirmations++; text='转写完成的文字';});
  const cancel = button('Cancel dictation', () => {throw Error('Must never discard speech');});
  const send = button(sendLabel, () => {sends++; text='';});
  const input = {get value() {return text;}, closest:()=>null};
  const context = vm.createContext({
    VoiceDOM, URL, setInterval:()=>{}, setTimeout,
    HistoryDOM: {recentLinks:()=>history},
    ComposerDOM: {input:()=>input,text:()=>text,sendButton:()=>send},
    location: {pathname:currentPath,href:'https://chatgpt.com'+currentPath,origin:'https://chatgpt.com'},
    document: {readyState:'loading',querySelectorAll:selector=>selector.includes('a[href]')?history:recording?[confirm,cancel]:[start,send], querySelector:selector=>selector==='#prompt-textarea'?input:null},
    chrome: {runtime: {onMessage:{addListener:fn=>{listener=fn;}}, sendMessage:async()=>{}}}
  });
  vm.runInContext(source, context);
  return {
    action: action => new Promise(resolve => listener({type:'voice-control', action, mode:'dictation'}, {}, resolve)),
    get starts() {return starts;}, get confirmations() {return confirmations;}, get sends() {return sends;}
  };
}
test('B starts an available dictation microphone while document is still loading', async () => {
  const app = setup();
  const result = await app.action('start');
  assert.equal(result.ok, true);
  assert.equal(result.state, 'active');
  assert.equal(app.starts, 1);
});
function historyLink(path) {return {href:'https://chatgpt.com'+path,getClientRects:()=>[{}],click(){this.clicked=true;}};}
test('up selects the adjacent conversation above the current one', async () => {
  const app = setup([historyLink('/c/newer'),historyLink('/c/current'),historyLink('/c/older')],'/c/current');
  const result = await app.action('previous');
  assert.equal(result.url,'https://chatgpt.com/c/newer');
  assert.equal(result.navigationStarted,true);
});
test('down selects the adjacent conversation below the current one', async () => {
  const app = setup([historyLink('/c/newer'),historyLink('/c/current'),historyLink('/c/older')],'/c/current');
  const result = await app.action('next');
  assert.equal(result.url,'https://chatgpt.com/c/older');
  assert.equal(result.navigationStarted,true);
});

test('history uses the page link click while the document is loading', async () => {
  const link=historyLink('/c/first');
  const app=setup([link]);
  await app.action('next');
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(link.clicked,true);
});
test('history boundaries never wrap or open a different tab', async () => {
  const app = setup([historyLink('/c/first')],'/c/first');
  const result = await app.action('previous');
  assert.equal(result.boundary,true);
  assert.equal(result.url,undefined);
});
test('history navigation preserves an unsent transcription by refusing to switch', async () => {
  const app = setup([historyLink('/c/other')]);
  await app.action('start');
  await app.action('stop');
  const result = await app.action('next');
  assert.equal(result.ok,false);
  assert.match(result.message,/未发送文字/);
});
test('second B confirms recording without cancellation or automatic send', async () => {
  const app = setup();
  await app.action('start');
  const result = await app.action('stop');
  assert.equal(result.ok, true);
  assert.equal(result.state, 'idle');
  assert.equal(app.confirmations, 1);
  assert.equal(app.sends, 0);
});
test('replayed start does not click an already active microphone again', async () => {
  const app = setup();
  await app.action('start');
  await app.action('start');
  assert.equal(app.starts, 1);
});
test('B stops recording, waits for transcription, and sends exactly once', async () => {
  const app = setup();
  await app.action('start');
  const result = await app.action('stop_send');
  assert.equal(result.ok,true);
  assert.equal(result.sent,true);
  assert.equal(app.confirmations,1);
  assert.equal(app.sends,1);
});
test('Chinese send-prompt button submits the completed dictation', async () => {
  const app = setup([], '/', '发送提示');
  await app.action('start');
  const result = await app.action('stop_send');
  assert.equal(result.sent,true);
  assert.equal(app.sends,1);
});
