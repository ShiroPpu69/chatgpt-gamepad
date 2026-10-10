/* Resolve the actual composer instead of assuming every layout has #prompt-textarea. */
(function(root) {
  const sendNames = ['Send message','Send prompt','Send','Submit','发送','发送消息','发送提示','发送信息','提交','提交消息','傳送','傳送訊息','傳送提示','發送','發送訊息'];
  const normalize = value => String(value || '').trim().replace(/\s+/g,' ').toLowerCase();
  function visible(element) {return element && element.getClientRects().length > 0;}
  function enabled(element) {return !element.disabled && element.getAttribute('aria-disabled') !== 'true';}
  function input(document) {
    const known = document.querySelector('#prompt-textarea');
    if (visible(known)) return known;
    const main = document.querySelector('main,[role="main"]') || document;
    const candidates = Array.from(main.querySelectorAll('textarea,input[type="text"],input:not([type]),[contenteditable="true"],[contenteditable="plaintext-only"],[role="textbox"]')).filter(element => {
      if (!visible(element) || !enabled(element) || element.closest('nav,aside,[role="dialog"]')) return false;
      const description = `${element.getAttribute('aria-label') || ''} ${element.getAttribute('placeholder') || ''} ${element.getAttribute('type') || ''}`;
      return !/search|搜索|搜尋|查找|password|email/i.test(description);
    });
    // contenteditable + role=textbox can select the same element only once.
    return candidates.length === 1 ? candidates[0] : null;
  }
  function text(document) {
    const element = input(document);
    if (!element) return '';
    const value = element.matches('textarea,input') ? element.value : element.textContent;
    return String(value ?? '').trim();
  }
  function buttons(scope) {return Array.from(scope.querySelectorAll('button,[role="button"]')).filter(element=>visible(element)&&enabled(element));}
  function semantic(button) {
    if (['send-button','composer-send-button','composer-submit-button'].includes(button.getAttribute('data-testid'))) return true;
    const labels = ['aria-label','title','data-tooltip-content'].map(key=>normalize(button.getAttribute(key)));
    labels.push(normalize(button.textContent));
    return sendNames.some(name=>labels.includes(normalize(name)));
  }
  function sendButton(document) {
    const element = input(document);
    if (!element) return null;
    const form = element.closest('form');
    const scopes = [];
    if (form) scopes.push(form);
    else {
      for (let parent=element.parentElement;parent;parent=parent.parentElement) {
        scopes.push(parent);
        if (parent.matches('main,[role="main"],body')) break;
      }
    }
    for (const scope of scopes) {
      const available = buttons(scope);
      const named = available.filter(semantic);
      if (named.length > 1) return null;
      if (named.length === 1) return named[0];
      // An unlabeled arrow can still be the unique submit button of this composer.
      const submits = available.filter(button=>button.matches('button[type="submit"]'));
      if (submits.length > 1) return null;
      if (submits.length === 1) return submits[0];
    }
    return null;
  }
  root.ComposerDOM = {input,text,sendButton};
  if(typeof module!=='undefined') module.exports=root.ComposerDOM;
})(globalThis);
