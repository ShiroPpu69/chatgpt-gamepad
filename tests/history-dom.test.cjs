const test = require('node:test');
const assert = require('node:assert/strict');
const {parseHTML} = require('linkedom');
const {recentLinks} = require('../extension/history-dom.js');
function fixture(html) {
  const {document,HTMLElement} = parseHTML(`<html><body>${html}</body></html>`);
  HTMLElement.prototype.getClientRects = function() {return this.closest('[hidden]')?[]:[{}];};
  return document;
}
const location = {href:'https://chatgpt.com/c/one',origin:'https://chatgpt.com'};
const paths = document => recentLinks(document,location).map(link=>new URL(link.href,location.href).pathname);
test('only Recent is navigable, excluding Pinned and Projects sections', () => {
  const document = fixture('<aside><h2>置顶</h2><a href="/c/pin">pin</a><h2>项目</h2><a href="/c/project">project</a><h2>最近</h2><a href="/c/one">one</a><a href="/c/two">two</a></aside>');
  assert.deepEqual(paths(document),['/c/one','/c/two']);
});
test('English sections and date subheadings preserve visible ordering', () => {
  const document = fixture('<nav><h2>Pinned</h2><a href="/c/pin">pin</a><h2>Projects</h2><a href="/c/project">project</a><h2>Your chats</h2><h3>Today</h3><a href="/c/one">one</a><h3>Yesterday</h3><a href="/c/two">two</a></nav>');
  assert.deepEqual(paths(document),['/c/one','/c/two']);
});
test('explicit history container stays Recent even after a preceding Pinned header', () => {
  const document = fixture('<aside><h2>Pinned</h2><a href="/c/pin">pin</a><div id="history"><a href="/c/one">one</a><a href="/c/two">two</a></div></aside>');
  assert.deepEqual(paths(document),['/c/one','/c/two']);
});
test('pinned duplicate and project rows inside Recent are also excluded', () => {
  const document = fixture('<aside><section aria-label="Pinned"><a href="/c/pin">pin</a></section><div id="history"><a href="/c/pin">duplicate</a><div data-testid="project-chat"><a href="/c/project">project</a></div><a href="/g/project/c/other">project path</a><a href="/c/one">one</a></div></aside>');
  assert.deepEqual(paths(document),['/c/one']);
});
test('unclassified sidebar never falls back to pinned-looking global URLs', () => {
  assert.deepEqual(paths(fixture('<nav><a href="/c/unclassified">chat</a></nav>')),[]);
});
test('hidden chats and duplicate links do not alter recent order', () => {
  const document = fixture('<div id="history"><a href="/c/one">one</a><a href="/c/one">duplicate</a><div hidden><a href="/c/hidden">hidden</a></div><a href="/c/two">two</a></div>');
  assert.deepEqual(paths(document),['/c/one','/c/two']);
});
test('conversation titles that equal section names are not section headings', () => {
  const document = fixture('<div id="history"><a href="/c/one"><span>Projects</span></a><a href="/c/two"><span>Pinned</span></a><a href="/c/three">three</a></div>');
  assert.deepEqual(paths(document),['/c/one','/c/two','/c/three']);
});
test('collapsed pinned section still excludes a pinned duplicate from Recent', () => {
  const document = fixture('<aside><section aria-label="Pinned" hidden><a href="/c/pin">pin</a></section><div id="history"><a href="/c/pin">duplicate</a><a href="/c/one">one</a></div></aside>');
  assert.deepEqual(paths(document),['/c/one']);
});
