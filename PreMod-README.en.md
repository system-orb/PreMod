# PreMod — Multi-Site Edition (v3.0.0)

An unofficial userscript that keeps AI chat replies alive, recovers what the platform tried to remove, and keeps a local archive of every reply you have already seen.

This build is based on **[ChatGPT PreMod 2.4.2](https://github.com/horselock/ChatGPT-PreMod)** by [horselock](https://github.com/horselock). The ChatGPT code path is bundled **byte-for-byte unchanged** (verified by SHA-256 during the build); everything else is a new multi-site layer.

- Userscript file: `PreMod.user.js` (replaces the previous 2.4.2 file; the original is kept as `PreMod.user.js.2.4.2.bak` next to it)
- Userscript managers: Tampermonkey or Violentmonkey (any Chromium/Firefox browser)
- Supported sites: **ChatGPT, DeepSeek, Claude, Qwen/Tongyi, Doubao, Kimi**, plus a generic fallback for other chat sites

## Feature overview

| Site | What PreMod does |
|---|---|
| **ChatGPT** (`chatgpt.com`, `chat.openai.com`) | Original PreMod feature set: hides moderation visual effects, prevents flagged (“red”) streamed replies from being deleted, saves them locally and restores them when the conversation is reopened. Code unchanged from upstream 2.4.2. |
| **DeepSeek** (`chat.deepseek.com`) | Intercepts recall events. When DeepSeek replaces a streamed reply with a template block and sets `CONTENT_FILTER`, PreMod rewrites that SSE event so the reply text is **kept** and a small warning tip is appended instead; normal replies are archived as well; recalled messages are restored automatically the next time the conversation is loaded (`history_messages` rewrite). |
| **Claude** (`claude.ai`) | Auto-clicks the **Continue** button when Claude pauses with “This response ended early” / “Paused when your free usage ran out”; captures every streamed completion into the local archive; when a conversation is opened and a saved reply is no longer present, it notifies you and the reply can be recovered from the panel. |
| **Qwen / Tongyi** (`qianwen.com`, `tongyi.com`) | Qwen streams **full snapshots** rather than deltas. If a newer snapshot no longer contains the text you already saw (rewritten/replaced), the previous version is archived; `error_code` responses are surfaced. |
| **Doubao** (`doubao.com`) | Parses the SSE event blocks, accumulates reply text, recognises `STREAM_ERROR` and risk codes `710022002` / `710022004`, and keeps the reply available in the archive. |
| **Kimi** (`kimi.com`, `moonshot.cn`) | Decodes the Connect-RPC binary frame stream (`/apiv2/kimi.gateway.chat.v1.ChatService/Chat`); when an `op: set` overwrites already-displayed text, the old version is archived; the complete reply is archived when the stream finishes. |
| Other sites | A generic best-effort adapter (fetch/XHR/WebSocket/EventSource + DOM fallback) that archives plausible streamed reply text into the same local panel. |

> **Design note:** for the Chinese sites there is currently **no public evidence** that a reply can be displayed and then rolled back by moderation. PreMod's strategy is therefore *passive*: archive everything as it streams, detect when the platform overwrites what was already shown, and keep the previous version. It does not and cannot bypass server-side moderation.

## Install

1. Install a userscript manager: **Tampermonkey** (recommended for Edge/Chrome) or **Violentmonkey**. On Chromium browsers make sure the extension is allowed to run user scripts (`chrome://extensions` → userscript manager → Details → **Allow User Scripts**, or enable Developer mode).
2. Install the script, either by:
   - opening `PreMod.user.js` from a web/`http(s)` URL so your userscript manager shows its install page, or
   - opening the manager's dashboard → **Create a new script**, pasting the full contents of `PreMod.user.js`, and saving.
3. **Remove or disable the old “ChatGPT PreMod” script** if you had it installed, so two copies do not run on `chatgpt.com` at the same time.
4. Reload the target sites. You should see a short “PreMod Active” banner (configurable) and, on Claude/Qwen/Doubao/Kimi and other generic sites, a floating **PreMod** button in the bottom-right corner.

## Usage

- **DeepSeek** works automatically; when a recall is intercepted you get a banner and the text stays in the conversation.
- **Claude** works automatically; “Continue” is only clicked inside an explicit pause/ended-early warning banner and is rate-limited per reason.
- **Archive panel** (Claude, Qwen/Tongyi, Doubao, Kimi, generic sites): click the **PreMod** button in the bottom-right corner.
  - Each entry can be copied or removed.
  - The header buttons export the archive as JSON or clear it.
  - Everything is stored in `localStorage`, per origin, and never uploaded.
- **Userscript menu** (click the Tampermonkey/Violentmonkey toolbar icon while on a supported site):
  - `Toggle all banners`, `Toggle "PreMod Active" startup banner` — all sites
  - `Toggle DeepSeek 防撤回` — DeepSeek anti-recall on/off
  - `Toggle Claude 自动继续`, `Toggle 本地留痕` — Claude auto-continue / local archive
  - `Toggle 本地留痕`, `Show PreMod 存档面板` — archive on/off and open the panel

## Privacy

- All captured text stays in your browser (`localStorage` + userscript-manager storage). Nothing is sent anywhere.
- The script only reads responses that the page has already received; it does not forge requests or bypass authentication.
- Clearing the site data / `localStorage` for a site deletes its archive. Use the panel's **Export** button for anything important.

## Limitations and known unknowns

- **No server-side moderation bypass.** PreMod only preserves content the server already delivered to your browser (plus the version that was on screen before an overwrite).
- **Domestic-site behaviour is unverified in the wild.** Kimi/Qwen/Doubao web UI moderation strings and the “display-then-recalled” behaviour have no public evidence; the adapters follow publicly documented protocol reversals (2026). A site redesign may break an adapter.
- **Kimi** decoding targets the current `www.kimi.com` Connect-RPC protocol; an older `/api/chat/.../completion/stream` path is also matched.
- **Claude** auto-continue only acts on the explicit pause/ended-early banners and has a cooldown; it never clicks generic Continue/Upgrade buttons.
- **ChatGPT** behaviour is exactly that of upstream 2.4.2 — including its own limitations.
- Use at your own discretion and in line with each platform's terms of service.

## Verifying it works

1. Open DevTools (F12) → Console; look for `[PreMod:<site>]` log lines while chatting.
2. On DeepSeek, a flagged reply should stay visible with a warning tip and appear in the conversation again after reloading.
3. On Claude/Qwen/Doubao/Kimi, the panel should collect replies as they stream. If a reply disappears or is overwritten, it should already be in the panel.
4. If a site stops working, capture the Console output (site, time, `[PreMod:...]` errors) and report it.

## Development

```
premod/
  src/
    chatgpt-inpage.js        original ChatGPT 2.4.2 page code (unchanged)
    multisite-inpage.js      shared engine + DeepSeek / Claude / Qwen / Doubao / Kimi / generic adapters
    deepseek-core.js         DOM-free DeepSeek recall tracker + history restorer (unit tested)
    claude-core.js           DOM-free Claude stream capture / conversation helpers (unit tested)
  build.mjs                  assembles dist/PreMod.user.js, verifies the ChatGPT part hash
  dist/PreMod.user.js        build output
  test/                      Node tests: cores, DeepSeek adapter, Claude adapter, domestic adapters, generic adapter
  serve.cjs                  optional localhost helper to expose the script to the userscript manager
```

Build and test (Node.js 22+):

```bash
node premod/build.mjs
node premod/test/cores.test.cjs
node premod/test/deepseek-adapter.test.mjs
node premod/test/claude-adapter.test.mjs
node premod/test/domestic-adapters.test.mjs
node premod/test/generic-adapter.test.mjs
```

The build refuses to complete if the ChatGPT page code no longer matches the extracted 2.4.2 source, and the tests verify the DeepSeek SSE rewriting, Claude stream capture, the Qwen snapshot-diff logic, Doubao SSE parsing and Kimi Connect-RPC frame decoding with synthetic traffic.

## Credits and licensing

- **ChatGPT PreMod** — original userscript, concept and ChatGPT implementation by [horselock](https://github.com/horselock/ChatGPT-PreMod). The ChatGPT portion in this bundle is unmodified 2.4.2 code; refer to the upstream repository for its terms. Synced to upstream release 2.4.2 (2026-11-07).
- DeepSeek anti-recall mechanism informed by the community project `G-124/DeepSeek-Anti--recall`; Claude protocol details informed by `oaustegard/browser-extensions` (claude-cache-extension); Kimi/Qwen/Doubao protocol details from the research notes in `research/domestic-sites.md`.
- Multi-site engine, adapters, tests and build tooling: written for this project.

No license is declared for the bundled upstream ChatGPT portion; the original project's terms apply to it. Use responsibly.
