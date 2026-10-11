/* Click ChatGPT's own read-aloud action; never synthesize speech locally. */
(function(root){
  const read=['Read aloud','Read Aloud','朗读','朗讀','大声朗读','大聲朗讀'];
  const more=['More','More options','More actions','更多','更多选项','更多選項','更多操作'];
  const stop=['Stop reading','Stop reading aloud','Stop read aloud','Stop read-aloud','Pause read aloud','Pause reading','停止朗读','停止朗讀','暂停朗读','暫停朗讀','停止播放','暂停播放','暫停播放'];
  const sessions=new WeakMap();
  function remember(document,turn){
    sessions.set(document,{turn,path:document.location?.pathname,previous:new Map(Array.from(document.querySelectorAll('audio')).map(audio=>[audio,{paused:audio.paused,src:audio.currentSrc||audio.src}]))});
  }
  async function stopPlayback(document,waitFor){
    const session=sessions.get(document);
    const all=buttons(document);
    const explicit=all.filter(button=>VoiceDOM.matchesLabel(button,stop)||['stop-read-aloud-button','stop-read-aloud-turn-action-button','pause-read-aloud-button'].includes(button.getAttribute('data-testid')));
    if(explicit.length>1)return {ok:false,message:'发现多个朗读停止按钮，请在网页中选择。'};
    let control=explicit[0];
    if(!control && session){
      const scopes=Array.from(document.querySelectorAll('[data-testid*="read-aloud"],[data-testid="audio-player"],[aria-label="Audio player"],[aria-label="朗读播放器"]'));
      if(session.turn?.isConnected)scopes.push(session.turn);
      const scoped=[...new Set(scopes.flatMap(scope=>buttons(scope)))].filter(button=>VoiceDOM.matchesLabel(button,['Pause','Stop','暂停','停止','暫停'])&&button.getAttribute('data-testid')!=='stop-button');
      if(scoped.length===1)control=scoped[0];
    }
    if(control){
      control.click();sessions.delete(document);
      return {ok:true,stopped:true,message:'已请求停止 ChatGPT 朗读。'};
    }
    if(!session)return null;
    const completed=Array.from(document.querySelectorAll('audio')).some(audio=>{
      const before=session.previous.get(audio);
      return audio.ended&&(!before||before.src!==(audio.currentSrc||audio.src));
    });
    if(completed){sessions.delete(document);return null;}
    const active=Array.from(document.querySelectorAll('audio')).filter(audio=>{
      if(audio.paused||audio.ended)return false;
      const before=session.previous.get(audio);
      return !before||before.paused||before.src!==(audio.currentSrc||audio.src);
    });
    if(active.length===1){
      active[0].pause();
      if(!await waitFor(()=>active[0].paused,1000))return {ok:false,message:'已请求暂停朗读，但未确认停止。'};
      sessions.delete(document);
      return {ok:true,stopped:true,message:'ChatGPT 朗读已停止。'};
    }
    // Do not restart or click generation/recording Stop when playback is
    // still initializing or its player cannot be identified.
    if(session.path!==document.location?.pathname){sessions.delete(document);return null;}
    if(active.length>1)return {ok:false,message:'发现多个播放音频，未自动停止；请使用网页朗读控件。'};
    return {ok:false,message:'尚未识别到朗读停止控件。若朗读已自然结束，请刷新网页后重新按 X。'};
  }
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
    const stopped=await stopPlayback(document,waitFor);
    if(stopped)return stopped;
    const target=latest(document);
    if(!target) return {ok:false,message:'没有识别到回复标记，请确认当前对话已有 ChatGPT 回复。'};
    const direct=actions(target).filter(button=>VoiceDOM.matchesLabel(button,read)||button.getAttribute('data-testid')==='read-aloud-turn-action-button');
    if(direct.length===1){remember(document,target.turn);direct[0].click();return {ok:true,message:'已点击最新回复的 ChatGPT 朗读。再按 X 停止。'};}
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
    remember(document,target.turn);item.click();
    return {ok:true,message:'已点击最新回复菜单里的 ChatGPT 朗读。再按 X 停止。'};
  }
  root.ReadAloud={run};
  if(typeof module!=='undefined')module.exports=root.ReadAloud;
})(globalThis);
