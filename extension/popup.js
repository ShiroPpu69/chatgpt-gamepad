chrome.runtime.sendMessage({type: "bridge-status"}).then(result => {
  const labels = {idle: "未开始 / 已停止", active: "正在听写", unknown: "待确认，请查看 ChatGPT"};
  document.getElementById("status").textContent = `后台手柄监听：${result.connected ? "已连接，无需打开控制器窗口" : "未连接，请检查后台监听或自动启动设置"}\n语音：${labels[result.state] || result.state}`;
}).catch(() => { document.getElementById("status").textContent = "扩展未就绪，请重新加载扩展。"; });
