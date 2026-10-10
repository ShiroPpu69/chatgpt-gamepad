const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const code = fs.readFileSync(require('node:path').join(__dirname, '../extension/background.js'), 'utf8');
function setup(initial, responses = [], activeTabs = []) {
  let stored = initial;
  let created = 0;
  const requests = [];
  const injections = [];
  const updates = [];
  const urls = new Map();
  const noop = () => {};
  const context = vm.createContext({
    URL,
    LOCAL_CONFIG: {port: 19836, token: 'test'}, importScripts: noop,
    setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
    WebSocket: class {
      static OPEN = 1; static CONNECTING = 0;
      constructor() {this.readyState = 0;} send() {} close() {}
    },
    chrome: {
      storage: {session: {get: async () => ({voiceSession: stored}), set: async x => {stored = x.voiceSession;}}},
      tabs: {
        query: async () => activeTabs,
        get: async id => ({id, url:urls.get(id)||'https://chatgpt.com/', windowId: 10}),
        create: async () => ({id: ++created + 100, windowId: 10}),
        update: async (id, value) => {updates.push(value);},
        sendMessage: async (id, message) => {
          requests.push([id, message.action]);
          const result = responses.shift();
          if (result instanceof Error) throw result;
          if (result?.navigationStarted) urls.set(id,result.url);
          return result;
        },
        onRemoved: {addListener: noop}
      },
      windows: {update: async () => {}},
      scripting: {executeScript: async value => {injections.push(value);}},
      action: {setBadgeText: noop, setBadgeBackgroundColor: noop},
      alarms: {create: noop, onAlarm: {addListener: noop}},
      runtime: {onStartup: {addListener:noop}, onInstalled: {addListener:noop}, onMessage: {addListener:noop}}
    }
  });
  vm.runInContext(code, context);
  return {
    perform: action => vm.runInContext(`perform(${JSON.stringify(action)})`, context),
    get created() {return created;}, get stored() {return stored;}, requests, injections, updates
  };
}
test('first B creates a new chat and starts voice', async () => {
  const app = setup(null, [{state:'idle'}, {ok:true,state:'active'}]);
  const result = await app.perform('toggle');
  assert.equal(result.state, 'active');
  assert.equal(app.created, 1);
  assert.deepEqual(app.requests.map(x=>x[1]), ['probe','start']);
});
test('second B stops existing voice without a new tab', async () => {
  const app = setup({tabId: 8, state:'active'}, [{state:'active'}, {ok:true,state:'idle',sent:true}]);
  await app.perform('toggle');
  assert.equal(app.created, 0);
  assert.equal(app.stored.state, 'idle');
  assert.deepEqual(app.requests.map(x=>x[1]), ['probe','stop_send']);
});
test('B after an ended conversation creates another fresh chat', async () => {
  const app = setup({tabId: 8, state:'idle'}, [{state:'idle'}, {state:'idle'}, {ok:true,state:'active'}]);
  await app.perform('toggle');
  assert.equal(app.created, 1);
  assert.notEqual(app.stored.tabId, 8);
});
test('B after an inactive failed draft always creates a fresh conversation', async () => {
  const app = setup({tabId:8, state:'unknown'}, [{state:'idle'}, {state:'idle'}, {ok:true,state:'active'}]);
  await app.perform('toggle');
  assert.equal(app.created, 1);
  assert.notEqual(app.stored.tabId, 8);
});
test('unknown state after an active session blocks a second microphone', async () => {
  const app = setup({tabId:8, state:'active'}, [{state:'unknown'}]);
  await assert.rejects(app.perform('toggle'), /不明确/);
  assert.equal(app.created, 0);
});
test('B does not reuse an uninitialized inactive draft', async () => {
  const app = setup({tabId:8, state:'unknown'}, [{state:'unknown'}, {state:'unknown'}, {ok:true,state:'active'}]);
  await app.perform('toggle');
  assert.equal(app.created, 1);
  assert.deepEqual(app.requests.map(x=>x[1]), ['probe','probe','start']);
});
test('explicit stop with no session never opens a chat', async () => {
  const app = setup(null);
  await app.perform('stop');
  assert.equal(app.created, 0);
  assert.equal(app.stored.state, 'idle');
});
test('A starts dictation in the focused current conversation without a new tab', async () => {
  const app = setup(null, [{state:'idle'}, {ok:true,state:'active'}], [{id:7,url:'https://chatgpt.com/c/current',windowId:10}]);
  await app.perform('toggle_current');
  assert.equal(app.created, 0);
  assert.equal(app.stored.tabId, 7);
  assert.deepEqual(app.requests.map(x=>x[1]), ['probe','start']);
});
test('second A stops dictation in place and sends', async () => {
  const app = setup({tabId:7,state:'active',recordingKey:'a'}, [{state:'active'}, {ok:true,state:'idle',sent:true}], [{id:7,url:'https://chatgpt.com/c/current',windowId:10}]);
  await app.perform('toggle_current');
  assert.equal(app.created, 0);
  assert.deepEqual(app.requests.map(x=>x[1]), ['probe','stop_send']);
});
test('switching history is blocked during recording', async () => {
  const app = setup({tabId:7,state:'active'}, [{ok:false,state:'active'}]);
  const result = await app.perform('previous');
  assert.equal(result.ok, false);
  assert.equal(app.created, 0);
  assert.equal(app.requests.length, 1);
});
test('B never reuses an old conversation just because it has unsent text', async () => {
  const app = setup({tabId:8,state:'idle',pendingSend:true}, [{state:'idle'}, {state:'idle'}, {ok:true,state:'active'}]);
  await app.perform('toggle');
  assert.equal(app.created, 1);
  assert.notEqual(app.stored.tabId, 8);
  assert.deepEqual(app.requests.map(x=>x[1]), ['probe','probe','start']);
});
test('unconfirmed send is not automatically sent twice', async () => {
  const app = setup({tabId:8,state:'active'}, [{state:'active'}, {ok:false,state:'idle',sendAttempted:true}]);
  await app.perform('toggle');
  assert.equal(app.stored.recordingKey, null);
});
test('B,B,B creates, sends, then creates a different new conversation', async () => {
  const app = setup(null,[{state:'idle'},{ok:true,state:'active'},{state:'active'},{ok:true,state:'idle',sent:true},{state:'idle'},{state:'idle'},{ok:true,state:'active'}]);
  await app.perform('toggle');
  const first = app.stored.tabId;
  await app.perform('toggle');
  assert.equal(app.stored.recordingKey,null);
  await app.perform('toggle');
  assert.equal(app.created,2);
  assert.notEqual(app.stored.tabId,first);
});
test('A,A,B sends in place then B opens a fresh conversation', async () => {
  const app = setup(null,[{state:'idle'},{ok:true,state:'active'},{state:'active'},{ok:true,state:'idle',sent:true},{state:'idle'},{state:'idle'},{ok:true,state:'active'}],[{id:7,url:'https://chatgpt.com/c/current',windowId:10}]);
  await app.perform('toggle_current');
  await app.perform('toggle_current');
  assert.equal(app.created,0);
  await app.perform('toggle');
  assert.equal(app.created,1);
  assert.notEqual(app.stored.tabId,7);
});
test('B does not mistake an active A recording for the second B press', async () => {
  const app = setup({tabId:7,state:'active',recordingKey:'a'},[{state:'active'}]);
  const result = await app.perform('toggle');
  assert.equal(result.ok,false);
  assert.deepEqual(app.requests.map(x=>x[1]),['probe']);
});
test('scrolling current conversation does not navigate or affect recording', async () => {
  const app = setup({tabId:7,state:'active'},[{ok:true,state:'active'}]);
  await app.perform('scroll_up');
  assert.equal(app.created,0);
  assert.deepEqual(app.requests.map(x=>x[1]),['scroll_up']);
  assert.equal(app.updates.length,0);
});
test('right follows the site link without reloading or waiting for the destination composer', async () => {
  const app = setup({tabId:8,state:'idle'}, [{ok:true,state:'unknown',url:'https://chatgpt.com/c/older',navigationStarted:true}]);
  const result = await app.perform('next');
  assert.equal(result.ok,true);
  assert.equal(app.created,0);
  assert.deepEqual(app.requests.map(x=>x[1]),['next']);
  assert.equal(app.updates.some(update=>update.url),false);
});

test('a page missing its listener receives immediate injection before retrying', async () => {
  const app = setup(null,[new Error('Could not establish connection. Receiving end does not exist.'),{state:'idle'},{ok:true,state:'active'}]);
  await app.perform('toggle');
  assert.equal(app.injections.length,1);
  assert.equal(app.injections[0].injectImmediately,true);
  assert.equal(app.injections[0].target.tabId,101);
  assert.deepEqual(Array.from(app.injections[0].files),['voice-dom.js','composer-dom.js','history-dom.js','conversation-scroll.js','content.js']);
  assert.deepEqual(app.requests.map(x=>x[1]),['probe','probe','start']);
});

test('content scripts start before DOM or resource loading completes', () => {
  const manifest=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../extension/manifest.json'),'utf8'));
  assert.equal(manifest.content_scripts[0].run_at,'document_start');
});
