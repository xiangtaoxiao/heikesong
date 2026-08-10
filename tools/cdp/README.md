# CDP 验证脚本

用 Chrome DevTools Protocol 驱动真实浏览器跑游戏，验证靠肉眼和接口耗时看不出来的问题。

先起调试用 Chrome：
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --remote-debugging-port=9222 --autoplay-policy=no-user-gesture-required \
  --user-data-dir=/tmp/cdp about:blank &
```

| 脚本 | 用途 |
|---|---|
| `measure-audio-gap.mjs` | 打点「文字出现 → 声音开始」的空档。这是感知延迟的正确量法，接口 P50 看不出预取失效 |
| `check-deck-flow.mjs` | 验证四页导读自动翻页（1/4→4/4）与开席时机 |
| `check-audio-playing.mjs` | 检查音频真的在播（paused/currentTime/volume）与剩余额度 |

跑完记得 `pkill -f "remote-debugging-port=9222"`。
注意：脚本里给 URL 加了时间戳参数强制重载——同一 URL 只换 hash 不会触发刷新。
