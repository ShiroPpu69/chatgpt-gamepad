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
