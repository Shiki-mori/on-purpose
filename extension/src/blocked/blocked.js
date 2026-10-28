var OP = globalThis.OP;
var blockLoading = false;

function refreshBlockState() {
  if (blockLoading) {
    return;
  }
  blockLoading = true;
  chrome.runtime.sendMessage({ type: OP.MESSAGE.blockGet }, function (response) {
    blockLoading = false;
    var error = document.getElementById("block-error");
    if (chrome.runtime.lastError || !response || !response.ok) {
      document.getElementById("block-title").textContent = OP.COPY.blockLoadFailed;
      error.textContent = response && response.error || OP.COPY.blockLoadFailed;
      error.hidden = false;
      return;
    }
    error.hidden = true;
    var state = response.block;
    document.getElementById("block-title").textContent = state.active ? OP.COPY.blockTitle : OP.COPY.blockAllowed;
    document.getElementById("block-schedule").textContent = state.schedule.enabled
      ? "每日禁用时段：" + state.schedule.start + "–" + state.schedule.end + "（北京时间 UTC+8）"
      : OP.COPY.blockDisabled;
    document.getElementById("block-explanation").textContent = OP.COPY.blockExplanation;
  });
}

window.addEventListener("focus", refreshBlockState);
document.addEventListener("visibilitychange", function () {
  if (!document.hidden) {
    refreshBlockState();
  }
});
chrome.runtime.onMessage.addListener(function (message) {
  if (message && message.type === OP.MESSAGE.blockChanged) {
    refreshBlockState();
  }
});
refreshBlockState();
