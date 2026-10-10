const test = require('node:test');
const assert = require('node:assert/strict');
const dom = require('../extension/voice-dom.js');
function button(label, options = {}) {
  return { disabled: !!options.disabled, getAttribute: key => key === 'aria-label' ? label : null,
    getClientRects: () => options.hidden ? [] : [{}], textContent: '' };
}
function documentWith(...buttons) { return {querySelectorAll: () => buttons}; }
test('dictation is never mistaken for voice mode', () => {
  assert.equal(dom.locate(documentWith(button('Dictate'), button('Microphone'), button('听写')), 'start'), null);
});
test('English and Chinese voice labels are recognized', () => {
  for (const label of ['Start voice mode', 'Start new voice chat', '开始语音模式', '開始語音對話']) {
    const target = button(label);
    assert.equal(dom.locate(documentWith(target), 'start'), target);
  }
});
test('stop requires end conversation, not mute microphone', () => {
  const end = button('End conversation');
  assert.equal(dom.locate(documentWith(button('Mute microphone'), end), 'stop'), end);
});
test('ambiguous, hidden and disabled controls are rejected', () => {
  assert.equal(dom.locate(documentWith(button('Voice mode'), button('Start voice chat')), 'start'), null);
  assert.equal(dom.locate(documentWith(button('Voice mode', {hidden:true})), 'start'), null);
  assert.equal(dom.locate(documentWith(button('Voice mode', {disabled:true})), 'start'), null);
});
test('observed Chinese dictation tooltip starts dictation mode', () => {
  const mic = button('听写');
  assert.equal(dom.locate(documentWith(mic), 'start', 'dictation'), mic);
  assert.equal(dom.locate(documentWith(mic), 'start', 'voice'), null);
});
test('dictation never clicks the real-time voice control', () => {
  assert.equal(dom.locate(documentWith(button('Start voice mode')), 'start', 'dictation'), null);
});
test('dictation confirmation preserves speech instead of cancelling it', () => {
  const confirm = button('Submit dictation');
  assert.equal(dom.locate(documentWith(button('Cancel dictation'), confirm), 'stop', 'dictation'), confirm);
});
test('generic submit requires recording-specific context', () => {
  const submit = button('Submit');
  assert.equal(dom.locate(documentWith(submit), 'stop', 'dictation'), null);
  assert.equal(dom.locate(documentWith(button('Cancel dictation'), submit), 'stop', 'dictation'), submit);
});
test('tooltip is matched even when an icon has a different accessible label', () => {
  const mic = button('Microphone');
  const getAttribute = mic.getAttribute;
  mic.getAttribute = key => key === 'title' ? '听写' : getAttribute(key);
  assert.equal(dom.locate(documentWith(mic), 'start', 'dictation'), mic);
});
