const test=require('node:test'),assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
global.VoiceDOM=require('../extension/voice-dom.js');
const {run}=require('../extension/read-aloud.js');
function fixture(html){
  const {document}=parseHTML(html);
  for(const button of document.querySelectorAll('button,[role="menuitem"]')){
    button.getClientRects=()=>[{}];button.click=()=>{button.clicked=(button.clicked||0)+1;};
  }
  return document;
}
const wait=async predicate=>predicate();
test('X reads latest assistant reply, not old or user messages',async()=>{
  const d=fixture('<main><article><div data-message-author-role="assistant"></div><button id="old" aria-label="朗读"></button></article><article><div data-message-author-role="user"></div><button aria-label="朗读"></button></article><article><div data-message-author-role="assistant"></div><button id="new" aria-label="Read aloud"></button></article></main>');
  assert.equal((await run(d,wait)).ok,true);assert.equal(d.querySelector('#new').clicked,1);assert.equal(d.querySelector('#old').clicked,undefined);
});
test('opens only latest reply menu and selects native read aloud',async()=>{
  const d=fixture('<article><div data-message-author-role="assistant"></div><button id="more" aria-label="更多"></button></article><div role="menu"><div role="menuitem">朗读</div><div role="menuitem">删除</div></div>');
  assert.equal((await run(d,wait)).ok,true);assert.equal(d.querySelector('#more').clicked,1);assert.equal(d.querySelector('[role="menuitem"]').clicked,1);
});
test('missing read action does not click unrelated controls',async()=>{
  const d=fixture('<article><div data-message-author-role="assistant"></div><button aria-label="复制"></button></article>');
  assert.equal((await run(d,wait)).ok,false);assert.equal(d.querySelector('button').clicked,undefined);
});
test('no assistant reply and ambiguous buttons fail clearly',async()=>{
  assert.equal((await run(fixture('<main></main>'),wait)).ok,false);
  const d=fixture('<article><div data-message-author-role="assistant"></div><button aria-label="朗读"></button><button aria-label="Read aloud"></button></article>');
  assert.equal((await run(d,wait)).ok,false);
});
test('new grouped renderer ignores the earlier user footer',async()=>{
  const d=fixture('<main><div data-turn-key="one"><div data-user-message-bubble>user</div><button id="user" aria-label="朗读"></button><div data-conversation-role="assistant">reply</div><div class="turn-action-controls"><button id="reply" aria-label="朗读"></button></div></div></main>');
  assert.equal((await run(d,wait)).ok,true);assert.equal(d.querySelector('#reply').clicked,1);assert.equal(d.querySelector('#user').clicked,undefined);
});
test('agent marker and testid action work without old message attributes',async()=>{
  const d=fixture('<main><div data-turn-key="one"><div data-chatgpt-agent-turn-start></div><p>answer</p><button data-testid="read-aloud-turn-action-button"></button></div></main>');
  assert.equal((await run(d,wait)).ok,true);assert.equal(d.querySelector('button').clicked,1);
});
test('section-level assistant role identifies the latest turn',async()=>{
  const d=fixture('<main><section data-turn="assistant"><button aria-label="朗读"></button></section></main>');
  assert.equal((await run(d,wait)).ok,true);
});
test('second X stops native read aloud instead of restarting it',async()=>{
  const d=fixture('<article><div data-turn="assistant"></div><button aria-label="朗读"></button></article>');
  const button=d.querySelector('button');await run(d,wait);button.setAttribute('aria-label','停止朗读');
  assert.equal((await run(d,wait)).stopped,true);assert.equal(button.clicked,2);
  button.setAttribute('aria-label','朗读');assert.equal((await run(d,wait)).ok,true);assert.equal(button.clicked,3);
});
test('second X can stop a Pause control in the same native response player',async()=>{
  const d=fixture('<article data-turn="assistant"><button aria-label="Read aloud"></button></article>');
  const button=d.querySelector('button');await run(d,wait);button.setAttribute('aria-label','Pause');
  assert.equal((await run(d,wait)).stopped,true);assert.equal(button.clicked,2);
});
test('native audio fallback only pauses the audio started by read aloud',async()=>{
  const d=fixture('<article data-turn="assistant"><button aria-label="Read aloud"></button></article><audio id="music"></audio>');
  const music=d.querySelector('audio');music.paused=false;music.src='music';music.pause=()=>{throw Error('unrelated audio');};
  await run(d,wait);const audio=d.createElement('audio');audio.paused=false;audio.pause=()=>{audio.paused=true;};d.append(audio);
  assert.equal((await run(d,wait)).stopped,true);assert.equal(audio.paused,true);
});
test('unknown playback never clicks Stop generating or restarts read aloud',async()=>{
  const d=fixture('<article data-turn="assistant"><button id="read" aria-label="Read aloud"></button><button id="generate" data-testid="stop-button" aria-label="Stop"></button></article>');
  await run(d,wait);assert.equal((await run(d,wait)).ok,false);
  assert.equal(d.querySelector('#read').clicked,1);assert.equal(d.querySelector('#generate').clicked,undefined);
});
