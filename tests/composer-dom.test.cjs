const test=require('node:test');
const assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const ComposerDOM=require('../extension/composer-dom.js');
function fixture(html) {
  const {document,HTMLElement}=parseHTML(`<html><body>${html}</body></html>`);
  HTMLElement.prototype.getClientRects=function(){return this.closest('[hidden]')?[]:[{}];};
  return document;
}
test('screenshot-style composer with no prompt-textarea id and an unlabeled submit arrow',()=>{
  const document=fixture('<main><form><button type="button">+</button><textarea>这个测试需要发送</textarea><button aria-label="听写" type="button"></button><button id="arrow" type="submit"><svg></svg></button></form></main>');
  assert.equal(ComposerDOM.text(document),'这个测试需要发送');
  assert.equal(ComposerDOM.sendButton(document).id,'arrow');
});
test('contenteditable composer without a form resolves its Chinese send button',()=>{
  const document=fixture('<main><div><div contenteditable="true" role="textbox"><p>听写完成的文字</p></div><button aria-label="发送提示" id="send"></button></div></main>');
  assert.equal(ComposerDOM.text(document),'听写完成的文字');
  assert.equal(ComposerDOM.sendButton(document).id,'send');
});
test('sidebar search and unrelated form submit are not the composer',()=>{
  const document=fixture('<aside><input type="text" placeholder="搜索"><button type="submit" id="search"></button></aside><main><form><textarea>文字</textarea><button id="send" type="submit"></button></form></main>');
  assert.equal(ComposerDOM.sendButton(document).id,'send');
});
test('ambiguous or disabled send controls are rejected',()=>{
  let document=fixture('<main><form><textarea>文字</textarea><button type="submit" disabled></button></form></main>');
  assert.equal(ComposerDOM.sendButton(document),null);
  document=fixture('<main><form><textarea>文字</textarea><button aria-label="Send"></button><button aria-label="发送"></button></form></main>');
  assert.equal(ComposerDOM.sendButton(document),null);
});
