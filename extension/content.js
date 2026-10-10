/* Never reads chat contents or audio. Only identifies and clicks voice controls. */
(() => {
  if (globalThis.__Q36_CONTENT_VERSION === '0.7.1') return;
  globalThis.__Q36_CONTENT_VERSION = '0.7.1';
  let busy = false;
  let mode = "dictation";
  let recordingRequested = false;
  let sendAttempted = false;
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const find = kind => VoiceDOM.locate(document, kind, mode, recordingRequested);
  function state() {
    if (find("stop")) return "active";
    if (find("start")) return "idle";
    return "unknown";
  }
  function composerText() {
    return ComposerDOM.text(document);
  }
  function sendButton() {
    return ComposerDOM.sendButton(document);
  }
  async function sendTranscription() {
    let previous = '';
    let stableSince = 0;
    const submit = await waitFor(() => {
      const text = composerText();
      if (text !== previous) { previous = text; stableSince = Date.now(); }
      if (!text || find('stop') || Date.now() - stableSince < 700) return null;
      return sendButton();
    }, 20000);
    if (!submit) {
      if (!ComposerDOM.input(document)) throw new Error('录音已停止，但未识别到输入框。文字不会被清空，请检查 ChatGPT 页面布局。');
      if (!composerText()) throw new Error('录音已停止，尚未得到非空听写文字；没有发送空消息。');
      throw new Error('文字已转写，但没有识别到可用的发送按钮。文字已保留，请检查发送按钮状态。');
    }
    sendAttempted = true;
    submit.click();
    if (!await waitFor(() => composerText() === '', 8000)) throw new Error('已点击发送，但未确认成功。文字已保留，请查看 ChatGPT，程序不会重复发送。');
    return {ok:true, state:'idle', sent:true, message:'听写文字已发送给 ChatGPT。下一次按 B 会新建对话。'};
  }
  async function waitFor(predicate, milliseconds) {
    const until = Date.now() + milliseconds;
    while (Date.now() < until) {
      const result = predicate();
      if (result) return result;
      await pause(200);
    }
    return null;
  }
  async function execute(action) {
    if (busy) return {ok: false, state: state(), message: "语音操作正在进行。"};
    busy = true;
    sendAttempted = false;
    try {
      if (action === "probe") return {ok: true, state: state(), page: location.pathname};
      if (action === "send") return await sendTranscription();
      if (action === "start") {
        if (find("stop")) return {ok: true, state: "active", message: "麦克风已开启。"};
        const start = await waitFor(() => find("start"), 18000);
        if (!start) throw new Error(mode === "dictation" ? "没有找到可用的“听写”按钮。请确认 ChatGPT 已登录且输入框已出现。" : "没有找到实时语音按钮，请确认语音功能可用。");
        recordingRequested = true;
        start.click();
        if (!await waitFor(() => find("stop"), 20000)) throw new Error("语音未确认启动。请检查麦克风授权、首次语音设置或账户限制。完成后可再按 B。程序会先检查这次会话。");
        return {ok: true, state: "active", message: mode === "dictation" ? "听写已开启，可以讲话。再按同一按键停止录音并发送。" : "新的实时语音对话已开始。再按同一按键结束。"};
      }
      if (action === "stop" || action === "stop_send") {
        const stop = find("stop");
        if (!stop) {
          if (find("start")) return action === 'stop_send' ? await sendTranscription() : {ok: true, state: "idle", message: "语音已经结束。"};
          throw new Error("没有找到结束语音按钮，不能确认麦克风已关闭。请查看 ChatGPT。" );
        }
        stop.click();
        if (!await waitFor(() => !find("stop") && find("start"), 18000)) throw new Error("已请求停止，可能还在转写。请检查 ChatGPT 的录音和转写状态。");
        recordingRequested = false;
        if (action === 'stop_send') return await sendTranscription();
        return {ok: true, state: "idle", message: mode === "dictation" ? "录音已停止。请在输入框检查听写文字，确认后点击发送。" : "语音已结束，聊天记录已保留。"};
      }
      throw new Error("未知动作。" );
    } catch (error) {
      return {ok: false, state: state(), sendAttempted, message: error.message};
    } finally {
      busy = false;
    }
  }
  async function historyTarget(direction) {
    if (state() === 'active') return {ok:false, state:'active', message:'请先按 A 停止录音，或按 B 停止并发送，再切换对话。'};
    if (composerText()) return {ok:false, state:state(), message:'输入框有未发送文字。请先发送或清空，再切换对话。'};
    const links = () => HistoryDOM.recentLinks(document, location);
    let items = links();
    if (!items.length) {
      const names = ['Open sidebar', 'Expand sidebar', '打开侧边栏', '展开侧边栏', '開啟側邊欄', '展開側邊欄'];
      const openers = Array.from(document.querySelectorAll('button')).filter(button => button.getClientRects().length && VoiceDOM.matchesLabel(button, names));
      if (openers.length === 1) {
        openers[0].click();
      }
    }
    if (!items.length) {
      await waitFor(()=>links().length,5000);
      items=links();
    }
    if (!items.length) return {ok:false, state:state(), message:'最近列表尚未出现。请展开最近列表；不会选取置顶或项目中的对话。'};
    const current = items.findIndex(link => new URL(link.href, location.href).pathname === location.pathname);
    const index = current < 0 ? 0 : current + (direction === 'previous' ? -1 : 1);
    if (index < 0 || index >= items.length) return {ok:true, state:state(), boundary:true, message:direction === 'previous' ? '已经是最近列表最上面的普通对话。' : '已经是最近列表最下面的已加载普通对话。'};
    const selected=items[index];
    const url=selected.href;
    // Reply before navigation can replace this document. React's link handler
    // then uses SPA navigation instead of forcing a whole-page reload.
    setTimeout(()=>selected.click(),0);
    return {ok:true, state:state(), url, navigationStarted:true};
  }
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message.type !== "voice-control") return false;
    if (message.mode) mode = message.mode;
    if (['scroll_up','scroll_down'].includes(message.action)) {
      try { respond({...ConversationScroll.scroll(document,message.action,getComputedStyle),state:state()}); }
      catch (error) { respond({ok:false,state:state(),message:error.message}); }
      return false;
    }
    if (['previous', 'next'].includes(message.action)) historyTarget(message.action).then(respond).catch(error => respond({ok:false,state:state(),message:error.message}));
    else execute(message.action).then(respond);
    return true;
  });
  let previous;
  setInterval(() => {
    const next = state();
    if (next !== previous) {
      previous = next;
      chrome.runtime.sendMessage({type: "voice-state", state: next}).catch(() => {});
    }
  }, 1500);
})();
