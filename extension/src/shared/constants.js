var OP = globalThis.OP || (globalThis.OP = {});

OP.LOCAL_KEY = "localState";
OP.SESSION_KEY = "sessionState";
OP.SCHEMA_VERSION = 1;
OP.ALARM_TIMER = "timer-due";
OP.ALARM_SNOOZE = "snooze-end";
OP.NAME_LIMIT = 200;
OP.DEFAULT_INTERVAL_MINUTES = 5;
OP.PRESET_SNOOZE_MINUTES = [10, 30];
OP.DEFAULT_SNOOZE_INPUT_MINUTES = 10;
OP.REDISPLAY_MS = 5000;
OP.DRAG_THRESHOLD_PX = 4;
OP.BUTTON_MARGIN_PX = 24;
OP.BUTTON_EDGE_PX = 8;
OP.HOST_Z_INDEX = "2147483646";

OP.MESSAGE = {
  contentReady: "content-ready",
  purposeAdd: "purpose-add",
  purposeCommit: "purpose-commit",
  purposeSkip: "purpose-skip",
  purposeUpdate: "purpose-update",
  purposeDelete: "purpose-delete",
  listsChanged: "lists-changed",
  settingsSet: "settings-set",
  optionAdd: "option-add",
  optionUpdate: "option-update",
  optionDelete: "option-delete",
  interruptCommit: "interrupt-commit",
  interruptDismiss: "interrupt-dismiss",
  interruptCloseTab: "interrupt-close-tab",
  showInterrupt: "show-interrupt",
  snoozeSet: "snooze-set",
  snoozeMove: "snooze-move",
  popupGet: "popup-get"
};

OP.COPY = {
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
  againIntervalLabel: "再次打断间隔（分钟）"
};
