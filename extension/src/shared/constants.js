var OP = globalThis.OP || (globalThis.OP = {});

OP.LOCAL_KEY = "localState";
OP.SESSION_KEY = "sessionState";
OP.SCHEMA_VERSION = 7;
OP.ALARM_BLOCK_BOUNDARY = "block-boundary";
OP.ALARM_BLOCK_CHECK = "block-check";
OP.BLOCK_RULE_ID = 1001;
OP.BLOCK_PAGE = "src/blocked/blocked.html";
OP.DEFAULT_BLOCK_SCHEDULE = { enabled: true, start: "02:00", end: "07:00" };
OP.ALARM_TIMER = "timer-due";
OP.ALARM_SNOOZE = "snooze-end";
OP.NAME_LIMIT = 200;
OP.DEFAULT_INTERVAL_MINUTES = 3;
OP.PRESET_SNOOZE_MINUTES = [10, 30];
OP.DEFAULT_SNOOZE_INPUT_MINUTES = 10;
OP.REDISPLAY_MS = 5000;
OP.ENTERTAINMENT_CLOSE_PROBABILITY = 0.6;
OP.DRAG_THRESHOLD_PX = 4;
OP.BUTTON_MARGIN_PX = 24;
OP.BUTTON_EDGE_PX = 8;
OP.HOST_Z_INDEX = "2147483646";

OP.sortPurposes = function (purposes) {
  return (Array.isArray(purposes) ? purposes : []).slice().sort(function (left, right) {
    var leftLast = left.name === "娱乐";
    var rightLast = right.name === "娱乐";
    if (leftLast !== rightLast) {
      return leftLast ? 1 : -1;
    }
    return left.order - right.order;
  });
};

OP.MESSAGE = {
  blockSettingsSet: "block-settings-set",
  blockGet: "block-get",
  blockChanged: "block-changed",
  contentReady: "content-ready",
  purposeAdd: "purpose-add",
  purposeCommit: "purpose-commit",
  purposeSelect: "purpose-select",
  purposeSkip: "purpose-skip",
  purposeUpdate: "purpose-update",
  purposeDelete: "purpose-delete",
  listsChanged: "lists-changed",
  settingsSet: "settings-set",
  optionAdd: "option-add",
  optionUpdate: "option-update",
  optionDelete: "option-delete",
  interruptCommit: "interrupt-commit",
  interruptSelect: "interrupt-select",
  interruptDismiss: "interrupt-dismiss",
  interruptCloseTab: "interrupt-close-tab",
  showInterrupt: "show-interrupt",
  snoozeSet: "snooze-set",
  snoozeMove: "snooze-move",
  popupGet: "popup-get"
};

OP.COPY = {
  blockHeading: "定时禁用哔哩哔哩",
  blockEnable: "启用定时禁用",
  blockStart: "开始时间",
  blockEnd: "结束时间",
  blockSave: "保存禁用设置",
  blockSaved: "已保存",
  blockTimeHint: "每天按北京时间（UTC+8）执行，支持跨午夜。",
  invalidBlockTime: "请选择有效的开始和结束时间",
  sameBlockTime: "开始时间和结束时间不能相同",
  blockApplyFailed: "设置已保存，但禁用未完全生效，请重试",
  blockTitle: "当前时段禁止访问哔哩哔哩",
  blockAllowed: "当前可以访问哔哩哔哩",
  blockDisabled: "定时禁用已关闭",
  blockExplanation: "请在允许访问的时间自行重新打开哔哩哔哩。",
  blockLoadFailed: "未能读取禁用状态，请刷新重试",
  emptyName: "请输入名称",
  nameTooLong: "名称不能超过 200 个字",
  invalidMinutes: "请输入大于或等于 1 的整数",
  saveFailed: "没能保存，请再试一次",
  confirmDeletePurpose: "删除这个目的？",
  confirmDeleteOption: "删除这个打断选项？",
  purposeContrastTitle: "这次的目的",
  sourcePurpose: "目的询问",
  sourceInterrupt: "时长打断",
  snoozeIdle: "暂停",
  skip: "跳过",
  confirm: "确认",
  dismiss: "关掉",
  closeTab: "关闭当前标签页",
  purposeAskTitle: "本次使用的目的是什么",
  interruptTitle: "现在在做什么",
  firstIntervalLabel: "首次打断间隔（分钟）",
  againIntervalLabel: "再次打断间隔（分钟）",
  viewLogs: "查看日志",
  logsTitle: "日志",
  statsHeading: "统计",
  logsAll: "全部记录",
  rangeMonth: "本月",
  rangeRecent: "近30天",
  topPurpose: "频率最高的目的",
  topInterrupt: "频率最高的打断选项",
  statsEmpty: "这段时间没有记录",
  pieHeading: "记录分布",
  pieMerged: "较少出现",
  pieMergedAlt: "更少出现"
};
