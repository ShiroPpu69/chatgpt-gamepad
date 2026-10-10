importScripts("local-config.js");
let socket;
let heartbeat;
let reconnect;
let working = false;
let session = {tabId: null, state: "idle", recordingKey:null};
const sessionReady = chrome.storage.session.get("voiceSession").then(saved => {
  if (saved.voiceSession) session = {...session, ...saved.voiceSession, recordingKey:saved.voiceSession.recordingKey ?? (saved.voiceSession.state === 'active' ? 'b' : null)};
});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function send(value) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value));
}
async function remember(state, tabId = session.tabId, updates = {}) {
  session = {...session, state, tabId, ...(tabId !== session.tabId ? {recordingKey:null} : {}), ...updates};
  await chrome.storage.session.set({voiceSession: session});
  send({type: "state", state});
}
async function voiceMessage(tabId, action) {
  const message={type:"voice-control",action,mode:LOCAL_CONFIG.mode||"dictation"};
  try {return await chrome.tabs.sendMessage(tabId,message);}
  catch(error) {
    if (!/receiving end does not exist|could not establish connection/i.test(error.message)) throw error;
    const tab=await chrome.tabs.get(tabId);
    if (!tab.url?.startsWith('https://chatgpt.com/')) throw error;
    await chrome.scripting.executeScript({target:{tabId},injectImmediately:true,files:['voice-dom.js','composer-dom.js','history-dom.js','conversation-scroll.js','content.js']});
    return await chrome.tabs.sendMessage(tabId,message);
  }
}
async function waitForContent(tabId, expectedPath = null) {
  const until = Date.now() + 14000;
  while (Date.now() < until) {
    try {
      const result = await voiceMessage(tabId, "probe");
      if (!expectedPath || result.page === expectedPath) return result;
      await pause(100);
    }
    catch { await pause(100); }
  }
  throw new Error("ChatGPT 页面尚未就绪。请检查网络、登录或浏览器扩展的站点权限。" );
}
async function currentChat() {
  const active = await chrome.tabs.query({active:true, lastFocusedWindow:true});
  const tab = active.find(item => item.url?.startsWith('https://chatgpt.com/'));
  if (tab) return tab;
  const remembered = await existingTab();
  if (remembered) return remembered;
  throw new Error('请先在 Chrome 打开并选中要操作的 ChatGPT 对话。');
}
async function focus(tab) {
  await chrome.tabs.update(tab.id, {active:true});
  await chrome.windows.update(tab.windowId, {focused:true});
}
async function navigateHistory(target,action) {
  const result=await voiceMessage(target.id,action);
  if (!result.ok || !result.url) return result;
  const url=new URL(result.url);
  if (url.origin!=='https://chatgpt.com' || !/^\/(?:g\/[^/]+\/)?c\/[^/]+\/?$/.test(url.pathname)) throw new Error('无效的 ChatGPT 对话链接。');
  if (!result.navigationStarted) throw new Error('旧页面脚本尚未更新，请刷新该 ChatGPT 页面一次。');
  const deadline=Date.now()+4000;
  while(Date.now()<deadline) {
    const tab=await chrome.tabs.get(target.id);
    if (tab.url && new URL(tab.url).pathname===url.pathname) {
      await remember('unknown',target.id,{recordingKey:null});
      return {ok:true,state:'unknown',message:action==='previous'?'已切换到最近列表上方的普通对话。':'已切换到最近列表下方的普通对话。'};
    }
    await pause(100);
  }
  throw new Error('聊天链接已点击，但网址尚未切换。请检查网页。');
}
async function performCurrent(action) {
  const target = await currentChat();
  if (['scroll_up','scroll_down'].includes(action)) {
    return await voiceMessage(target.id,action);
  }
  if (session.tabId !== target.id && session.state === 'active') throw new Error('另一张控制器标签页还在录音，请先停止后再操作当前对话。');
  await focus(target);
  if (['previous','next'].includes(action)) return await navigateHistory(target,action);
  const probe = await waitForContent(target.id);
  if (action === 'toggle_current') {
    const stopping = probe.state === 'active';
    await remember(probe.state, target.id, {recordingKey:stopping ? session.recordingKey : 'a'});
    const result = await voiceMessage(target.id, stopping ? 'stop_send' : 'start');
    await remember(result.state, target.id, {recordingKey:result.state === 'idle' ? null : 'a'});
    return result;
  }
  throw new Error('未知的当前页面动作。');
}
async function existingTab() {
  if (session.tabId === null) return null;
  try {
    const tab = await chrome.tabs.get(session.tabId);
    if (!tab.url?.startsWith("https://chatgpt.com/")) throw new Error("页面已离开 ChatGPT");
    return tab;
  } catch {
    await remember("idle", null);
    return null;
  }
}
async function perform(action) {
  await sessionReady;
  if (['toggle_current','previous','next','scroll_up','scroll_down'].includes(action)) return await performCurrent(action);
  const tab = await existingTab();
  if (tab) {
    let probe;
    try { probe = await voiceMessage(tab.id, "probe"); }
    catch { throw new Error("已有 ChatGPT 页面无法响应。请回到该页面检查语音，不会另外开启麦克风。"); }
    if (probe.state === "active") {
      if (action === 'toggle' && session.recordingKey !== 'b') {
        return {ok:false,state:'active',message:'当前是 A 键或手动开启的录音，请按 A 停止并发送，然后按 B 新建对话。'};
      }
      await chrome.tabs.update(tab.id, {active: true});
      await chrome.windows.update(tab.windowId, {focused: true});
      const shouldSend = action === 'toggle';
      const result = await voiceMessage(tab.id, shouldSend ? "stop_send" : "stop");
      await remember(result.state, tab.id, {recordingKey:result.state === 'idle' ? null : session.recordingKey});
      return result;
    }
    if (probe.state === "unknown" && session.recordingKey) {
      await remember("unknown");
      throw new Error("已有会话的状态不明确。请检查登录、首次授权或语音界面；不会新开第二个会话。");
    }
  }
  if (action === "stop") {
    await remember("idle", session.tabId, {recordingKey:null});
    return {ok: true, state: "idle", message: "没有进行中的控制器语音会话。"};
  }
  // B always starts a fresh conversation when its recording is not active.
  // An old draft, A's last conversation, or an unsent message is never reused.
  const target = await chrome.tabs.create({url: "https://chatgpt.com/", active: true});
  await remember("unknown", target.id, {recordingKey:'b'});
  await chrome.tabs.update(target.id, {active: true});
  await chrome.windows.update(target.windowId, {focused: true});
  await waitForContent(target.id);
  let result;
  try {
    result = await voiceMessage(target.id, "start");
  } catch {
    // Navigation can replace the content script during initialization. Observe
    // the new script first; never blindly replay a start after recording began.
    const probe = await waitForContent(target.id);
    if (probe.state === "active") result = {ok:true, state:"active", message:"麦克风已开启。再按 B 停止。"};
    else if (probe.state === "idle") result = await voiceMessage(target.id, "start");
    else throw new Error("页面刷新打断了操作。请检查这张新对话的麦克风状态。");
  }
  await remember(result.ok ? result.state : "unknown", target.id, {recordingKey:result.state === 'idle' ? null : 'b'});
  return {...result, state: result.ok ? result.state : "unknown"};
}
async function command(message) {
  if (working) {
    send({type: "result", id: message.id, ok: false, state: session.state, message: "正在处理上一次按键。"});
    return;
  }
  working = true;
  try {
    if (!["toggle", "stop", "toggle_current", "previous", "next", "scroll_up", "scroll_down"].includes(message.action)) throw new Error("未知动作");
    const result = await perform(message.action);
    send({type: "result", id: message.id, ...result});
  } catch (error) {
    send({type: "result", id: message.id, ok: false, state: session.state, message: error.message});
  } finally { working = false; }
}
function connect() {
  if (socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState)) return;
  clearTimeout(reconnect);
  socket = new WebSocket(`ws://127.0.0.1:${LOCAL_CONFIG.port}`);
  socket.onopen = () => socket.send(JSON.stringify({type: "auth", token: LOCAL_CONFIG.token}));
  socket.onmessage = async event => {
    const message = JSON.parse(event.data);
    if (message.type === "ready") {
      await sessionReady;
      send({type: "state", state: session.state});
      chrome.action.setBadgeText({text: "ON"});
      chrome.action.setBadgeBackgroundColor({color: "#44775b"});
      clearInterval(heartbeat);
      heartbeat = setInterval(() => send({type: "ping"}), 15000);
    } else if (message.type === "command") await command(message);
  };
  socket.onclose = () => {
    clearInterval(heartbeat);
    chrome.action.setBadgeText({text: "OFF"});
    reconnect = setTimeout(connect, 3000);
  };
  socket.onerror = () => socket.close();
}
chrome.alarms.create("bridge-reconnect", {periodInMinutes: 0.5});
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === "bridge-reconnect") connect(); });
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);
chrome.tabs.onRemoved.addListener(async tabId => {
  await sessionReady;
  if (session.tabId === tabId) await remember("idle", null);
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.type === "bridge-status") {
    sessionReady.then(() => respond({connected: socket?.readyState === WebSocket.OPEN, ...session}));
    connect();
    return true;
  }
  if (message.type === "voice-state" && sender.tab?.id === session.tabId && !working) {
    // An unstarted draft must remain pending even when it exposes a start button.
    if (session.state !== "unknown" || message.state === "active") remember(message.state,session.tabId,{recordingKey:message.state === 'idle' ? null : session.recordingKey});
  }
  return false;
});
connect();
