/* Scroll the actual conversation container without mouse or keyboard injection. */
(function(root) {
  let animation=null;
  const excluded='aside,nav,[role="dialog"],textarea,[contenteditable="true"],pre,[data-testid="history-sidebar"],#history';
  const clamp=(value,range)=>Math.max(range.min,Math.min(range.max,value));
  function bounds(element,style) {
    const size=Math.max(0,element.scrollHeight-element.clientHeight);
    const reversed=style(element).flexDirection==='column-reverse' || element.scrollTop<0;
    return reversed?{min:-size,max:0}:{min:0,max:size};
  }
  function candidates(document,style) {
    const view=document.defaultView;
    if(!view?.innerWidth || !view?.innerHeight) return [];
    const mains=Array.from(document.querySelectorAll('[data-app-action-timeline-scroll],main,[role="main"]')).filter(main=>{
      const r=main.getBoundingClientRect();
      return r.width>200 && r.height>100 && r.bottom>0 && r.top<view.innerHeight;
    });
    const found=new Map();
    for(const main of mains) {
      const rect=main.getBoundingClientRect();
      const pool=new Set([main,...main.querySelectorAll('*')]);
      for(let parent=main.parentElement;parent;parent=parent.parentElement) pool.add(parent);
      for(const fraction of [0.25,0.5,0.75]) {
        const x=Math.min(view.innerWidth-1,Math.max(0,rect.left+rect.width*0.6));
        const y=Math.min(view.innerHeight-1,Math.max(0,rect.top+Math.min(rect.height,view.innerHeight)*fraction));
        for(const hit of document.elementsFromPoint?.(x,y)||[]) {
          if(!main.contains(hit) && !hit.contains(main)) continue;
          for(let parent=hit;parent;parent=parent.parentElement) pool.add(parent);
        }
      }
      for(const element of pool) {
        if(element.closest(excluded)) continue;
        if(!(element.scrollHeight-element.clientHeight>2) || element.clientHeight<100) continue;
        const r=element.getBoundingClientRect();
        const width=Math.max(0,Math.min(r.right,view.innerWidth)-Math.max(r.left,0));
        const height=Math.max(0,Math.min(r.bottom,view.innerHeight)-Math.max(r.top,0));
        if(width<Math.min(400,rect.width*0.55) || height<100) continue;
        const css=style(element);
        if(element!==document.scrollingElement && !/^(auto|scroll|overlay|hidden)$/.test(css.overflowY)) continue;
        if(css.visibility==='hidden' || css.display==='none') continue;
        const score=(element.hasAttribute('data-app-action-timeline-scroll')?5000000:0)+((element===main || element.contains(main))?1000000:0)+width*height;
        found.set(element,Math.max(found.get(element)||0,score));
      }
    }
    return [...found].sort((a,b)=>b[1]-a[1]).map(item=>item[0]);
  }
  function write(element,top) {
    if(element.scrollTo) element.scrollTo({top,behavior:'instant'});
    else element.scrollTop=top;
  }
  function cancel(view) {
    if(animation?.frame!=null) view.cancelAnimationFrame?.(animation.frame);
    animation=null;
  }
  function animate(view,element,target,style) {
    cancel(view);
    const job={element,target:clamp(target,bounds(element,style)),last:element.scrollTop,frame:null};
    animation=job;
    let lastTime=view.performance?.now()||0;
    const tick=time=>{
      if(animation!==job || !element.isConnected) return;
      if(Math.abs(element.scrollTop-job.last)>3) {animation=null;return;}
      job.target=clamp(job.target,bounds(element,style));
      const dt=Math.min(48,Math.max(1,time-lastTime));lastTime=time;
      const remaining=job.target-element.scrollTop;
      write(element,Math.abs(remaining)<0.6?job.target:element.scrollTop+remaining*(1-Math.exp(-dt/55)));
      const actual=element.scrollTop;
      if(Math.abs(actual-job.target)<0.6) {write(element,job.target);animation=null;return;}
      if(actual===job.last && Math.abs(remaining)>1) {animation=null;return;}
      job.last=actual;
      job.frame=view.requestAnimationFrame(tick);
    };
    if(!view.requestAnimationFrame || view.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      write(element,job.target);animation=null;
    } else job.frame=view.requestAnimationFrame(tick);
  }
  function scroll(document,direction,style=document.defaultView?.getComputedStyle?.bind(document.defaultView)) {
    if(!['scroll_up','scroll_down'].includes(direction)) return {ok:false,message:'未知滚动方向。'};
    if(!style) return {ok:false,message:'无法读取聊天正文布局。'};
    const view=document.defaultView,sign=direction==='scroll_up'?-1:1;
    let boundary=false;
    for(const element of candidates(document,style)) {
      const top=element.scrollTop,range=bounds(element,style);
      if((sign<0 && top<=range.min+0.5) || (sign>0 && top>=range.max-0.5)) {boundary=true;continue;}
      const previousTarget=animation?.element===element && Math.sign(animation.target-top)===sign?animation.target:top;
      // Verify real movement so overflow wrappers cannot report false success.
      write(element,clamp(top+sign,range));
      if(Math.abs(element.scrollTop-top)<0.1) continue;
      const distance=Math.max(100,Math.min(180,element.clientHeight*0.2));
      animate(view,element,previousTarget+sign*distance,style);
      return {ok:true,moved:true,method:'dom',message:'聊天正文正在平滑滚动。'};
    }
    if(boundary) {
      cancel(view);
      return {ok:true,moved:false,boundary:true,method:'dom',message:sign<0?'聊天正文已到顶部。':'聊天正文已到底部。'};
    }
    return {ok:false,moved:false,method:'dom',message:'尚未找到可滚动的聊天正文，请打开有长回复的对话。'};
  }
  root.ConversationScroll={scroll,candidates};
  if(typeof module!=='undefined') module.exports=root.ConversationScroll;
})(globalThis);
