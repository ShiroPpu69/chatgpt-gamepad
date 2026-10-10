const test=require('node:test');
const assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const {scroll}=require('../extension/conversation-scroll.js');
function fixture(outer=false) {
  const {document}=parseHTML('<html><body><aside id="sidebar"></aside><div id="wrapper"><main><div id="thread"><pre id="code"></pre><p>reply</p></div></main></div></body></html>');
  const view=document.defaultView;
  view.innerWidth=1200;view.innerHeight=800;
  view.getComputedStyle=element=>({overflowY:element.dataset.overflow||'visible',flexDirection:element.dataset.direction||'column'});
  const rect={left:260,right:1200,top:0,bottom:800,width:940,height:800};
  for(const el of document.querySelectorAll('*')) el.getBoundingClientRect=()=>rect;
  const frames=new Map();let id=0,time=0;
  view.performance={now:()=>time};
  view.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};
  view.cancelAnimationFrame=id=>frames.delete(id);
  function makeScroller(el,top=600,overflow='auto',blocked=false) {
    Object.assign(el,{clientHeight:800,scrollHeight:2500});el.dataset.overflow=overflow;
    let position=top;
    Object.defineProperty(el,'scrollTop',{configurable:true,get:()=>position,set:value=>{
      const size=el.scrollHeight-el.clientHeight,reversed=el.dataset.direction==='column-reverse';
      if(!blocked) position=Math.max(reversed?-size:0,Math.min(reversed?0:size,value));
    }});
    return el;
  }
  const thread=makeScroller(document.getElementById(outer?'wrapper':'thread'));
  const step=()=>{time+=16;const pending=[...frames.values()];frames.clear();for(const fn of pending) fn(time);};
  const finish=()=>{for(let i=0;i<100&&frames.size;i++) step();};
  return {document,thread,makeScroller,step,finish};
}
test('direct scrolling moves conversation without mouse coordinates',()=>{
  const f=fixture();const result=scroll(f.document,'scroll_down');
  assert.equal(result.method,'dom');assert.equal(result.moved,true);
  assert.equal(result.nativeWheel,undefined);f.finish();assert.equal(f.thread.scrollTop,760);
});
test('finds the scroll container outside main',()=>{
  const f=fixture(true);scroll(f.document,'scroll_up');f.finish();assert.equal(f.thread.scrollTop,440);
});
test('unmovable overflow wrapper falls back to the actual container',()=>{
  const f=fixture();f.makeScroller(f.document.getElementById('wrapper'),600,'hidden',true);
  assert.equal(scroll(f.document,'scroll_down').moved,true);f.finish();assert.equal(f.thread.scrollTop,760);
});
test('never scrolls sidebar or nested code blocks',()=>{
  const f=fixture();const code=f.makeScroller(f.document.getElementById('code'));
  const sidebar=f.makeScroller(f.document.getElementById('sidebar'));
  scroll(f.document,'scroll_down');f.finish();assert.equal(code.scrollTop,600);assert.equal(sidebar.scrollTop,600);
});
test('hold repeats accumulate distance instead of discarding unfinished movement',()=>{
  const f=fixture();scroll(f.document,'scroll_down');f.step();
  assert.ok(f.thread.scrollTop>601&&f.thread.scrollTop<760);
  scroll(f.document,'scroll_down');f.finish();assert.equal(f.thread.scrollTop,920);
});
test('reversing direction cancels the old destination',()=>{
  const f=fixture();scroll(f.document,'scroll_down');f.step();const top=f.thread.scrollTop;
  scroll(f.document,'scroll_up');f.finish();assert.ok(Math.abs(f.thread.scrollTop-(top-160))<0.1);
});
test('top and bottom return boundary without pretending movement',()=>{
  const f=fixture();f.thread.scrollTop=0;let result=scroll(f.document,'scroll_up');
  assert.equal(result.boundary,true);assert.equal(result.moved,false);
  f.thread.scrollTop=1700;result=scroll(f.document,'scroll_down');assert.equal(result.boundary,true);
});
test('manual scrolling wins over an unfinished controller animation',()=>{
  const f=fixture();scroll(f.document,'scroll_down');f.step();f.thread.scrollTop=1200;f.finish();assert.equal(f.thread.scrollTop,1200);
});
test('a replaced conversation container is discovered on the next press',()=>{
  const f=fixture();scroll(f.document,'scroll_down');f.thread.remove();
  const replacement=f.document.createElement('div');replacement.getBoundingClientRect=f.document.querySelector('main').getBoundingClientRect;
  f.document.querySelector('main').append(replacement);f.makeScroller(replacement);
  scroll(f.document,'scroll_up');f.finish();assert.equal(replacement.scrollTop,440);
});

test('ChatGPT reverse timeline scrolls upward from zero at the bottom',()=>{
  const f=fixture(true);f.thread.dataset.direction='column-reverse';f.thread.setAttribute('data-app-action-timeline-scroll','');f.thread.scrollTop=0;
  const result=scroll(f.document,'scroll_up');assert.equal(result.moved,true);
  f.finish();assert.equal(f.thread.scrollTop,-160);
});
test('reverse timeline down returns toward zero without positive offsets',()=>{
  const f=fixture(true);f.thread.dataset.direction='column-reverse';f.thread.scrollTop=-600;
  scroll(f.document,'scroll_down');f.finish();assert.equal(f.thread.scrollTop,-440);
});
test('reverse timeline boundaries are minus range at top and zero at bottom',()=>{
  const f=fixture(true);f.thread.dataset.direction='column-reverse';f.thread.scrollTop=0;
  assert.equal(scroll(f.document,'scroll_down').boundary,true);
  f.thread.scrollTop=-1700;assert.equal(scroll(f.document,'scroll_up').boundary,true);
});
test('reverse timeline hold repeats accumulate negative destinations',()=>{
  const f=fixture(true);f.thread.dataset.direction='column-reverse';f.thread.scrollTop=0;
  scroll(f.document,'scroll_up');f.step();scroll(f.document,'scroll_up');f.finish();assert.equal(f.thread.scrollTop,-320);
});
test('timeline marker works without a main element and beats unrelated wrappers',()=>{
  const f=fixture(true);f.thread.setAttribute('data-app-action-timeline-scroll','');
  f.document.querySelector('main').replaceWith(f.document.createElement('article'));
  scroll(f.document,'scroll_up');f.finish();assert.equal(f.thread.scrollTop,440);
});
