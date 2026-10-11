/* Click ChatGPT's own read-aloud action; never synthesize speech locally. */
(function(root){
  const read=['Read aloud','Read Aloud','朗读','朗讀','大声朗读','大聲朗讀'];
  const more=['More','More options','More actions','更多','更多选项','更多選項','更多操作'];
  const enabled=button=>!button.disabled && button.getAttribute('aria-disabled')!=='true' && button.getClientRects().length>0;
  function buttons(scope){return Array.from(scope.querySelectorAll('button,[role="button"],[role="menuitem"]')).filter(enabled);}
  function latest(document){
    const messages=Array.from(document.querySelectorAll('[data-message-author-role="assistant"],[data-turn="assistant"],[data-conversation-role="assistant"],[data-chatgpt-agent-turn-start]'));
    const last=messages.at(-1);
    if(!last)return null;
    const turn=last.closest('[data-turn-key],[data-testid^="conversation-turn-"],article,section[data-turn]')||last.parentElement;
    return {turn,last};
  }
  function actions(target){
    return buttons(target.turn).filter(button=>{
      // New renderer groups user + assistant under one turn key. Only use
      // actions belonging to or following the assistant part of that group.
      if(!target.turn.hasAttribute('data-turn-key'))return true;
      return target.last.contains(button)||Boolean(target.last.compareDocumentPosition(button)&4);
    });
  }
  async function run(document,waitFor){
    const target=latest(document);
    if(!target) return {ok:false,message:'没有识别到回复标记，请确认当前对话已有 ChatGPT 回复。'};
    const direct=actions(target).filter(button=>VoiceDOM.matchesLabel(button,read)||button.getAttribute('data-testid')==='read-aloud-turn-action-button');
    if(direct.length===1){direct[0].click();return {ok:true,message:'已点击最新回复的 ChatGPT 朗读。'};}
    if(direct.length>1) return {ok:false,message:'最新回复有多个朗读按钮，未自动选择。'};
    const openers=actions(target).filter(button=>VoiceDOM.matchesLabel(button,more)||button.getAttribute('data-testid')==='more-turn-actions-button');
    if(openers.length!==1) return {ok:false,message:'没有找到最新回复的朗读或更多操作按钮，请把最新回复滚动到屏幕中。'};
    openers[0].click();
    const item=await waitFor(()=>{
      const menus=Array.from(document.querySelectorAll('[role="menu"],[data-radix-menu-content]'));
      const items=[...new Set(menus.flatMap(menu=>buttons(menu)))].filter(button=>VoiceDOM.matchesLabel(button,read));
      return items.length===1?items[0]:null;
    },3000);
    if(!item) return {ok:false,message:'已打开回复菜单，但没有找到可用的“朗读”。'};
    item.click();
    return {ok:true,message:'已点击最新回复菜单里的 ChatGPT 朗读。'};
  }
  root.ReadAloud={run};
  if(typeof module!=='undefined')module.exports=root.ReadAloud;
})(globalThis);
