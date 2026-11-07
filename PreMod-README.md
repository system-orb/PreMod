# PreMod 多站点版（v3.0.0）说明

> English version: [PreMod-README.en.md](PreMod-README.en.md)

> 本版在原版 **ChatGPT PreMod 2.4.2**（作者 horselock）的基础上，把「处理审核拦截、保住被删/被撤回的回复」的能力扩展到 **DeepSeek、Claude、千问/通义、豆包、Kimi**。ChatGPT 部分的代码原样保留（已用哈希校验确认与上游 2.4.2 完全一致），其它站点为新增适配。

- **GitHub 仓库（已发布）**：<https://github.com/system-orb/PreMod>
- **在线安装 / 自动更新链接**：<https://github.com/system-orb/PreMod/raw/main/PreMod.user.js>
- 本机文件：`C:\Users\Administrator\Downloads\PreMod.user.js`（原 2.4.2 已备份为 `PreMod.user.js.2.4.2.bak`）
- 脚本管理器：浏览器里的 Tampermonkey / Violentmonkey 均可（你目前用的是 Edge 里的 Tampermonkey）
- 安装/更新：打开上面的 GitHub 安装链接 → Tampermonkey 安装页点安装；因为脚本里已写入 `@downloadURL/@updateURL` 指向该仓库，以后会自动从 GitHub 更新。安装后 **刷新目标网站页面** 生效。

## 各站点功能

| 站点 | 功能 | 说明 |
|---|---|---|
| **ChatGPT**（chatgpt.com / chat.openai.com） | 原版 PreMod 全部功能 | 隐藏审核视觉提示、阻止被删回复、本地保存并在历史里恢复。代码未改动。 |
| **DeepSeek**（chat.deepseek.com） | 拦截「撤回」 | DeepSeek 把被拦截回复替换为模板提示并置 `CONTENT_FILTER` 时，脚本把该事件改写为保留正文 + 追加一条警告提示，回复不再消失；正常回复也会自动备份；重新打开对话时自动恢复被拦截的消息。 |
| **Claude**（claude.ai） | 自动继续 + 留痕 | 出现「This response ended early / Paused when your free usage ran out」时可自动点 **Continue** 继续生成；同时旁路捕获每条回复正文存档；打开会话时若发现某条已存回复不在会话里，会提示并从面板找回。 |
| **千问 / 通义**（qianwen.com / tongyi.com） | 留痕 + 覆盖告警 | 千问是「整段快照」式 SSE：新版快照不再包含旧文本（被改口/替换）时，自动把旧版存档；`error_code` 也会提示。 |
| **豆包**（doubao.com） | 留痕 + 风控提示 | 解析 SSE 事件块，累积正文存档；识别 `STREAM_ERROR` 与风控码 `710022002 / 710022004`，并提示已保存回复。 |
| **Kimi**（kimi.com） | 留痕 | 解析 www.kimi.com 的 Connect-RPC 二进制帧流；`op=set` 覆盖已有文本时把旧版存档；结束后把整段回复存档。 |
| 其他站点（脚本里未专门适配的） | 通用留痕 | 对聊天类请求做启发式旁路捕获，尽力保存回复正文，供面板找回。 |

> 国内几个站点目前**没有公开确凿证据**证明一定会「先显示后被审核撤回/替换」。脚本的策略是 **旁路留痕 + 检测覆盖**：即使服务端改了内容，你已经看到的那一版也会被本地保存下来，可从面板复制。是否真的发生替换，需要你在真实使用中验证（见下）。

## 使用方法

1. 正常打开/使用各 AI 网站。DeepSeek 无需额外操作；Claude 的自动继续生效后页面顶部会出现 PreMod 提示条。
2. **右下角有「PreMod」悬浮按钮**的站点（Claude、千问、豆包、Kimi 等）：点开即「本地存档」面板。
   - 每条记录可 **复制**、**删**；顶部可 **导出** 全部 JSON、**清空**。
   - 存档只保存在本浏览器的 `localStorage`（每站点独立），不会上传。
3. 脚本管理器菜单（点 Tampermonkey 图标 → PreMod）里可开关：
   - `Toggle all banners` / 启动横幅开关（所有站点）
   - `Toggle DeepSeek 防撤回`（DeepSeek）
   - `Toggle Claude 自动继续`、`Toggle 本地留痕`（Claude）
   - `Toggle 本地留痕`、`Show PreMod 存档面板`（千问/豆包/Kimi/其他）

## 重要限制与风险

- **无法绕过服务端审核**：脚本只能保住「服务器已经发给浏览器的内容」，以及把被覆盖前的旧内容留档；不会让被拒绝的请求变合法。
- **国内站点行为未知项**：Kimi/千问/豆包的网页端「审核提示原文」「是否先显示后替换」暂无公开实证；接口协议按 2026 年公开逆向资料实现，站点改版可能失效。失效时的表现通常是：面板里没有新记录 / 控制台出现 `[PreMod:...]` 报错。
- **Kimi 帧解析**依赖 www.kimi.com 的 Connect-RPC 协议（`/apiv2/kimi.gateway.chat.v1.ChatService/Chat`）；若改成旧版 `/api/chat/.../completion/stream` 也已兼容。
- **Claude 自动继续**只会在带明确提示文字的暂停横幅里点 Continue，且同一原因有冷却时间；不会乱点页面其他按钮。
- **数据清理**：清除浏览器站点数据会一并清掉存档；重要内容请用面板「导出」备份。
- **账号风险**：与上游 PreMod 一样，本工具仅是前端本地工具；请自行评估使用风险，遵守各平台服务条款。

## 建议的真实验证（约 10 分钟）

对每个站点：正常提一个长问题 → 打开 F12 Console 看是否有 `[PreMod:站点]` 日志 → 若触发审核/中断，观察回复是否被保留、面板是否出现存档；把出问题的 **Console 截图 / 应用版本 / 触发时间** 发回来即可针对性修。

## 目录（工作区）

- `premod/src/`：多站点引擎、DeepSeek/Claude 纯逻辑核心、ChatGPT 原代码
- `premod/build.mjs`：组装脚本（`node premod/build.mjs`）
- `premod/dist/PreMod.user.js`：构建产物（与 Downloads 里的文件一致）
- `premod/test/`：Node 单元/集成测试（`node premod/test/*.test.*`）
- `research/domestic-sites.md`：国内站点机制调研报告（含证据链接与实测清单）
