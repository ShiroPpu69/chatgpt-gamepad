let recording=null,chat=1;
const name=document.getElementById('chat-name'),composer=document.getElementById('composer'),messages=document.getElementById('messages');
function title(){name.textContent='Sample conversation '+chat;}
function act(key){
  if(key==='up'||key==='down'){
    messages.scrollBy({top:key==='up'?-170:170,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});return;
  }
  if(key==='left'||key==='right'){
    if(recording){composer.textContent='Finish dictation with '+recording.toUpperCase()+' before switching.';return;}
    chat=Math.max(1,chat+(key==='left'?-1:1));title();composer.textContent='Switched to sample conversation '+chat;return;
  }
  if(recording&&recording!==key){composer.textContent='Press '+recording.toUpperCase()+' to finish this recording first.';return;}
  if(recording){
    const p=document.createElement('p');p.textContent='Sample prompt sent: “Help me think through my next idea.”';messages.append(p);
    recording=null;composer.textContent='Sent. Press B for a new chat, or A to keep talking here.';messages.scrollTop=messages.scrollHeight;
  }else{
    if(key==='b'){chat++;title();messages.replaceChildren();}
    recording=key;composer.textContent='Listening illustration… press '+key.toUpperCase()+' again to send.';
  }
}
document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>act(button.dataset.action)));
