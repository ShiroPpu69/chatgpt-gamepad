/* Semantic controls for dictation (default) and optional real-time voice. */
(function (root) {
  const starts = ["Start voice mode", "Start voice chat", "Start new voice chat", "Use voice mode", "Voice mode", "开始语音模式", "启动语音模式", "开启语音模式", "开始语音聊天", "开始新的语音聊天", "开始语音对话", "使用语音模式", "语音模式", "開始語音模式", "開始語音聊天", "開始語音對話", "使用語音模式", "語音模式"];
  const stops = ["End voice chat", "Stop voice chat", "End voice mode", "End conversation", "Exit voice mode", "End call", "结束语音聊天", "停止语音聊天", "结束语音对话", "结束对话", "退出语音模式", "结束通话", "結束語音聊天", "停止語音聊天", "結束語音對話", "結束對話", "退出語音模式", "結束通話"];
  const dictateStarts = ["Dictate", "Dictation", "Start dictation", "Start recording", "Record voice", "听写", "开始听写", "启动听写", "語音輸入", "语音输入", "聽寫", "開始聽寫"];
  const dictateStops = ["Stop dictation", "Submit dictation", "Confirm dictation", "Finish dictation", "Stop recording", "Submit recording", "Confirm recording", "Finish recording", "Done recording", "停止听写", "提交听写", "确认听写", "完成听写", "停止录音", "停止录制", "提交录音", "确认录音", "完成录音", "停止聽寫", "提交聽寫", "確認聽寫", "完成聽寫", "停止錄音", "停止錄製", "提交錄音", "確認錄音", "完成錄音"];
  const recordingCancels = ["Cancel dictation", "Cancel recording", "Discard recording", "取消听写", "取消录音", "取消录制", "取消聽寫", "取消錄音", "取消錄製"];
  const generalConfirms = ["Submit", "Confirm", "Done", "Finish", "Stop", "提交", "确认", "完成", "停止", "確認"];
  const generalCancels = ["Cancel", "取消", ...recordingCancels];
  const normalize = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
  function label(button) {
    const labelled = button.getAttribute("aria-labelledby");
    const referenced = labelled ? labelled.split(/\s+/).map(id => button.ownerDocument?.getElementById(id)?.textContent || "").join(" ") : "";
    return normalize(button.getAttribute("aria-label") || referenced || button.getAttribute("title") || button.getAttribute("data-tooltip-content") || button.textContent);
  }
  function matchesLabel(button, choices) {
    const names = [label(button), button.getAttribute("title"), button.getAttribute("data-tooltip-content")].map(normalize);
    return choices.some(x => names.includes(normalize(x)));
  }
  function visibleButtons(document) {
    return Array.from(document.querySelectorAll('button, [role="button"]')).filter(button =>
      !button.disabled && button.getAttribute("aria-disabled") !== "true" &&
      button.getClientRects().length > 0
    );
  }
  function locate(document, kind, mode = "voice", recordingRequested = false) {
    const choices = mode === "dictation" ? (kind === "stop" ? dictateStops : dictateStarts) : (kind === "stop" ? stops : starts);
    const buttons = visibleButtons(document);
    let matches = buttons.filter(button => matchesLabel(button, choices));
    if (!matches.length && mode === "dictation" && kind === "stop") {
      // Some layouts call the recording checkmark simply "Submit".
      // Require a recording cancellation control, or a start we just requested.
      const composer = document.querySelector?.('#prompt-textarea')?.closest('form');
      const scoped = composer ? visibleButtons(composer) : [];
      const recordingVisible = buttons.some(button => matchesLabel(button, recordingCancels));
      const pairedControls = scoped.some(button => matchesLabel(button, generalCancels));
      const startVisible = buttons.some(button => matchesLabel(button, dictateStarts));
      if (recordingVisible || (pairedControls && (recordingRequested || !startVisible))) {
        const candidates = composer ? scoped : buttons;
        matches = candidates.filter(button => matchesLabel(button, generalConfirms));
      }
    }
    // Fail closed if a layout change introduces more than one possible action.
    return matches.length === 1 ? matches[0] : null;
  }
  const api = { starts, stops, dictateStarts, dictateStops, normalize, label, matchesLabel, locate };
  root.VoiceDOM = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
