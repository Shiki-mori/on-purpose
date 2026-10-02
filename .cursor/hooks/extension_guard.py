#!/usr/bin/env python3
"""Guard extension edits against the assignment-book constraints."""

import json
import re
import sys
from pathlib import Path

BUNDLER_CONFIGS = {
    "package.json",
    "vite.config.js",
    "vite.config.ts",
    "vite.config.mjs",
    "webpack.config.js",
    "rollup.config.js",
    "esbuild.config.js",
    "parcel.config.js",
}

CONTENT_JS = [
    "src/shared/constants.js",
    "src/sites/bilibili.js",
    "src/sites/index.js",
    "src/content/ui.js",
    "src/content/content-script.js",
]

THEME_COLORS = ("#16171d", "#23242c", "#f3f4f6", "#b6b8c3", "#3a3b46", "#7c8cff")


def emit(payload):
    json.dump(payload, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")


def load_input():
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def as_dict(value):
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def repo_path(file_path):
    if not file_path:
        return None
    path = Path(file_path)
    if not path.is_absolute():
        path = Path.cwd() / path
    try:
        relative = path.resolve().relative_to(Path.cwd().resolve())
    except ValueError:
        text = str(path).replace("\\", "/")
        marker = "/extension/"
        if marker in text:
            return Path("extension") / text.split(marker, 1)[1]
        return None
    return relative


def is_extension(relative):
    return relative is not None and (
        relative == Path("extension") or relative.parts[:1] == ("extension",)
    )


def strip_js(source):
    out = []
    i = 0
    n = len(source)
    while i < n:
        ch = source[i]
        nxt = source[i + 1] if i + 1 < n else ""
        if ch == "/" and nxt == "/":
            i += 2
            while i < n and source[i] not in "\n\r":
                i += 1
            continue
        if ch == "/" and nxt == "*":
            i += 2
            while i + 1 < n and not (source[i] == "*" and source[i + 1] == "/"):
                i += 1
            i += 2
            continue
        if ch in "\"'`":
            quote = ch
            out.append(" ")
            i += 1
            while i < n:
                if source[i] == "\\":
                    i += 2
                    continue
                if source[i] == quote:
                    i += 1
                    break
                i += 1
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def violations_in_source(relative, source):
    found = []
    suffix = relative.suffix.lower()
    code = strip_js(source) if suffix in {".js", ".html", ".css"} else source
    posix = relative.as_posix()

    if suffix == ".js":
        if re.search(r"(^|\n)\s*import\s+", code) or re.search(r"(^|\n)\s*export\s+", code):
            found.append("脚本不要使用 import / export，共享名字挂在 globalThis.OP 上")
        if re.search(r"\bperformance\.now\s*\(", code):
            found.append("计时用 Date.now() 和 chrome.alarms，不用 performance.now()")

    in_page = "/src/content/" in f"/{posix}" or "/src/popup/" in f"/{posix}"
    if in_page and re.search(r"\bchrome\.storage\b", code):
        found.append("弹出页和内容脚本不要调用 chrome.storage，改发给服务工作线程")
    if posix.endswith("src/popup/popup.html") and re.search(r"storage\.js", source):
        found.append("弹出页不要载入 storage.js")
    if suffix in {".js", ".html"} and re.search(
        r"\bfetch\s*\(|\bXMLHttpRequest\b|\bsendBeacon\s*\(|\bnew\s+WebSocket\b|\bchrome\.webRequest\b",
        code,
    ):
        found.append("扩展不要发起网络请求")

    if posix.endswith("src/background/service-worker.js") or posix.endswith("src/background/runtime.js"):
        if re.search(r"\bset(?:Timeout|Interval)\s*\(", code):
            found.append("服务工作线程不要用定时器担任计时；共用计时用 chrome.alarms，5 秒再弹放在内容脚本")

    if suffix == ".html" and re.search(r"""type\s*=\s*["']module["']""", source):
        found.append("不要把脚本标成 type=module")

    return found


def manifest_violations(source):
    found = []
    try:
        data = json.loads(source)
    except json.JSONDecodeError:
        return found
    if not isinstance(data, dict):
        return found
    if data.get("manifest_version") not in (None, 3):
        found.append("清单版本必须是 Manifest V3")
    background = data.get("background")
    if isinstance(background, dict) and background.get("type") == "module":
        found.append("服务工作线程不要设成 ES Module")
    scripts = data.get("content_scripts")
    if not isinstance(scripts, list):
        return found
    for entry in scripts:
        if not isinstance(entry, dict):
            continue
        if entry.get("all_frames") is True:
            found.append("内容脚本 all_frames 必须为 false")
        js = entry.get("js")
        if isinstance(js, list) and js != CONTENT_JS:
            found.append(
                "内容脚本顺序必须是 constants.js、sites/bilibili.js、sites/index.js、content/ui.js、content/content-script.js"
            )
    return found


def theme_gaps(source):
    if len(source.strip()) < 40:
        return []
    missing = [color for color in THEME_COLORS if color.lower() not in source.lower()]
    if not missing:
        return []
    return ["theme.css 还缺这些深色：" + "、".join(missing)]


def candidate_text(tool_input, relative):
    contents = tool_input.get("contents")
    if isinstance(contents, str):
        return contents
    new_string = tool_input.get("new_string")
    old_string = tool_input.get("old_string")
    if not isinstance(new_string, str):
        return None
    disk = Path.cwd() / relative
    if isinstance(old_string, str) and disk.is_file():
        current = disk.read_text(encoding="utf-8")
        if old_string and old_string in current:
            return current.replace(old_string, new_string, 1)
    return new_string


def check_write(tool_input):
    relative = repo_path(tool_input.get("path") or tool_input.get("file_path"))
    if relative is None:
        return []
    if relative.name in BUNDLER_CONFIGS or relative.as_posix() in BUNDLER_CONFIGS:
        return ["本项目不引入打包工具，不要添加 " + relative.name]
    if not is_extension(relative):
        return []
    text = candidate_text(tool_input, relative)
    if text is None:
        return []
    found = violations_in_source(relative, text)
    if relative.as_posix() == "extension/manifest.json":
        found.extend(manifest_violations(text))
    return found


def deny(messages):
    text = "；".join(messages)
    emit(
        {
            "permission": "deny",
            "user_message": text,
            "agent_message": "这次修改和任务书约束冲突：" + text,
        }
    )


def allow():
    emit({"permission": "allow"})


def command_without_quotes(command):
    without_heredoc = re.sub(r"<<-?\s*'?EOF'?.*?^EOF", " ", command, flags=re.S | re.M)
    return re.sub(r"""'(?:\\.|[^'])*'|"(?:\\.|[^"])*""", " ", without_heredoc)


def is_bundler_command(command):
    stripped = command_without_quotes(command).lower()
    if re.search(
        r"(?:^|[;&|`(])\s*(?:npx|bunx|pnpm\s+dlx|yarn\s+dlx|npm\s+exec|pnpm\s+exec)\s+(webpack|vite|rollup|esbuild|parcel|browserify)\b",
        stripped,
    ):
        return True
    if re.search(r"(?:^|[;&|`(])\s*(webpack|vite|rollup|parcel|browserify)\b", stripped):
        return True
    if re.search(r"(?:^|[;&|`(])\s*esbuild\b", stripped):
        return True
    if re.search(r"\b(npm|pnpm|yarn|bun)\s+(init|create)\b", stripped):
        return True
    if re.search(
        r"\b(npm|pnpm|yarn|bun)\s+(install|i|add)\b.*\b(webpack|vite|rollup|esbuild|parcel|browserify)\b",
        stripped,
    ):
        return True
    return False


def handle_shell():
    data = load_input()
    command = data.get("command") or ""
    if is_bundler_command(command):
        emit(
            {
                "permission": "deny",
                "user_message": "本项目不引入打包工具。",
                "agent_message": "任务书要求扩展不打包、不用 ES Module。不要运行 webpack、vite、rollup、esbuild、parcel 或初始化 Node 包。",
            }
        )
        return
    allow()


def handle_pre_tool():
    data = load_input()
    found = check_write(as_dict(data.get("tool_input")))
    if found:
        deny(found)
        return
    allow()


def handle_post_tool():
    data = load_input()
    tool_input = as_dict(data.get("tool_input"))
    relative = repo_path(tool_input.get("path") or tool_input.get("file_path"))
    if not is_extension(relative):
        emit({})
        return
    disk = Path.cwd() / relative
    if not disk.is_file():
        emit({})
        return
    text = disk.read_text(encoding="utf-8")
    found = violations_in_source(relative, text)
    if relative.as_posix() == "extension/manifest.json":
        found.extend(manifest_violations(text))
    if relative.as_posix() == "extension/src/shared/theme.css":
        found.extend(theme_gaps(text))
    if not found:
        emit({})
        return
    emit({"additional_context": "扩展文件仍违反任务书约束，先改掉再继续：" + "；".join(found)})


def current_task():
    book = Path.cwd() / "docs/assignment/assignment-book.md"
    if not book.is_file():
        return "找不到 docs/assignment/assignment-book.md。先确认任务书还在。"
    section = book.read_text(encoding="utf-8").split("## 13. 进度", 1)[-1]
    for line in section.splitlines():
        match = re.match(r"\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|", line)
        if not match:
            continue
        status = match.group(2)
        if status in {"未开始", "进行中"}:
            return f"当前只做任务 {match.group(1)}（{status}）。不要提前做后面的任务。范围和验收见 docs/assignment/assignment-book.md。"
    return "任务书第 13 节里没有未完成的任务。"


def handle_session():
    emit({"additional_context": current_task()})


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    handlers = {
        "shell": handle_shell,
        "pre-tool": handle_pre_tool,
        "post-tool": handle_post_tool,
        "session": handle_session,
    }
    handler = handlers.get(mode)
    if handler is None:
        emit({})
        return
    try:
        handler()
    except Exception:
        if mode in {"shell", "pre-tool"}:
            allow()
        else:
            emit({})


if __name__ == "__main__":
    main()
