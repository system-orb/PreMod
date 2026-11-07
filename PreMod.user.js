// ==UserScript==
// @name         PreMod（多站点）
// @namespace    HORSELOCK.chatgpt
// @version      3.0.0
// @description  ChatGPT + DeepSeek + Claude + Kimi/通义/豆包：隐藏审核视觉提示、阻止并找回被撤回/被中断的回复，并在本地留痕。ChatGPT 部分沿用 horselock 的 ChatGPT PreMod 2.4.2。
// @match        *://chatgpt.com/*
// @match        *://chat.openai.com/*
// @match        *://chat.deepseek.com/*
// @match        *://claude.ai/*
// @match        *://*.kimi.com/*
// @match        *://*.moonshot.cn/*
// @match        *://*.tongyi.com/*
// @match        *://*.qianwen.com/*
// @match        *://*.doubao.com/*
// @downloadURL  https://github.com/system-orb/PreMod/raw/main/PreMod.user.js
// @updateURL    https://github.com/system-orb/PreMod/raw/main/PreMod.user.js
// @run-at       document-start
// @grant        GM.getValue
// @grant        GM.getValues
// @grant        GM.setValue
// @grant        GM.registerMenuCommand
// @grant        GM.addElement
// @grant        GM_addElement
// ==/UserScript==

(() => { "use strict";
  // ChatGPT restores a conversation from its local cache, where blocked messages are
  // already blanked. A messageId parameter makes it load history from the server instead,
  // which we can fix up. Empty selects that mode without pointing at a particular message.
  // Set it before the app reads the initial URL; the page code covers later navigation.
  const historyModeUrl = (destination) => {
    const url = new URL(destination, location.href);
    if (url.origin !== location.origin || !/\/c\/[a-f0-9-]{36}\/?$/i.test(url.pathname)) return null;
    if (url.searchParams.has('messageId') || url.searchParams.has('message')) return null;
    url.searchParams.set('messageId', '');
    return url.href;
  };

  try {
    const initialUrl = window.top === window.self && historyModeUrl(location.href);
    if (initialUrl) history.replaceState(history.state, '', initialUrl);
  } catch {}

  const messageHandler = async (event) => {
    const data = event.data;
    if (!data || data.type !== 'premod-bridge') return;

    let result;
    try {
      if (data.op === 'get') result = await GM.getValue(data.key);
      else if (data.op === 'getMany') {
        result = typeof GM.getValues === 'function' ? await GM.getValues(data.key)
          : Object.fromEntries(await Promise.all(data.key.map(async (key) => [key, await GM.getValue(key)])));
      }
      else if (data.op === 'set') { await GM.setValue(data.key, data.value); result = true; }
    } catch (e) {
      result = null;
    }

    window.postMessage({ type: 'premod-response', id: data.id, result }, '*');
  };

  window.addEventListener('message', messageHandler);

  const toggleSetting = async (key, label) => {
    const value = (await GM.getValue(key, true)) === false;
    await GM.setValue(key, value);
    window.postMessage({ type: 'premod-setting', key, value, label }, '*');
  };

  if (typeof GM.registerMenuCommand === 'function') {
    GM.registerMenuCommand('Toggle all banners', () => toggleSetting('showBanners', 'Banners'));
    GM.registerMenuCommand('Toggle "PreMod Active" startup banner', () => toggleSetting('showStartupBanner', 'Startup banner'));
  }

    const site = (() => {
    const host = location.hostname;
    if (/(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/.test(host)) return 'chatgpt';
    if (/(^|\.)deepseek\.com$/.test(host)) return 'deepseek';
    if (/(^|\.)claude\.ai$/.test(host)) return 'claude';
    return 'generic';
  })();

  if (typeof GM.registerMenuCommand === 'function') {
    if (site === 'deepseek') {
      GM.registerMenuCommand('Toggle DeepSeek 防撤回（拦截撤回、保留正文）', () => toggleSetting('deepseekAntiRecall', 'DeepSeek 防撤回'));
    }
    if (site === 'claude') {
      GM.registerMenuCommand('Toggle Claude 自动继续（Continue）', () => toggleSetting('claudeAutoContinue', 'Claude 自动继续'));
      GM.registerMenuCommand('Toggle 本地留痕（自动保存回复）', () => toggleSetting('archive', '本地留痕'));
      GM.registerMenuCommand('Show PreMod 存档面板', () => window.postMessage({ type: 'premod-show-panel' }, '*'));
    }
    if (site === 'generic') {
      GM.registerMenuCommand('Toggle 本地留痕（自动保存回复）', () => toggleSetting('archive', '本地留痕'));
      GM.registerMenuCommand('Show PreMod 存档面板', () => window.postMessage({ type: 'premod-show-panel' }, '*'));
    }
  }

  const chatgptInpage = `(() => { "use strict";
    if (document.documentElement.dataset.premodInjected === '1') return;
    document.documentElement.dataset.premodInjected = '1';

    const settings = { showBanners: true, showStartupBanner: true };
    const pendingBridgeRequests = new Map();

    const bridge = (operation, key, value) => new Promise((resolve) => {
      const id = Math.random().toString(36).slice(2);
      pendingBridgeRequests.set(id, resolve);
      window.postMessage({ type: 'premod-bridge', id, op: operation, key, value }, '*');
    });

    const settingsLoaded = Promise.all(Object.keys(settings).map(async (key) => {
      const value = await bridge('get', key);
      if (typeof value === 'boolean') settings[key] = value;
    }));

    const showBanner = async (message, color = "#2c7a7b", duration = 2000, force = false) => {
      await settingsLoaded;
      if (!force && !settings.showBanners) return;
      if (!document.body) return setTimeout(() => showBanner(message, color, duration, force), 100);

      document.getElementById('premod-banner')?.remove();
      const banner = document.createElement('div');
      banner.id = 'premod-banner';
      banner.textContent = message;
      Object.assign(banner.style, {position:"fixed",top:"15px",left:"50%",transform:"translateX(-50%)",padding:"8px 14px",borderRadius:"6px",color:"#fff",background:color,zIndex:999999,boxShadow:"0 3px 10px #0005",opacity:"0",transition:"opacity .25s, top .25s",pointerEvents:"none"});
      document.body.appendChild(banner);

      requestAnimationFrame(() => {
        banner.style.opacity = "1";
        banner.style.top = "25px";
      });

      setTimeout(() => {
        banner.style.opacity = "0";
        banner.style.top = "15px";
        setTimeout(() => banner.remove(), 250);
      }, duration);
    };

    settingsLoaded.then(() => {
      if (settings.showStartupBanner) showBanner("PreMod Active");
    });

    const messageListener = (event) => {
      const data = event.data;
      if (data?.type === 'premod-response' && pendingBridgeRequests.has(data.id)) {
        const resolve = pendingBridgeRequests.get(data.id);
        pendingBridgeRequests.delete(data.id);
        resolve(data.result);
      } else if (data?.type === 'premod-setting' && data.key in settings && typeof data.value === 'boolean') {
        settings[data.key] = data.value;
        showBanner(data.label + ': ' + (data.value ? 'ON' : 'OFF'), "#2c7a7b", 2000, true);
      }
    };

    window.addEventListener('message', messageListener);

    const apiUrlPattern = /\\/backend-api\\/(?:f\\/)?conversations?(?:\\/[a-f0-9-]{36}(?:\\/messages)?)?(?:\\?.*)?$/i;
    const unblockFlagged = (moderationObj) => moderationObj?.blocked && (moderationObj.blocked = false, true);

    // ChatGPT now starts the visible reply with is_visually_hidden_from_conversation: true and
    // reveals it with a later "remove" op. Only strip ops that hide; never the one that reveals.
    const HIDDEN_FLAG = 'is_visually_hidden_from_conversation';
    const isHideOp = (op) => !!op?.p?.includes(HIDDEN_FLAG) && op.o !== 'remove' && !!op.v;
    // Reveal a reply that arrives already hidden, in case the reveal op never comes (e.g. a red)
    const unhideSnapshot = (payload) => {
      const message = payload?.v?.message;
      if (message?.metadata?.[HIDDEN_FLAG] && message.author?.role === 'assistant') {
        message.metadata[HIDDEN_FLAG] = false;
        return true;
      }
      return false;
    };

    // Your message text is only sent on the POST that starts a turn. Stash it here (same
    // source the old fetch path read from args[1].body) so the WebSocket hook can restore
    // it if the request gets blocked - the block verdict now arrives over the WebSocket.
    const pendingInputs = new Map(); // message_id -> content
    const rememberInput = (args) => {
      try {
        const body = args?.[1]?.body;
        if (typeof body !== 'string') return;
        const parsed = JSON.parse(body);
        if (!Array.isArray(parsed.messages)) return;
        if (pendingInputs.size > 100) pendingInputs.clear();
        for (const m of parsed.messages) {
          if (m?.id && typeof m.content?.parts?.[0] === 'string') pendingInputs.set(m.id, m.content.parts[0]);
        }
      } catch {}
    };

    // Follows the messages a turn streams (snapshots, appends and patch ops) so a blocked
    // one can be saved with its full text. Saves when the verdict arrives, then again
    // whenever more text follows it. Used by both the fetch stream and the WebSocket.
    const createCapture = (transport) => {
      const messages = new Map(); // message_id -> { role, channel, text }
      let activeId = null;
      let lastPath = '';
      let lastOperation = 'append';
      let unassignedText = '';
      const blockedIds = new Set();
      const saved = new Map(); // message_id -> text last written
      let saveQueue = Promise.resolve();

      const rememberMessage = (message) => {
        activeId = message.id;
        lastPath = '';
        lastOperation = 'append';
        const previous = messages.get(activeId);
        messages.set(activeId, {
          role: message.author?.role || previous?.role,
          channel: message.channel || previous?.channel,
          text: Array.isArray(message.content?.parts)
            ? message.content.parts.filter(part => typeof part === 'string').join('')
            : (previous?.text || '')
        });
        // A full message snapshot supersedes any text we couldn't attribute yet
        unassignedText = '';
      };

      const captureOperation = (op) => {
        if (!op || typeof op !== 'object') return;
        // Deltas omit p and o when they repeat the previous op's
        const path = typeof op.p === 'string' ? op.p : lastPath;
        const operation = op.o || lastOperation;
        lastPath = path;
        lastOperation = operation;
        if (op.v?.message?.id) return rememberMessage(op.v.message);
        if (path === '/message' && op.v?.id) return rememberMessage(op.v);
        const state = messages.get(activeId);
        if (path === '/message/channel' && state) { state.channel = op.v; return; }
        if (path === '/message/author/role' && state) { state.role = op.v; return; }
        // Metadata, status and tool updates must not become response text
        if (path && !/^\\/message\\/content(?:\\/parts(?:\\/\\d+)?)?$/.test(path)) return;
        if (operation === 'patch' && Array.isArray(op.v)) {
          for (const child of op.v) captureOperation(child);
          return;
        }
        let text;
        if (typeof op.v === 'string') text = op.v;
        else if (Array.isArray(op.v) && path === '/message/content/parts') text = op.v.filter(part => typeof part === 'string').join('');
        else if (Array.isArray(op.v?.parts)) text = op.v.parts.filter(part => typeof part === 'string').join('');
        if (text === undefined) return;
        if (operation !== 'append' && operation !== 'replace' && operation !== 'add') return;
        if (state) {
          if (state.role && state.role !== 'assistant') return;
          if (state.channel && state.channel !== 'final') return;
          state.text = operation === 'append' ? state.text + text : text;
        } else {
          unassignedText = operation === 'append' ? unassignedText + text : text;
        }
      };

      const capturePayload = (payload) => {
        if (payload.message?.id) rememberMessage(payload.message);
        if (payload.v?.message?.id) rememberMessage(payload.v.message);
        else if (Array.isArray(payload.v)) for (const op of payload.v) captureOperation(op);
        else if (Object.prototype.hasOwnProperty.call(payload, 'v')) captureOperation(payload);
      };

      const markBlocked = (id) => {
        if (!id) return;
        blockedIds.add(id);
        const isInput = pendingInputs.has(id);
        // A verdict for a message we never saw a snapshot of claims the text streamed so far
        if (!isInput && !messages.has(id) && (unassignedText || !activeId)) {
          messages.set(id, { role: 'assistant', channel: 'final', text: unassignedText });
          activeId = id;
          unassignedText = '';
        }
        console.debug('[PreMod] ' + transport + ': Detected blocked ' + (isInput ? 'input' : 'response') + ':', id);
        if (isInput) showBanner('REQUEST RED. Be careful!', '#c53030', 5000);
      };

      const persistBlocked = async () => {
        for (const id of blockedIds) {
          const isInput = pendingInputs.has(id);
          const text = isInput ? pendingInputs.get(id) : messages.get(id)?.text;
          if (!text || saved.get(id) === text) continue;
          if (await bridge('set', 'msg_' + id, text) !== true) {
            console.warn('[PreMod] ' + transport + ': Could not save blocked message:', id);
            continue;
          }
          if (!saved.has(id) && !isInput) showBanner('Response red, saved it for you =)', '#dd6b20');
          saved.set(id, text);
          console.debug('[PreMod] ' + transport + ': Saved blocked ' + (isInput ? 'input' : 'response') + ':', id, 'characters:', text.length);
        }
      };

      // Queued so an earlier, shorter snapshot can't overwrite newer text
      const persist = () => {
        if (blockedIds.size) saveQueue = saveQueue.then(persistBlocked);
        return saveQueue;
      };

      const warnUnsaved = () => {
        for (const id of blockedIds) {
          if (!saved.has(id)) console.warn('[PreMod] ' + transport + ': No text captured for blocked message:', id);
        }
      };

      return { capturePayload, markBlocked, persist, warnUnsaved };
    };

    const originalFetch = fetch;
    fetch = async function(...args) {
      const requestUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url;
      if (!requestUrl || !apiUrlPattern.test(requestUrl)) {
        return originalFetch.apply(this, args);
      }
      rememberInput(args);

      const apiResponse = await originalFetch.apply(this, args);
      const contentType = (apiResponse.headers.get('content-type') || '').toLowerCase();

      if (contentType.includes('text/event-stream') && apiResponse.body) {
        const capture = createCapture('Stream');

        // Rewrite one complete SSE event; null drops it
        const processEvent = (rawEvent) => {
          const lines = rawEvent.split(/\\r?\\n/);
          const dataLines = lines.filter(line => line.startsWith('data:'));
          if (!dataLines.length) return rawEvent;
          const data = dataLines.map(line => line.slice(5).replace(/^ /, '')).join('\\n');
          if (data.trim() === '[DONE]') return rawEvent;
          let payload;
          try { payload = JSON.parse(data); } catch { return rawEvent; }
          if (!payload || typeof payload !== 'object') return rawEvent;
          capture.capturePayload(payload);
          let changed = unhideSnapshot(payload);

          // Check for blocked messages FIRST before filtering anything
          if (unblockFlagged(payload.moderation_response)) {
            capture.markBlocked(payload.message_id);
            changed = true;
          }

          // Filter out type: "moderation" chunks (AFTER checking for blocked)
          if (payload.type === 'moderation') {
            console.debug('[PreMod] Filtered out moderation chunk:', payload);
            return null;
          }

          // Filter out is_visually_hidden_from_conversation delta (AFTER checking for blocked)
          if (Array.isArray(payload.v)) {
            const filtered = payload.v.filter(op => !isHideOp(op));
            if (filtered.length < payload.v.length) {
              console.debug('[PreMod] Filtered out visibility hide op from delta:', payload);
              showBanner('Safety disclaimer bypassed', "#48bb78", 3000);
              if (filtered.length === 0) return null;
              payload.v = filtered;
              changed = true;
            }
          }

          if (!changed) return rawEvent;
          return lines.filter(line => !line.startsWith('data:')).concat('data: ' + JSON.stringify(payload)).join('\\n');
        };

        const reader = apiResponse.body.getReader();
        const modifiedStream = new ReadableStream({
          async start(controller) {
            const decoder = new TextDecoder();
            const encoder = new TextEncoder();
            // Network chunks can split an event, so only process complete ones
            let buffer = '';
            const flushEvents = async (atEnd = false) => {
              let boundary;
              while ((boundary = /\\r?\\n\\r?\\n/.exec(buffer))) {
                const rewritten = processEvent(buffer.slice(0, boundary.index));
                buffer = buffer.slice(boundary.index + boundary[0].length);
                if (rewritten !== null) controller.enqueue(encoder.encode(rewritten + '\\n\\n'));
              }
              if (atEnd && buffer) {
                const rewritten = processEvent(buffer);
                buffer = '';
                if (rewritten !== null) controller.enqueue(encoder.encode(rewritten + '\\n\\n'));
              }
              await capture.persist();
            };

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                await flushEvents();
              }
              buffer += decoder.decode();
              await flushEvents(true);
              capture.warnUnsaved();
              controller.close();
            } catch (error) {
              await capture.persist();
              controller.error(error);
            }
          },
          cancel(reason) { return reader.cancel(reason); }
        });

        return new Response(modifiedStream, {
          headers: apiResponse.headers,
          status: apiResponse.status,
          statusText: apiResponse.statusText
        });
      }

      if (contentType.includes('application/json')) {
        let responseText = await apiResponse.text();
        try {
          const responseData = JSON.parse(responseText);
          let modified = false;

          // Full loads key messages by node under "mapping"; paginated loads
          // (/conversations/<id>/messages) list them under "messages", bare or in node wrappers.
          const slots = new Map(); // message_id -> message
          const addSlot = (message, fallbackId) => {
            if (!message || typeof message !== 'object') return;
            const id = message.id || fallbackId;
            if (typeof id === 'string' && !slots.has(id)) slots.set(id, message);
          };
          for (const [nodeId, node] of Object.entries(responseData.mapping || {})) addSlot(node?.message, nodeId);
          const walkMessages = (value, fallbackId) => {
            if (!value || typeof value !== 'object') return;
            if (Array.isArray(value)) {
              for (const item of value) walkMessages(item);
            } else if (value.message && typeof value.message === 'object') {
              addSlot(value.message, value.id || fallbackId);
            } else if ((value.id || fallbackId) && (value.author || value.content)) {
              addSlot(value, fallbackId);
            } else {
              for (const [key, child] of Object.entries(value)) {
                if (key !== 'metadata' && key !== 'content') walkMessages(child, key);
              }
            }
          };
          walkMessages(responseData.messages);

          // Verdicts can cover older messages that only arrive on a later page; look those up too
          const moderation = Array.isArray(responseData.moderation_results) ? responseData.moderation_results : [];
          const lookupIds = new Set([...slots.keys(), ...moderation.map(result => result.message_id).filter(Boolean)]);
          const savedText = new Map();
          const storedValues = await bridge('getMany', [...lookupIds].map(id => 'msg_' + id));
          for (const id of lookupIds) {
            const text = storedValues?.['msg_' + id];
            if (typeof text === 'string' && text) savedText.set(id, text);
          }

          for (const [id, message] of slots) {
            if (savedText.has(id)) {
              console.debug('[PreMod] Convo history: Saved content found, restoring blocked message:', id);
              message.content = { ...(message.content || {}), content_type: 'text', parts: [savedText.get(id)] };
              modified = true;
            }
            // Unset is_visually_hidden_from_conversation
            if (message.metadata?.is_visually_hidden_from_conversation && message.author?.role === 'assistant') {
              console.debug('[PreMod] Convo history: Unhiding message:', id);
              message.metadata.is_visually_hidden_from_conversation = false;
              modified = true;
            }
          }

          if (moderation.length) {
            responseData.moderation_results = moderation.filter((result) => {
              // Drop the whole verdict for anything we have text for, even if its message is on
              // a page not loaded yet; any leftover verdict field can still blank the message.
              if (savedText.has(result.message_id)) {
                modified = true;
                return false;
              }
              // Filter out safety disclaimers
              if (Array.isArray(result.disclaimers) && result.disclaimers.length > 0) {
                console.debug('[PreMod] Convo history: Removed disclaimer(s)');
                result.disclaimers = [];
                modified = true;
              }
              // Leave it blocked without saved text - an unblocked-but-empty message breaks the UI (can't scroll)
              if (result.blocked) console.debug('[PreMod] Convo history: No saved content, leaving blocked:', result.message_id);
              return true;
            });
          }

          if (modified) responseText = JSON.stringify(responseData);
        } catch (error) {
          console.warn('[PreMod] Convo history: Processing failed:', error);
        }

        return new Response(responseText, {
          headers: apiResponse.headers,
          status: apiResponse.status,
          statusText: apiResponse.statusText
        });
      }

      return apiResponse;
    };

    // ===== History mode =====
    // Keep the messageId history mode (see the top of the script) when the app opens
    // another conversation. This only rewrites the URL; nothing reloads.
    for (const method of ['pushState', 'replaceState']) {
      const original = history[method];
      history[method] = function (state, title, destination) {
        let next = destination;
        if (destination != null) {
          try {
            const url = new URL(destination, location.href);
            if (url.origin === location.origin && /\\/c\\/[a-f0-9-]{36}\\/?$/i.test(url.pathname) &&
                !url.searchParams.has('messageId') && !url.searchParams.has('message')) {
              url.searchParams.set('messageId', '');
              next = url.href;
            }
          } catch {}
        }
        return original.call(this, state, title, next);
      };
    }

    // ===== WebSocket hook =====
    // Live turns now stream over ws.chatgpt.com via a "stream_handoff": the response
    // and its moderation verdict arrive as WS frames whose "encoded_item" is the exact
    // old SSE text. The fetch hook above never sees them, so we intercept here too.
    const TURN_TOPIC_PREFIX = 'conversation-turn-';
    const wsTurnState = new Map(); // topic_id -> per-turn capture

    const getWsState = (topicId) => {
      let state = wsTurnState.get(topicId);
      if (!state) {
        if (wsTurnState.size > 100) wsTurnState.clear(); // crude leak guard over a long session
        state = createCapture('WS');
        wsTurnState.set(topicId, state);
      }
      return state;
    };

    // Process one unwrapped SSE "encoded_item". Captures text and saves blocked messages, and
    // returns rewritten text if it changed anything, otherwise null (leave the frame untouched).
    const processEncodedItem = (text, capture) => {
      const lines = text.split('\\n');
      let touched = false;
      const kept = [];
      for (let line of lines) {
        if (!line.startsWith('data: ') || line === 'data: [DONE]') { kept.push(line); continue; }
        let payload;
        try { payload = JSON.parse(line.slice(6)); } catch { kept.push(line); continue; }
        capture.capturePayload(payload);
        if (unhideSnapshot(payload)) { touched = true; line = 'data: ' + JSON.stringify(payload); }

        // Block verdict: handled per message_id so a double-red saves both the request and the response.
        // A verdict can also ride on events other than standalone moderation ones, so rewrite those.
        if (unblockFlagged(payload.moderation_response)) {
          capture.markBlocked(payload.message_id);
          touched = true;
          line = 'data: ' + JSON.stringify(payload);
        }

        // Drop standalone moderation events entirely (no red flash)
        if (payload.type === 'moderation') { touched = true; continue; }

        // Strip visibility-hide ops (safety disclaimers) from delta arrays
        if (Array.isArray(payload.v)) {
          const filtered = payload.v.filter((op) => !isHideOp(op));
          if (filtered.length < payload.v.length) {
            touched = true;
            showBanner('Safety disclaimer bypassed', '#48bb78', 3000);
            if (filtered.length === 0) continue;
            payload.v = filtered;
            kept.push('data: ' + JSON.stringify(payload)); continue;
          }
        }

        kept.push(line);
      }
      capture.persist();
      return touched ? kept.join('\\n') : null;
    };

    // Walk a WS frame batch; rewrite any conversation-turn stream-items in place.
    const processWsData = (data) => {
      if (typeof data !== 'string' || data.indexOf('conversation-turn-stream') === -1) return data;
      let batch;
      try { batch = JSON.parse(data); } catch { return data; }
      if (!Array.isArray(batch)) return data;
      let changed = false;
      for (const item of batch) {
        try {
          if (!item || item.type !== 'message') continue;
          if (String(item.topic_id || '').indexOf(TURN_TOPIC_PREFIX) !== 0) continue;
          const streamItem = item.payload && item.payload.type === 'conversation-turn-stream' && item.payload.payload;
          if (!streamItem || streamItem.type !== 'stream-item' || typeof streamItem.encoded_item !== 'string') continue;
          const rewritten = processEncodedItem(streamItem.encoded_item, getWsState(item.topic_id));
          if (rewritten !== null) { streamItem.encoded_item = rewritten; changed = true; }
        } catch {}
      }
      if (!changed) return data;
      try { return JSON.stringify(batch); } catch { return data; }
    };

    // Deliver a possibly-rewritten copy of each frame to the site's listeners. We wrap
    // per-listener but cache by event so processWsData (which mutates state) runs once per frame.
    const premodProcessed = new WeakMap();
    const wrapWsListener = (listener) => function (event) {
      let newData;
      if (premodProcessed.has(event)) newData = premodProcessed.get(event);
      else { try { newData = processWsData(event.data); } catch { newData = event.data; } premodProcessed.set(event, newData); }
      if (newData === event.data) return listener.call(this, event);
      // Proxy the original event so target/currentTarget/etc. are preserved, overriding only .data
      const proxied = new Proxy(event, {
        get(target, prop) {
          if (prop === 'data') return newData;
          const value = target[prop];
          return typeof value === 'function' ? value.bind(target) : value;
        }
      });
      return listener.call(this, proxied);
    };

    const OriginalWebSocket = window.WebSocket;
    window.WebSocket = new Proxy(OriginalWebSocket, {
      construct(target, argList) {
        const ws = new target(...argList);
        const add = ws.addEventListener.bind(ws);
        const remove = ws.removeEventListener.bind(ws);
        const wrappedByOriginal = new WeakMap();
        ws.addEventListener = function (type, listener, options) {
          if (type === 'message' && typeof listener === 'function') {
            const wrapped = wrapWsListener(listener);
            wrappedByOriginal.set(listener, wrapped);
            return add('message', wrapped, options);
          }
          return add(type, listener, options);
        };
        ws.removeEventListener = function (type, listener, options) {
          if (type === 'message' && typeof listener === 'function' && wrappedByOriginal.has(listener)) {
            return remove('message', wrappedByOriginal.get(listener), options);
          }
          return remove(type, listener, options);
        };
        let onMessageHandler = null;
        let onMessageWrapped = null;
        Object.defineProperty(ws, 'onmessage', {
          configurable: true,
          enumerable: true,
          get() { return onMessageHandler; },
          set(fn) {
            if (onMessageWrapped) { remove('message', onMessageWrapped); onMessageWrapped = null; }
            onMessageHandler = typeof fn === 'function' ? fn : null;
            if (onMessageHandler) { onMessageWrapped = wrapWsListener(onMessageHandler); add('message', onMessageWrapped); }
          }
        });
        return ws;
      }
    });
  })();`;
  const multisiteInpage = `(() => { "use strict";
    if (document.documentElement.dataset.premodInjected === '1') return;
    document.documentElement.dataset.premodInjected = '1';

    const SITE = (() => {
      const host = location.hostname;
      if (/(^|\\.)deepseek\\.com$/.test(host)) return 'deepseek';
      if (/(^|\\.)claude\\.ai$/.test(host)) return 'claude';
      return 'generic';
    })();
    const HOST = location.hostname;
    const VERSION = '3.0.0';

/*
 * PreMod DeepSeek core — pure logic for DeepSeek chat recall ("撤回") interception.
 *
 * DeepSeek's web client streams patch-style SSE events: {p, o, v}. When a reply
 * gets pulled by moderation the server sends a BATCH on "response" that swaps the
 * reply fragments for a TEMPLATE_RESPONSE block and sets status CONTENT_FILTER.
 * The page then replaces everything it rendered so far. The original fragments
 * were streamed to the browser already, so we keep a mirror of the response state
 * and, when the recall arrives, rewrite the event so the UI keeps the text and
 * shows a small warning tip instead.
 *
 * This module is deliberately DOM-free so it can be unit tested in Node.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PreModDeepSeekCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var CONTENT_FILTER = "CONTENT_FILTER";
  var TEMPLATE_RESPONSE = "TEMPLATE_RESPONSE";
  var RECALL_TIP = "\\u26a0\\ufe0f \\u6b64\\u56de\\u590d\\u5df2\\u88ab\\u62e6\\u622a\\uff0c\\u6b63\\u6587\\u5df2\\u7531 PreMod \\u5728\\u672c\\u6d4f\\u89c8\\u5668\\u5b58\\u6863";

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch (e) { return null; }
  }

  function parseKey(key, container) {
    if (Array.isArray(container) && /^[-+]?\\d+$/.test(key)) {
      var index = parseInt(key, 10);
      if (index < 0) index = container.length + index;
      return index;
    }
    return key;
  }

  function setByPath(obj, path, value, isAppend) {
    var keys = String(path).split("/");
    var current = obj;
    for (var i = 0; i < keys.length - 1; i++) {
      var key = parseKey(keys[i], current);
      if (current[key] === undefined || current[key] === null || typeof current[key] !== "object") {
        current[key] = /^[-+]?\\d+$/.test(keys[i + 1]) ? [] : {};
      }
      current = current[key];
    }
    var lastKey = parseKey(keys[keys.length - 1], current);
    if (isAppend) {
      if (Array.isArray(current[lastKey]) && Array.isArray(value)) {
        for (var j = 0; j < value.length; j++) current[lastKey].push(value[j]);
      } else if (Array.isArray(current[lastKey])) {
        current[lastKey].push(value);
      } else {
        current[lastKey] = (current[lastKey] == null ? "" : current[lastKey]) + value;
      }
    } else {
      current[lastKey] = value;
    }
    return obj;
  }

  function hasTemplateResponse(fragments) {
    if (!Array.isArray(fragments)) return false;
    for (var i = 0; i < fragments.length; i++) {
      var fragment = fragments[i];
      if (fragment && fragment.type === TEMPLATE_RESPONSE) return true;
    }
    return false;
  }

  /** Text size of the real answer fragments (ignores thinking and template blocks). */
  function answerLength(fragments) {
    if (!Array.isArray(fragments)) return 0;
    var total = 0;
    for (var i = 0; i < fragments.length; i++) {
      var fragment = fragments[i];
      if (!fragment || typeof fragment.content !== "string") continue;
      if (fragment.type === TEMPLATE_RESPONSE) continue;
      total += fragment.content.length;
    }
    return total;
  }

  /** True when the fragments contain a non-empty assistant answer fragment. */
  function hasAnswer(fragments) {
    if (!Array.isArray(fragments)) return false;
    for (var i = 0; i < fragments.length; i++) {
      var fragment = fragments[i];
      if (!fragment || typeof fragment.content !== "string") continue;
      if (fragment.type === TEMPLATE_RESPONSE) continue;
      if (fragment.type === "TIP") continue;
      if (fragment.content.trim().length >= 2) return true;
    }
    return false;
  }

  function nextFragmentId(fragments) {
    var highest = 0;
    if (Array.isArray(fragments)) {
      for (var i = 0; i < fragments.length; i++) {
        var id = fragments[i] && fragments[i].id;
        if (typeof id === "number" && id > highest) highest = id;
      }
    }
    return highest + 1;
  }

  function makeRecallTip(fragments) {
    return {
      p: "fragments",
      o: "APPEND",
      v: [{ id: nextFragmentId(fragments), type: "TIP", style: "WARNING", content: RECALL_TIP }]
    };
  }

  /**
   * Tracks one DeepSeek completion stream (one SSE response body).
   * update() consumes one parsed JSON event and reports whether it should be rewritten.
   */
  function Tracker(options) {
    options = options || {};
    this.fields = {};
    this.path = "";
    this.mode = "SET";
    this.sessionId = options.sessionId || "";
    this._messageId = null;
    this.recalled = false;
    this.finished = false;
    this.lastSave = null;
  }

  Tracker.prototype.fragments = function () {
    var response = this.fields && this.fields.response;
    return response && Array.isArray(response.fragments) ? response.fragments : null;
  };

  Tracker.prototype.messageId = function () {
    var response = this.fields && this.fields.response;
    if (response && response.message_id != null) return response.message_id;
    return this._messageId;
  };

  Tracker.prototype.snapshotForSave = function (reason) {
    var fragments = this.fragments();
    var messageId = this.messageId();
    if (!messageId && !this.sessionId) return null;
    if (!hasAnswer(fragments)) return null;
    return {
      reason: reason,
      sessionId: this.sessionId,
      messageId: messageId,
      fragments: clone(fragments)
    };
  };

  Tracker.prototype.setField = function (path, value, mode) {
    if (mode === "BATCH" && Array.isArray(value)) {
      var subMode = "SET";
      for (var i = 0; i < value.length; i++) {
        var op = value[i];
        if (!op || typeof op !== "object") continue;
        if (op.o) subMode = op.o;
        this.setField(path + "/" + op.p, op.v, subMode);
      }
      return;
    }
    if (mode === "APPEND") setByPath(this.fields, path, value, true);
    else if (mode === "BATCH" || mode === "ADD") setByPath(this.fields, path, value, false);
    else setByPath(this.fields, path, value, false);
  };

  /**
   * @param {object} event parsed SSE data object
   * @returns {{rewritten: object|null, recall: boolean, finished: boolean, save: object|null}}
   */
  Tracker.prototype.update = function (event) {
    var result = { rewritten: null, recall: false, finished: false, save: null };
    if (!event || typeof event !== "object") return result;

    var path = typeof event.p === "string" ? event.p : this.path;
    var mode = typeof event.o === "string" ? event.o : this.mode;

    // Initial snapshot: full object with no path yet.
    if (this.path === "" && event.v && typeof event.v === "object" && !Array.isArray(event.v)) {
      for (var key in event.v) {
        if (Object.prototype.hasOwnProperty.call(event.v, key)) this.fields[key] = event.v[key];
      }
      if (typeof event.p === "string") this.path = event.p;
      if (typeof event.o === "string") this.mode = event.o;
      return result;
    }

    // Recall can also arrive as plain ops instead of a BATCH. Normalise those first.
    if (!Array.isArray(event.v) && event.v === CONTENT_FILTER && /(^|\\/)status$/.test(path)) {
      var beforeStatus = clone(this.fragments());
      result.recall = true;
      result.finished = true;
      result.rewritten = { p: path, o: "SET", v: "FINISHED" };
      result.save = {
        reason: "recall",
        sessionId: this.sessionId,
        messageId: this.messageId(),
        fragments: beforeStatus
      };
      this.recalled = true;
      event = result.rewritten;
    }
    if (!result.recall && Array.isArray(event.v) && hasTemplateResponse(event.v) && /(^|\\/)fragments$/.test(path)) {
      var beforeFragments = clone(this.fragments());
      result.recall = true;
      result.rewritten = { p: path, o: "APPEND", v: [makeRecallTip(beforeFragments).v[0]] };
      result.save = {
        reason: "recall",
        sessionId: this.sessionId,
        messageId: this.messageId(),
        fragments: beforeFragments
      };
      this.recalled = true;
      event = result.rewritten;
    }

    // Recall detection: a BATCH against "response" swapping in the template block.
    if (Array.isArray(event.v) && (mode === "BATCH" || path === "response")) {
      var fragmentsBefore = clone(this.fragments());
      var ops = event.v;
      var rewrittenOps = null;
      for (var i = 0; i < ops.length; i++) {
        var op = ops[i];
        if (!op || typeof op !== "object") continue;
        if (op.p === "fragments" && hasTemplateResponse(op.v)) {
          if (!rewrittenOps) rewrittenOps = ops.slice();
          rewrittenOps[i] = makeRecallTip(fragmentsBefore);
          result.recall = true;
        } else if (op.p === "status" && op.v === CONTENT_FILTER) {
          if (!rewrittenOps) rewrittenOps = ops.slice();
          rewrittenOps[i] = { p: "status", o: "SET", v: "FINISHED" };
          result.finished = true;
        }
      }
      if (rewrittenOps) {
        event = Object.assign({}, event, { v: rewrittenOps });
        result.rewritten = event;
      }
      if (result.recall) {
        result.save = {
          reason: "recall",
          sessionId: this.sessionId,
          messageId: this.messageId(),
          fragments: fragmentsBefore
        };
        this.recalled = true;
      }
    }

    if (typeof event.p === "string") this.path = event.p;
    if (typeof event.o === "string") this.mode = event.o;

    // Apply the (possibly rewritten) patch to our local mirror.
    this.setField(this.path, event.v, this.mode);

    // Track finishing: either rewritten above or a plain status op.
    var response = this.fields && this.fields.response;
    if (response && response.status === "FINISHED") {
      result.finished = true;
      this.finished = true;
      if (!result.save && hasAnswer(this.fragments())) {
        result.save = this.snapshotForSave("finished");
      }
    }
    var responseMessageId = response && response.message_id;
    if (responseMessageId != null) this._messageId = responseMessageId;
    return result;
  };

  /**
   * Rewrites a chat history payload in place so recalled messages show the saved text.
   * @param {object} json parsed /api/v0/chat/history_messages response
   * @param {function(string, number|string): Array|null} lookup (sessionId, messageId) => fragments
   * @returns {{modified: boolean, restored: number, sessionId: string}}
   */
  function restoreHistory(json, lookup) {
    var report = { modified: false, restored: 0, sessionId: "" };
    if (!json || !json.data || !json.data.biz_data) return report;
    var biz = json.data.biz_data;
    if (!Array.isArray(biz.chat_messages)) return report;
    var sessionId = (biz.chat_session && biz.chat_session.id) || "";
    report.sessionId = sessionId;
    for (var i = 0; i < biz.chat_messages.length; i++) {
      var message = biz.chat_messages[i];
      if (!message || typeof message !== "object") continue;
      var needsRestore = message.status === CONTENT_FILTER || hasTemplateResponse(message.fragments);
      if (!needsRestore) continue;
      var saved = null;
      try { saved = lookup(sessionId, message.message_id); } catch (e) { saved = null; }
      if (!Array.isArray(saved) || !saved.length) continue;
      var fragments = clone(saved) || [];
      fragments.push({
        id: nextFragmentId(fragments),
        type: "TIP",
        style: "WARNING",
        content: RECALL_TIP
      });
      message.fragments = fragments;
      message.status = "FINISHED";
      report.restored++;
      report.modified = true;
    }
    return report;
  }

  /** Extracts the raw text of one DeepSeek fragment list (for archive/panel listing). */
  function fragmentsText(fragments) {
    if (!Array.isArray(fragments)) return "";
    var parts = [];
    for (var i = 0; i < fragments.length; i++) {
      var fragment = fragments[i];
      if (!fragment || typeof fragment.content !== "string") continue;
      if (fragment.type === TEMPLATE_RESPONSE || fragment.type === "TIP" || fragment.type === "THINK") continue;
      parts.push(fragment.content);
    }
    return parts.join("");
  }

  return {
    CONTENT_FILTER: CONTENT_FILTER,
    TEMPLATE_RESPONSE: TEMPLATE_RESPONSE,
    RECALL_TIP: RECALL_TIP,
    Tracker: Tracker,
    restoreHistory: restoreHistory,
    hasTemplateResponse: hasTemplateResponse,
    hasAnswer: hasAnswer,
    answerLength: answerLength,
    fragmentsText: fragmentsText,
    setByPath: setByPath,
    clone: clone
  };
});
/*
 * PreMod Claude core — DOM-free helpers for claude.ai.
 *
 * Two jobs:
 *  1. Capture the assistant text as it streams from
 *     /api/organizations/<org>/chat_conversations/<id>/completion
 *  2. Parse the conversation JSON so saved replies can be compared with what
 *     Claude actually keeps (a reply that vanished can then be offered back
 *     from the local archive).
 *
 * The capture handles both SSE shapes seen on claude.ai: the Anthropic
 * messages-style events (content_block_delta / text_delta) and the older
 * "completion" snapshot events.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PreModClaudeCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function isObject(value) {
    return !!value && typeof value === "object";
  }

  function joinTextParts(content) {
    if (!Array.isArray(content)) return "";
    var parts = [];
    for (var i = 0; i < content.length; i++) {
      var block = content[i];
      if (!block || typeof block !== "object") continue;
      if (block.type === "text" && typeof block.text === "string") parts.push(block.text);
    }
    return parts.join("");
  }

  /** Text of one message object from /chat_conversations.<id>.chat_messages */
  function messageText(message) {
    if (!message || typeof message !== "object") return "";
    if (typeof message.text === "string" && message.text) return message.text;
    if (typeof message.content === "string") return message.content;
    return joinTextParts(message.content);
  }

  /**
   * Returns [{index, uuid, text}] for assistant messages in a conversation payload.
   */
  function assistantTexts(conversationJson) {
    var messages = conversationJson && conversationJson.chat_messages;
    if (!Array.isArray(messages)) return [];
    var result = [];
    for (var i = 0; i < messages.length; i++) {
      var message = messages[i];
      if (!message || typeof message !== "object") continue;
      if (message.sender && message.sender !== "assistant") continue;
      var text = messageText(message);
      if (!text) continue;
      result.push({
        index: typeof message.index === "number" ? message.index : i,
        uuid: message.uuid || message.id || null,
        text: text
      });
    }
    return result;
  }

  function Capture() {
    this.deltaText = "";
    this.snapshotText = "";
    this.messageId = null;
    this.model = null;
    this.stopReason = null;
    this.done = false;
    this.events = 0;
  }

  Capture.prototype.text = function () {
    return this.deltaText.length >= this.snapshotText.length ? this.deltaText : this.snapshotText;
  };

  Capture.prototype.feedLine = function (line) {
    if (typeof line !== "string") return;
    line = line.trim();
    if (!line) return;
    var payload = line;
    if (line.slice(0, 5) === "data:") payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    var event;
    try { event = JSON.parse(payload); } catch (e) { return; }
    this.feedEvent(event);
  };

  Capture.prototype.feedEvent = function (event) {
    if (!isObject(event)) return;
    this.events++;
    var type = event.type;

    if (type === "message_start" && isObject(event.message)) {
      this.messageId = event.message.id || this.messageId;
      this.model = event.message.model || this.model;
      var startText = joinTextParts(event.message.content);
      if (startText) this.deltaText += startText;
    } else if (type === "content_block_start" && isObject(event.content_block)) {
      if (event.content_block.type === "text" && typeof event.content_block.text === "string") {
        this.deltaText += event.content_block.text;
      }
    } else if (type === "content_block_delta" && isObject(event.delta)) {
      if (typeof event.delta.text === "string") this.deltaText += event.delta.text;
    } else if (type === "message_delta" && isObject(event.delta)) {
      if (event.delta.stop_reason) this.stopReason = event.delta.stop_reason;
    } else if (type === "message_stop") {
      this.done = true;
    } else if (type === "completion") {
      // Older claude.ai web shape: "completion" carries the text so far.
      var completion = typeof event.completion === "string" ? event.completion
        : (typeof event.text === "string" ? event.text : null);
      if (completion && completion.length >= this.snapshotText.length) this.snapshotText = completion;
      if (event.stop_reason) this.stopReason = event.stop_reason;
    } else if (Array.isArray(event.content)) {
      var contentText = joinTextParts(event.content);
      if (contentText && contentText.length >= this.deltaText.length) this.snapshotText = contentText;
    }
  };

  /**
   * Extracts the best available assistant text out of one /completion response
   * body chunk (SSE). Returns the newly parsed text (may be empty).
   */
  Capture.prototype.feedChunk = function (chunk) {
    if (typeof chunk !== "string" || !chunk) return "";
    var before = this.deltaText.length + this.snapshotText.length;
    var lines = chunk.split(/\\r?\\n/);
    for (var i = 0; i < lines.length; i++) this.feedLine(lines[i]);
    var after = this.deltaText.length + this.snapshotText.length;
    if (after === before) return "";
    return this.text().slice(Math.min(before, this.text().length));
  };

  /** Heuristic extraction of text from a captured completion JSON body (non-SSE). */
  function completionBodyText(json) {
    if (!isObject(json)) return "";
    if (typeof json.completion === "string") return json.completion;
    if (typeof json.text === "string") return json.text;
    if (Array.isArray(json.content)) return joinTextParts(json.content);
    if (json.message) {
      var text = messageText(json.message);
      if (text) return text;
    }
    if (Array.isArray(json.chat_messages)) {
      for (var i = json.chat_messages.length - 1; i >= 0; i--) {
        var message = json.chat_messages[i];
        if (message && (!message.sender || message.sender === "assistant")) {
          var candidate = messageText(message);
          if (candidate) return candidate;
        }
      }
    }
    return "";
  }

  /** True when the page's visible conversation text already contains the saved reply. */
  function containsText(haystack, needle) {
    if (!haystack || !needle) return false;
    var normalise = function (value) { return String(value).replace(/\\s+/g, ""); };
    return normalise(haystack).indexOf(normalise(needle).slice(0, Math.max(24, Math.floor(needle.length * 0.6)))) !== -1;
  }

  return {
    Capture: Capture,
    messageText: messageText,
    assistantTexts: assistantTexts,
    completionBodyText: completionBodyText,
    containsText: containsText,
    joinTextParts: joinTextParts
  };
});

    const DsCore = globalThis.PreModDeepSeekCore || null;
    const ClaudeCore = globalThis.PreModClaudeCore || null;

    // ===== Settings + banner bridge (same protocol as the ChatGPT part) =====
    const settings = {
      showBanners: true,
      showStartupBanner: true,
      deepseekAntiRecall: true,
      claudeAutoContinue: true,
      archive: true
    };
    const pendingBridgeRequests = new Map();

    const bridge = (operation, key, value) => new Promise((resolve) => {
      const id = Math.random().toString(36).slice(2);
      pendingBridgeRequests.set(id, resolve);
      window.postMessage({ type: 'premod-bridge', id, op: operation, key, value }, '*');
    });

    const settingsLoaded = Promise.all(Object.keys(settings).map(async (key) => {
      const value = await bridge('get', key);
      if (typeof value === 'boolean') settings[key] = value;
    }));

    const showBanner = async (message, color = "#2c7a7b", duration = 2000, force = false) => {
      await settingsLoaded;
      if (!force && !settings.showBanners) return;
      if (!document.body) return setTimeout(() => showBanner(message, color, duration, force), 100);

      document.getElementById('premod-banner')?.remove();
      const banner = document.createElement('div');
      banner.id = 'premod-banner';
      banner.textContent = message;
      Object.assign(banner.style, {position:"fixed",top:"15px",left:"50%",transform:"translateX(-50%)",padding:"8px 14px",borderRadius:"6px",color:"#fff",background:color,zIndex:999999,boxShadow:"0 3px 10px #0005",opacity:"0",transition:"opacity .25s, top .25s",pointerEvents:"none"});
      document.body.appendChild(banner);

      requestAnimationFrame(() => {
        banner.style.opacity = "1";
        banner.style.top = "25px";
      });

      setTimeout(() => {
        banner.style.opacity = "0";
        banner.style.top = "15px";
        setTimeout(() => banner.remove(), 250);
      }, duration);
    };

    const messageListener = (event) => {
      const data = event.data;
      if (data?.type === 'premod-setting' && data.key in settings && typeof data.value === 'boolean') {
        settings[data.key] = data.value;
        showBanner(data.label + ': ' + (data.value ? 'ON' : 'OFF'), "#2c7a7b", 2000, true);
      } else if (data?.type === 'premod-show-panel') {
        if (!panel) createArchivePanel();
        if (panel) panel.open();
      } else if (data?.type === 'premod-response' && pendingBridgeRequests.has(data.id)) {
        const resolve = pendingBridgeRequests.get(data.id);
        pendingBridgeRequests.delete(data.id);
        resolve(data.result);
      }
    };
    window.addEventListener('message', messageListener);

    settingsLoaded.then(() => {
      if (settings.showStartupBanner) {
        const label = SITE === 'deepseek' ? 'DeepSeek' : SITE === 'claude' ? 'Claude' : HOST;
        showBanner('PreMod Active · ' + label);
      }
    });

    const debug = (...args) => { try { console.debug('[PreMod:' + SITE + ']', ...args); } catch (e) {} };

    // ===== Local archive (shared by the Claude recovery panel and the generic adapter) =====
    const ARCHIVE_KEY = 'premod_archive::' + location.origin;
    const ARCHIVE_MAX = 60;

    const archive = {
      list() {
        try {
          const parsed = JSON.parse(localStorage.getItem(ARCHIVE_KEY) || '[]');
          return Array.isArray(parsed) ? parsed : [];
        } catch (e) { return []; }
      },
      add(entry) {
        if (!settings.archive || !entry || typeof entry.text !== 'string') return null;
        const text = entry.text.trim();
        if (text.length < 10) return null;
        const list = this.list();
        // Drop an identical older copy (same conversation, same text prefix)
        const signature = location.pathname + '|' + text.slice(0, 120);
        const filtered = list.filter((item) => (String(item.path || '') + '|' + String(item.text || '').slice(0, 120)) !== signature);
        filtered.unshift({
          id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          t: Date.now(),
          path: location.pathname,
          url: location.href.slice(0, 200),
          text,
          kind: entry.kind || SITE,
          note: entry.note || ''
        });
        const trimmed = filtered.slice(0, ARCHIVE_MAX);
        try { localStorage.setItem(ARCHIVE_KEY, JSON.stringify(trimmed)); } catch (e) {
          // Quota exceeded: keep only the newest 10.
          try { localStorage.setItem(ARCHIVE_KEY, JSON.stringify(trimmed.slice(0, 10))); } catch (e2) { return null; }
        }
        if (panel) panel.refresh();
        return trimmed[0];
      },
      clear() {
        try { localStorage.removeItem(ARCHIVE_KEY); } catch (e) {}
        if (panel) panel.refresh();
      },
      remove(id) {
        const list = this.list().filter((item) => item.id !== id);
        try { localStorage.setItem(ARCHIVE_KEY, JSON.stringify(list)); } catch (e) {}
        if (panel) panel.refresh();
      }
    };

    // ===== Floating archive panel =====
    let panel = null;

    function formatTime(ms) {
      try { return new Date(ms).toLocaleString(); } catch (e) { return String(ms); }
    }

    function createArchivePanel() {
      if (document.getElementById('premod-archive-button')) return panel;
      const button = document.createElement('button');
      button.id = 'premod-archive-button';
      button.type = 'button';
      button.title = 'PreMod：查看本地保存的回复';
      button.textContent = 'PreMod';
      button.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147483600;padding:7px 11px;border:0;border-radius:999px;background:#2c7a7b;color:#fff;font:12px/1.4 system-ui,sans-serif;cursor:pointer;box-shadow:0 3px 12px #0006;opacity:.85';

      const root = document.createElement('section');
      root.id = 'premod-archive-panel';
      root.style.cssText = 'position:fixed;right:14px;bottom:52px;z-index:2147483601;width:min(420px,calc(100vw - 28px));max-height:min(70vh,560px);display:none;flex-direction:column;background:#1f2225;color:#f2f2f2;border:1px solid #4a4f55;border-radius:10px;box-shadow:0 10px 34px #000a;font:12px/1.5 system-ui,sans-serif;overflow:hidden';

      const head = document.createElement('div');
      head.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #3a3f45';
      const title = document.createElement('strong');
      title.textContent = 'PreMod 本地存档';
      title.style.cssText = 'flex:1;font-size:13px';
      const exportButton = document.createElement('button');
      exportButton.type = 'button';
      exportButton.textContent = '导出';
      exportButton.style.cssText = 'background:#3e444b;color:#fff;border:1px solid #666;border-radius:6px;padding:3px 8px;cursor:pointer';
      const clearButton = document.createElement('button');
      clearButton.type = 'button';
      clearButton.textContent = '清空';
      clearButton.style.cssText = 'background:#3e444b;color:#fff;border:1px solid #666;border-radius:6px;padding:3px 8px;cursor:pointer';
      const closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.textContent = '×';
      closeButton.style.cssText = 'background:transparent;border:0;color:#fff;font-size:20px;line-height:1;cursor:pointer;padding:0 2px';
      head.append(title, exportButton, clearButton, closeButton);

      const list = document.createElement('div');
      list.style.cssText = 'overflow-y:auto;padding:6px 8px;display:flex;flex-direction:column;gap:8px';

      const footer = document.createElement('div');
      footer.style.cssText = 'padding:6px 10px;border-top:1px solid #3a3f45;opacity:.75';
      footer.textContent = '回复在出现时自动留底；发现被删/被替换时可从这里复制。数据只存本机。';

      root.append(head, list, footer);
      (document.body || document.documentElement).append(button, root);

      const toggle = () => {
        const visible = root.style.display !== 'flex';
        root.style.display = visible ? 'flex' : 'none';
        if (visible) render();
      };
      button.addEventListener('click', toggle);
      closeButton.addEventListener('click', () => { root.style.display = 'none'; });
      exportButton.addEventListener('click', () => {
        try {
          const blob = new Blob([JSON.stringify(archive.list(), null, 2)], { type: 'application/json' });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = 'premod-archive-' + Date.now() + '.json';
          link.click();
          setTimeout(() => URL.revokeObjectURL(link.href), 5000);
        } catch (e) {}
      });
      clearButton.addEventListener('click', () => {
        if (confirm('清空 PreMod 在本站的本地存档？')) archive.clear();
      });

      function render() {
        list.textContent = '';
        const entries = archive.list();
        if (!entries.length) {
          const empty = document.createElement('div');
          empty.textContent = '还没有存档。Normal 使用即可，回复出现时会自动留底。';
          empty.style.cssText = 'opacity:.7;padding:8px 2px';
          list.append(empty);
          return;
        }
        for (const entry of entries) {
          const item = document.createElement('div');
          item.style.cssText = 'border:1px solid #3a3f45;border-radius:8px;padding:7px 8px;background:#25292d';
          const meta = document.createElement('div');
          meta.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:5px;opacity:.8';
          const time = document.createElement('span');
          time.textContent = formatTime(entry.t) + ' · ' + (entry.note || entry.kind || '');
          time.style.cssText = 'flex:1;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
          const copy = document.createElement('button');
          copy.type = 'button';
          copy.textContent = '复制';
          copy.style.cssText = 'background:#3e444b;color:#fff;border:1px solid #666;border-radius:6px;padding:2px 7px;cursor:pointer';
          copy.addEventListener('click', () => {
            const done = () => { copy.textContent = '已复制'; setTimeout(() => { copy.textContent = '复制'; }, 1500); };
            try {
              navigator.clipboard.writeText(entry.text).then(done, () => {
                const area = document.createElement('textarea');
                area.value = entry.text;
                document.body.appendChild(area);
                area.select();
                try { document.execCommand('copy'); } catch (e) {}
                area.remove();
                done();
              });
            } catch (e) {}
          });
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.textContent = '删';
          remove.style.cssText = 'background:transparent;color:#bbb;border:1px solid #555;border-radius:6px;padding:2px 6px;cursor:pointer';
          remove.addEventListener('click', () => archive.remove(entry.id));
          meta.append(time, copy, remove);
          const body = document.createElement('div');
          body.textContent = entry.text.length > 600 ? entry.text.slice(0, 600) + ' …' : entry.text;
          body.style.cssText = 'max-height:120px;overflow-y:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;opacity:.95';
          item.append(meta, body);
          list.append(item);
        }
      }

      panel = {
        refresh: () => { if (root.style.display === 'flex') render(); },
        notify: () => { button.style.background = '#dd6b20'; setTimeout(() => { button.style.background = '#2c7a7b'; }, 2500); },
        open: () => { root.style.display = 'flex'; render(); },
        root,
        render
      };
      return panel;
    }

    // ===== DeepSeek adapter =====
    function installDeepSeek() {
      if (!DsCore) { debug('DeepSeek core missing'); return; }
      const Core = DsCore;
      const STORE_PREFIX = 'premod_ds::';
      const INDEX_KEY = 'premod_ds::index';
      const MAX_SAVED = 120;
      const store = {
        key(sessionId, messageId) { return STORE_PREFIX + String(sessionId) + '::' + String(messageId); },
        save(sessionId, messageId, fragments) {
          if (!messageId || !Array.isArray(fragments) || !Core.hasAnswer(fragments)) return false;
          const session = sessionId || 'anon';
          try {
            localStorage.setItem(this.key(session, messageId), JSON.stringify({ t: Date.now(), fragments }));
          } catch (e) { return false; }
          try {
            let index = JSON.parse(localStorage.getItem(INDEX_KEY) || '[]');
            if (!Array.isArray(index)) index = [];
            index = index.filter((item) => item && !(item.s === session && String(item.m) === String(messageId)));
            index.push({ s: session, m: String(messageId), t: Date.now() });
            while (index.length > MAX_SAVED) {
              const old = index.shift();
              try { localStorage.removeItem(this.key(old.s, old.m)); } catch (e) {}
            }
            localStorage.setItem(INDEX_KEY, JSON.stringify(index));
          } catch (e) {}
          return true;
        },
        load(sessionId, messageId) {
          try {
            const raw = localStorage.getItem(this.key(sessionId || 'anon', messageId));
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
            return parsed && Array.isArray(parsed.fragments) ? parsed.fragments : null;
          } catch (e) { return null; }
        }
      };

      const isGenerateUrl = (path) => /^\\/api\\/v0\\/chat\\/(completion|edit_message|regenerate|continue|resume_stream)$/.test(path);
      const isHistoryUrl = (path) => path === '/api/v0/chat/history_messages';

      function classifyUrl(url) {
        try {
          const parsed = new URL(url, location.href);
          if (parsed.origin !== location.origin) return null;
          const path = parsed.pathname;
          if (isHistoryUrl(path)) return { kind: 'history', path };
          if (isGenerateUrl(path)) return { kind: 'generate', path };
          return null;
        } catch (e) { return null; }
      }

      function sessionIdFromBody(body) {
        if (typeof body !== 'string' || !body) return '';
        try {
          const parsed = JSON.parse(body);
          if (parsed && typeof parsed.chat_session_id === 'string') return parsed.chat_session_id;
          if (parsed && typeof parsed.chat_session_id === 'number') return String(parsed.chat_session_id);
        } catch (e) {}
        return '';
      }

      function createLineProcessor(state) {
        const tracker = new Core.Tracker({ sessionId: state.sessionId });
        let saved = false;
        return function processLine(line) {
          let carriageReturn = false;
          if (line.charAt(line.length - 1) === '\\r') { carriageReturn = true; line = line.slice(0, -1); }
          const restoreCR = (value) => (carriageReturn ? value + '\\r' : value);
          if (line.slice(0, 6) !== 'data: ') return restoreCR(line);
          const payload = line.slice(6);
          if (!payload || payload.trim() === '[DONE]') return restoreCR(line);
          if (!settings.deepseekAntiRecall) return restoreCR(line);
          let event;
          try { event = JSON.parse(payload); } catch (e) { return restoreCR(line); }
          let result;
          try { result = tracker.update(event); } catch (e) { debug('tracker error', e); return restoreCR(line); }
          if (result.save) {
            if (store.save(result.save.sessionId || state.sessionId, result.save.messageId, result.save.fragments) && !saved) {
              saved = true;
              debug('archived deepseek reply', result.save.reason);
            }
          }
          if (result.recall) {
            debug('recall intercepted');
            showBanner('DeepSeek 撤回已拦截，回复已保存', '#dd6b20', 3500);
          }
          return restoreCR(result.rewritten ? 'data: ' + JSON.stringify(result.rewritten) : line);
        };
      }

      // ---- XHR hook (DeepSeek streams the SSE body over XHR) ----
      const originalResponseText = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'responseText');
      const originalResponse = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'response');
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;

      function transformCompleteSegment(state, segment) {
        // segment ends with "\\n"; split keeps every line, the last element is "".
        const lines = segment.split('\\n');
        const result = [];
        for (let i = 0; i < lines.length - 1; i++) result.push(state.processLine(lines[i]));
        return result.join('\\n') + '\\n';
      }

      function transformedText(xhr, original) {
        if (typeof original !== 'string') return original;
        if (xhr.__premodKind === 'generate') {
          const state = xhr.__premodState;
          if (!state) return original;
          if (state.offset > original.length) { state.offset = 0; state.out = ''; }
          const pending = original.slice(state.offset);
          const lastBreak = pending.lastIndexOf('\\n');
          if (lastBreak >= 0) {
            const complete = pending.slice(0, lastBreak + 1);
            state.out += transformCompleteSegment(state, complete);
            state.offset += complete.length;
          }
          return state.out + original.slice(state.offset);
        }
        if (xhr.__premodKind === 'history' && xhr.readyState === 4) {
          if (xhr.__premodHistoryOut) return xhr.__premodHistoryOut;
          try {
            const json = JSON.parse(original);
            const report = Core.restoreHistory(json, (sessionId, messageId) => store.load(sessionId, messageId));
            if (report.modified) {
              xhr.__premodHistoryOut = JSON.stringify(json);
              debug('restored', report.restored, 'messages');
              showBanner('已恢复 ' + report.restored + ' 条被拦截的 DeepSeek 回复', '#48bb78', 3500);
              return xhr.__premodHistoryOut;
            }
          } catch (e) { debug('history rewrite failed', e); }
        }
        return original;
      }

      Object.defineProperty(XMLHttpRequest.prototype, 'responseText', {
        configurable: true,
        get() {
          const original = originalResponseText.get.call(this);
          if (!this.__premodKind) return original;
          try { return transformedText(this, original); } catch (e) { return original; }
        },
        set(value) { return originalResponseText.set.call(this, value); }
      });

      Object.defineProperty(XMLHttpRequest.prototype, 'response', {
        configurable: true,
        get() {
          const original = originalResponse.get.call(this);
          if (!this.__premodKind) return original;
          try {
            if (typeof original === 'string') return transformedText(this, original);
            if (this.responseType === 'json' && original && this.__premodKind === 'history') {
              if (this.__premodHistoryObject) return this.__premodHistoryObject;
              const report = Core.restoreHistory(original, (sessionId, messageId) => store.load(sessionId, messageId));
              if (report.modified) {
                this.__premodHistoryObject = original;
                showBanner('已恢复 ' + report.restored + ' 条被拦截的 DeepSeek 回复', '#48bb78', 3500);
                return this.__premodHistoryObject;
              }
            }
            return original;
          } catch (e) { return original; }
        },
        set(value) { return originalResponse.set.call(this, value); }
      });

      XMLHttpRequest.prototype.open = function (method, url) {
        try {
          const info = classifyUrl(url);
          if (info) {
            this.__premodKind = info.kind;
            this.__premodPath = info.path;
          } else {
            this.__premodKind = null;
          }
        } catch (e) { this.__premodKind = null; }
        return originalOpen.apply(this, arguments);
      };

      XMLHttpRequest.prototype.send = function (body) {
        if (this.__premodKind === 'generate') {
          const sessionId = sessionIdFromBody(body);
          const state = { sessionId, offset: 0, out: '' };
          state.processLine = createLineProcessor(state);
          this.__premodState = state;
        }
        return originalSend.apply(this, arguments);
      };

      // ---- fetch fallback: if DeepSeek ever moves generation to fetch() ----
      const originalFetch = window.fetch;
      window.fetch = async function (...args) {
        const requestUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url;
        const info = requestUrl ? classifyUrl(requestUrl) : null;
        if (!info) return originalFetch.apply(this, args);
        try {
          const response = await originalFetch.apply(this, args);
          if (info.kind === 'generate') {
            const contentType = (response.headers.get('content-type') || '').toLowerCase();
            if (contentType.includes('text/event-stream') && response.body) {
              const state = { sessionId: sessionIdFromBody(args[1] && args[1].body), offset: 0, out: '' };
              const processLine = createLineProcessor(state);
              const reader = response.body.getReader();
              const decoder = new TextDecoder();
              const encoder = new TextEncoder();
              let buffer = '';
              const stream = new ReadableStream({
                async start(controller) {
                  try {
                    while (true) {
                      const { done, value } = await reader.read();
                      if (done) break;
                      buffer += decoder.decode(value, { stream: true });
                      const lines = buffer.split('\\n');
                      buffer = lines.pop();
                      for (const line of lines) controller.enqueue(encoder.encode(processLine(line) + '\\n'));
                    }
                    buffer += decoder.decode();
                    if (buffer) controller.enqueue(encoder.encode(processLine(buffer)));
                    controller.close();
                  } catch (error) {
                    controller.error(error);
                  }
                },
                cancel(reason) { return reader.cancel(reason); }
              });
              return new Response(stream, { headers: response.headers, status: response.status, statusText: response.statusText });
            }
          }
          return response;
        } catch (e) {
          throw e;
        }
      };

      settingsLoaded.then(() => {
        if (settings.deepseekAntiRecall) debug('DeepSeek anti-recall armed', VERSION);
      });
    }

    // ===== Claude adapter =====
    function installClaude() {
      if (!ClaudeCore) { debug('Claude core missing'); return; }
      const Core = ClaudeCore;
      createArchivePanel();
      const SAVED_PREFIX = 'premod_claude_replies::';
      const conversations = new Map(); // conversationId -> [{t, text, messageId}]

      function saveReply(conversationId, text, meta) {
        text = String(text || '').trim();
        if (!text || text.length < 12) return null;
        const entry = archive.add({ text, kind: 'claude', note: 'Claude 回复' });
        try {
          const raw = localStorage.getItem(SAVED_PREFIX + conversationId);
          const list = raw ? JSON.parse(raw) : [];
          const items = Array.isArray(list) ? list : [];
          items.unshift({ t: Date.now(), text, messageId: (meta && meta.messageId) || '', stopReason: (meta && meta.stopReason) || '' });
          localStorage.setItem(SAVED_PREFIX + conversationId, JSON.stringify(items.slice(0, 30)));
        } catch (e) {}
        return entry;
      }

      function savedReplies(conversationId) {
        try {
          const parsed = JSON.parse(localStorage.getItem(SAVED_PREFIX + conversationId) || '[]');
          return Array.isArray(parsed) ? parsed : [];
        } catch (e) { return []; }
      }

      const COMPLETION_PATTERN = /\\/api\\/organizations\\/[^/]+\\/chat_conversations\\/([a-f0-9-]+)\\/completion(\\?|$)/;
      const CONVERSATION_PATTERN = /\\/api\\/organizations\\/[^/]+\\/chat_conversations\\/([a-f0-9-]+)(\\?|$)/;
      const BOOTSTRAP_PATTERN = /\\/api\\/bootstrap(\\?|$)/;

      function conversationIdFromUrl(url) {
        try {
          const parsed = new URL(url, location.href);
          const path = parsed.pathname;
          let match = path.match(COMPLETION_PATTERN);
          if (match) return { id: match[1], kind: 'completion', path };
          match = path.match(CONVERSATION_PATTERN);
          if (match) return { id: match[1], kind: 'conversation', path };
          if (BOOTSTRAP_PATTERN.test(path)) return { id: null, kind: 'bootstrap', path };
          return null;
        } catch (e) { return null; }
      }

      // ---- auto-continue for paused / ended-early responses ----
      const CONTINUE_PATTERNS = [
        { reason: 'ended_early', test: /This response ended early\\./i, cooldown: 15000 },
        { reason: 'usage_limit', test: /Paused when your free usage ran out\\./i, cooldown: 600000 },
        { reason: 'usage_limit', test: /\\bPaused:\\s*Your free usage returns\\b/i, cooldown: 600000 }
      ];
      let lastContinueAttempt = 0;

      function visibleText(node) {
        if (!node) return '';
        const text = typeof node.innerText === 'string' && node.innerText.trim() ? node.innerText : (node.textContent || '');
        return text.replace(/\\s+/g, ' ').trim();
      }

      function isEnabledButton(button) {
        if (!button || !button.isConnected) return false;
        if (button.disabled || button.getAttribute('aria-disabled') === 'true') return false;
        if (button.closest('[inert]')) return false;
        const style = getComputedStyle(button);
        return style.display !== 'none' && style.visibility !== 'hidden' && button.getClientRects().length > 0;
      }

      function tryAutoContinue() {
        if (!settings.claudeAutoContinue) return;
        if (document.visibilityState === 'hidden') return;
        const now = Date.now();
        for (const rule of CONTINUE_PATTERNS) {
          const banners = document.querySelectorAll('[data-testid="message-warning"]');
          for (const banner of banners) {
            const text = visibleText(banner);
            if (!rule.test.test(text)) continue;
            if (now - lastContinueAttempt < rule.cooldown) return;
            const button = Array.from(banner.querySelectorAll('button')).find((candidate) => /^(continue|resume)$/i.test(visibleText(candidate)));
            if (!isEnabledButton(button)) continue;
            lastContinueAttempt = now;
            try {
              button.click();
              debug('auto-continue clicked', rule.reason);
              showBanner('Claude 回复中断，已自动点击 Continue', '#48bb78', 3000);
            } catch (e) {}
            return;
          }
        }
      }

      let mutationTimer = null;
      const observer = new MutationObserver(() => {
        if (mutationTimer) return;
        mutationTimer = setTimeout(() => { mutationTimer = null; tryAutoContinue(); }, 700);
      });
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: false, attributes: false });
      setInterval(tryAutoContinue, 4000);

      // ---- fetch hook: capture completion streams, compare conversation JSON ----
      const originalFetch = window.fetch;
      window.fetch = async function (...args) {
        const requestUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url;
        const info = requestUrl ? conversationIdFromUrl(requestUrl) : null;
        if (!info) return originalFetch.apply(this, args);

        const response = await originalFetch.apply(this, args);

        if (info.kind === 'completion' && response.body) {
          const capture = new Core.Capture();
          const conversationId = info.id;
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          const stream = new ReadableStream({
            async start(controller) {
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  controller.enqueue(value);
                  buffer += decoder.decode(value, { stream: true });
                  let newline;
                  while ((newline = buffer.indexOf('\\n')) !== -1) {
                    const line = buffer.slice(0, newline);
                    buffer = buffer.slice(newline + 1);
                    capture.feedLine(line);
                  }
                }
                if (buffer) capture.feedLine(buffer);
                const text = capture.text();
                if (text.trim()) {
                  saveReply(conversationId, text, { messageId: capture.messageId, stopReason: capture.stopReason });
                  if (!capture.done && text.trim().length > 20) {
                    showBanner('Claude 回复被中断，已存档（可从 PreMod 找回）', '#dd6b20', 3500);
                  }
                }
                controller.close();
              } catch (error) {
                try { const text = capture.text(); if (text.trim()) saveReply(conversationId, text, { messageId: capture.messageId, stopReason: capture.stopReason }); } catch (e) {}
                controller.error(error);
              }
            },
            cancel(reason) { return reader.cancel(reason); }
          });
          return new Response(stream, { headers: response.headers, status: response.status, statusText: response.statusText });
        }

        if (info.kind === 'conversation') {
          try {
            const clone = response.clone();
            clone.json().then((json) => {
              const conversationId = info.id;
              const present = Core.assistantTexts(json);
              const saved = savedReplies(conversationId);
              if (!saved.length) return;
              const missing = saved.filter((item) => !present.some((message) => Core.containsText(message.text, item.text)));
              if (missing.length) {
                debug('missing replies', missing.length);
                if (panel) panel.notify();
                showBanner('检测到 ' + missing.length + ' 条 Claude 回复不在会话里，可从 PreMod 面板找回', '#dd6b20', 5000);
              }
            }).catch(() => {});
          } catch (e) {}
        }
        return response;
      };

      // ---- DOM fallback: keep the last rendered assistant bubble even if the
      // network hook misses it (e.g. transport changes). ---- 
      let lastDomText = '';
      let stableSince = 0;
      const domTimer = setInterval(() => {
        if (!settings.archive) return;
        try {
          const nodes = document.querySelectorAll('.font-claude-message, [data-testid="message"] .prose, [class*="font-claude-message"]');
          if (!nodes.length) return;
          const text = String(nodes[nodes.length - 1].innerText || '').trim();
          if (text.length < 20) return;
          if (text !== lastDomText) {
            lastDomText = text;
            stableSince = Date.now();
            return;
          }
          if (!stableSince || Date.now() - stableSince < 2500) return;
          stableSince = 0;
          const known = archive.list().some((entry) => Core.containsText(entry.text, text));
          if (!known) archive.add({ text, kind: 'claude', note: 'Claude 页面回复(备用)' });
        } catch (e) {}
      }, 1500);
      window.addEventListener('beforeunload', () => { clearInterval(domTimer); });
    }

    // ===== Shared DOM fallback for domestic sites =====
    // Virtual lists recycle message rows, so snapshot rendered text into memory often.
    function installDomesticDomFallback(selectors) {
      const seen = new Map();
      const list = Array.isArray(selectors) && selectors.length ? selectors : ['[class*="markdown"]', '[class*="message"]', 'article'];
      const query = list.join(',');
      setInterval(() => {
        if (!settings.archive) return;
        let nodes;
        try { nodes = document.querySelectorAll(query); } catch (e) { return; }
        const now = Date.now();
        for (const node of nodes) {
          let text = '';
          try { text = String(node.innerText || node.textContent || '').trim(); } catch (e) { continue; }
          if (text.length < 30 || text.length > 20000) continue;
          if (/^(登录|注册|首页|设置|下载|了解|产品|关于|隐私|用户协议)/.test(text)) continue;
          let record = seen.get(node);
          if (!record) { seen.set(node, { text, stableAt: now }); continue; }
          if (record.text !== text) { record.text = text; record.stableAt = now; continue; }
          if (now - record.stableAt < 2000) continue;
          record.stableAt = now; // archive at most once per stable version
          const known = archive.list().some((entry) => entry.text.indexOf(text.slice(0, 60)) === 0 || text.indexOf(entry.text.slice(0, 60)) === 0);
          if (!known) archive.add({ text, kind: 'dom', note: location.hostname + ' 页面留痕' });
        }
        if (seen.size > 200) {
          for (const [node] of seen) { try { if (!document.contains(node)) seen.delete(node); } catch (e) {} }
        }
      }, 1200);
    }

    // ===== 千问 / 通义：SSE 整段快照，最容易做「被覆盖即找回」 =====
    function installQianwen() {
      const CHAT_URL = /^https?:\\/\\/chat2(?:-api)?\\.qianwen\\.com\\/api\\/v2\\/chat/i;
      const originalFetch = window.fetch;
      window.fetch = async function (...args) {
        const requestUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url;
        const response = await originalFetch.apply(this, args);
        if (!requestUrl || !CHAT_URL.test(String(requestUrl)) || !response.body) return response;
        try {
          const reader = response.clone().body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let latest = '';
          let errorCode = null;
          (async () => {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed || trimmed.startsWith(':')) continue;
                  if (trimmed.startsWith('event:')) continue;
                  if (!trimmed.startsWith('data:')) continue;
                  let event;
                  try { event = JSON.parse(trimmed.slice(5).trim()); } catch (e) { continue; }
                  if (event && (event.error_code || event.error_msg)) { errorCode = event.error_code || event.error_msg; continue; }
                  const messages = event && event.data && event.data.messages;
                  if (!Array.isArray(messages)) continue;
                  const text = messages
                    .filter((message) => message && /^(text\\/plain|text|multi_load\\/iframe)$/.test(message.mime_type))
                    .map((message) => message.content || '')
                    .join('');
                  if (!text) continue;
                  if (latest && !text.startsWith(latest)) {
                    archive.add({ text: latest, kind: 'qwen', note: '千问：被新快照覆盖的旧回复' });
                    showBanner('千问回复快照被覆盖，旧版已存档', '#dd6b20', 3000);
                  }
                  latest = text;
                }
              }
              if (latest.trim().length >= 12) archive.add({ text: latest, kind: 'qwen', note: location.hostname + ' 回复' });
              if (errorCode) {
                debug('qianwen error_code', errorCode);
                showBanner('千问返回错误码 ' + errorCode + '，已留下回复', '#dd6b20', 3000);
              }
            } catch (e) { debug('qianwen stream parse', e); }
          })();
        } catch (e) {}
        return response;
      };
      installDomesticDomFallback(['div[data-chat-list-key]', '.chat-content', '#chat-container', '[class*="markdown"]']);
    }

    // ===== 豆包：SSE event blocks；识别 STREAM_ERROR 与风控码 =====
    function installDoubao() {
      const CHAT_URL = /\\/samantha\\/chat\\/completion|\\/alice\\/message\\/stream_call_bot|stream_call_bot/i;
      const RISK_CODES = new Set([710022002, 710022004]);
      const originalFetch = window.fetch;
      window.fetch = async function (...args) {
        const requestUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url;
        const response = await originalFetch.apply(this, args);
        if (!requestUrl || !CHAT_URL.test(String(requestUrl)) || !response.body) return response;
        try {
          const reader = response.clone().body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          const conversations = new Map(); // msgId -> text
          (async () => {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const blocks = buffer.split(/\\r?\\n\\r?\\n/);
                buffer = blocks.pop() || '';
                for (const block of blocks) {
                  let eventName = '';
                  let data = null;
                  for (const line of block.split(/\\r?\\n/)) {
                    if (line.startsWith('event:')) eventName = line.slice(6).trim();
                    else if (line.startsWith('data:')) { try { data = JSON.parse(line.slice(5).trim()); } catch (e) {} }
                  }
                  if (!data) continue;
                  if (eventName === 'STREAM_ERROR' || data.error_code || data.code) {
                    const code = Number((data.error && data.error.code) || data.error_code || data.code || 0);
                    debug('doubao stream error', eventName, code, data.message || (data.error && data.error.message) || '');
                    if (RISK_CODES.has(code)) showBanner('豆包风控/限流（错误码 ' + code + '），已留下回复', '#dd6b20', 3500);
                    else showBanner('豆包流式错误 ' + (code || eventName), '#dd6b20', 2500);
                    continue;
                  }
                  const eventData = data.event_data || data;
                  const message = eventData.message || eventData;
                  const contentType = message && message.content_type;
                  if (!message || ![2001, 2003, 10000, 2008].includes(contentType)) continue;
                  let content = message.content;
                  try { if (typeof content === 'string') content = JSON.parse(content); } catch (e) {}
                  const text = (content && (content.text || content.think)) || '';
                  if (!text) continue;
                  const id = message.message_id || eventData.reply_id || 'doubao';
                  const previous = conversations.get(id) || '';
                  let next;
                  if (!previous) next = text;
                  else if (text.startsWith(previous)) next = text;
                  else if (previous.endsWith(text)) next = previous;
                  else next = previous + text;
                  if (previous && !text.startsWith(previous) && !previous.endsWith(text)) {
                    archive.add({ text: previous, kind: 'doubao', note: '豆包：疑似被替换的回复' });
                  }
                  conversations.set(id, next);
                }
              }
              for (const text of conversations.values()) {
                if (text.trim().length >= 12) archive.add({ text, kind: 'doubao', note: location.hostname + ' 回复' });
              }
            } catch (e) { debug('doubao stream parse', e); }
          })();
        } catch (e) {}
        return response;
      };
      installDomesticDomFallback(['[data-observe-row]', '[class*="markdown"]', '[class*="message"]']);
    }

    // ===== Kimi：Connect-RPC 二进制帧流 =====
    function installKimi() {
      const CHAT_URL = /\\/apiv2\\/kimi\\.(?:gateway\\.)?chat\\.v1\\.ChatService\\/(?:Chat|ListMessages|GetChat)|\\/api\\/chat\\/[^/]*completion\\/stream/i;
      const originalFetch = window.fetch;

      function handleFrame(message, state) {
        if (!message || typeof message !== 'object') return;
        const mask = String(message.mask || '');
        const textBlock = message.block && message.block.text;
        if (textBlock && typeof textBlock.content === 'string' && (mask === '' || mask.indexOf('text') !== -1)) {
          const content = textBlock.content;
          const operation = message.op || 'append';
          if (operation === 'append') state.text += content;
          else if (state.text && !content.startsWith(state.text)) {
            archive.add({ text: state.text, kind: 'kimi', note: 'Kimi：疑似被覆盖的回复' });
            showBanner('Kimi 回复疑似被覆盖，旧版已存档', '#dd6b20', 3000);
            state.text = content;
          } else {
            state.text = content;
          }
        }
        if (message.message && message.message.status === 'MESSAGE_STATUS_COMPLETED') state.done = true;
      }

      window.fetch = async function (...args) {
        const requestUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url;
        const response = await originalFetch.apply(this, args);
        if (!requestUrl || !CHAT_URL.test(String(requestUrl)) || !response.body) return response;
        try {
          const reader = response.clone().body.getReader();
          const decoder = new TextDecoder();
          const state = { text: '', done: false };
          (async () => {
            try {
              let buffer = new Uint8Array(0);
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const merged = new Uint8Array(buffer.length + value.length);
                merged.set(buffer);
                merged.set(value, buffer.length);
                buffer = merged;
                let offset = 0;
                while (buffer.length - offset >= 5) {
                  const length = ((buffer[offset + 1] << 24) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 8) | buffer[offset + 4]) >>> 0;
                  if (length > 50 * 1024 * 1024) { offset = buffer.length; break; }
                  if (buffer.length - offset < 5 + length) break;
                  try {
                    const json = decoder.decode(buffer.subarray(offset + 5, offset + 5 + length));
                    handleFrame(JSON.parse(json), state);
                  } catch (e) {}
                  offset += 5 + length;
                }
                buffer = buffer.slice(offset);
              }
              if (state.text.trim().length >= 12) archive.add({ text: state.text.trim(), kind: 'kimi', note: location.hostname + ' 回复' });
            } catch (e) { debug('kimi stream parse', e); }
          })();
        } catch (e) {}
        return response;
      };
      installDomesticDomFallback(['[class*="chat-content-item-assistant"]', '[class*="segment-content"]', '[class*="markdown"]']);
    }

    // ===== Generic adapter (其他站点): best-effort local archive =====
    function installGenericArchive() {
      createArchivePanel();
      if (/(^|\\.)(qianwen|tongyi)\\.com$/.test(HOST)) return installQianwen();
      if (/(^|\\.)doubao\\.com$/.test(HOST)) return installDoubao();
      if (/(^|\\.)(kimi|moonshot)\\.(com|cn)$/.test(HOST)) return installKimi();
      const CHAT_URL = /(chat|completion|conversation|message|answer|reply|generate|stream|sse|dialog|assistant)/i;
      const SKIP_URL = /(\\.js|\\.css|\\.png|\\.jpg|\\.jpeg|\\.gif|\\.svg|\\.woff|\\.ico|\\.map|\\.webp)(\\?|$)/i;
      const TEXT_KEYS = /^(content|text|delta|answer|reply|completion|response|result|output|message)$/i;
      const SKIP_KEYS = /^(id|uuid|url|href|role|type|status|model|name|title|token|created|updated|code|error|icon|avatar|reason)$/i;

      function sameSite(url) {
        try {
          const parsed = new URL(url, location.href);
          if (parsed.origin === location.origin) return true;
          return new RegExp('(^|\\\\.)' + location.hostname.split('.').slice(-2).join('\\\\.') + '$').test(parsed.hostname);
        } catch (e) { return false; }
      }

      function worthCapturing(url, contentType, method) {
        if (!url || SKIP_URL.test(url)) return false;
        if (!sameSite(url)) return false;
        const isSSE = /event-stream/i.test(contentType || '');
        const isJson = /application\\/json/i.test(contentType || '');
        const isChatty = CHAT_URL.test(url);
        if (isSSE && isChatty) return true;
        if (isJson && isChatty && /^post$/i.test(String(method || 'GET'))) return true;
        if (isSSE) return true;
        return false;
      }

      // Generic JSON text harvester: collects plausible answer strings.
      function harvestText(value, state, depth) {
        if (!value || depth > 8) return;
        if (typeof value === 'string') {
          if (value.length >= 2 && value.length < 20000 && !/^[A-Za-z0-9+/=]{80,}$/.test(value) && !/^https?:\\/\\//.test(value)) {
            state.parts.push(value);
          }
          return;
        }
        if (Array.isArray(value)) {
          for (const item of value) harvestText(item, state, depth + 1);
          return;
        }
        if (typeof value !== 'object') return;
        for (const key of Object.keys(value)) {
          if (SKIP_KEYS.test(key)) continue;
          const child = value[key];
          if (typeof child === 'string') {
            if (TEXT_KEYS.test(key) && child.length <= 20000 && !/^https?:\\/\\//.test(child)) state.parts.push(child);
          } else if (child && typeof child === 'object') {
            harvestText(child, state, depth + 1);
          }
        }
      }

      function makeRecorder(url) {
        const state = { parts: [], startedAt: Date.now(), url: String(url).slice(0, 200), lastAt: Date.now(), buffer: '' };
        const consumeLine = (line) => {
          const trimmed = String(line || '').trim();
          if (!trimmed || trimmed.startsWith(':')) return;
          const payload = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
          if (!payload || payload === '[DONE]') return;
          if (payload.startsWith('{') || payload.startsWith('[')) {
            try { harvestText(JSON.parse(payload), state, 0); } catch (e) {}
          }
        };
        return {
          feed(raw) {
            if (typeof raw !== 'string' || !raw) return;
            state.lastAt = Date.now();
            state.buffer += raw;
            let newline;
            while ((newline = state.buffer.indexOf('\\n')) !== -1) {
              const line = state.buffer.slice(0, newline);
              state.buffer = state.buffer.slice(newline + 1);
              consumeLine(line);
            }
            // Guard against protocols that never send newlines.
            if (state.buffer.length > 400000) { consumeLine(state.buffer); state.buffer = ''; }
          },
          finish() {
            if (state.buffer) { consumeLine(state.buffer); state.buffer = ''; }
            const parts = state.parts.filter((part) => typeof part === 'string' && part.trim());
            let text = parts.join('');
            if (parts.length > 1) {
              // Cumulative snapshot protocols repeat the whole text each time.
              let cumulative = true;
              for (let i = 1; i < parts.length; i++) {
                if (parts[i].indexOf(parts[i - 1]) !== 0) { cumulative = false; break; }
              }
              if (cumulative) text = parts[parts.length - 1];
              else {
                const longest = parts.reduce((a, b) => (b.length > a.length ? b : a), '');
                if (longest.length > text.length * 0.8) text = longest;
              }
            }
            text = text.trim();
            if (text.length < 15) return;
            archive.add({ text, kind: 'archive', note: location.hostname + ' 回复' });
            debug('archived', text.length, 'chars from', state.url);
          }
        };
      }

      const originalFetch = window.fetch;
      window.fetch = async function (...args) {
        const requestUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url;
        const method = (args[1] && args[1].method) || (args[0] && args[0].method) || 'GET';
        const response = await originalFetch.apply(this, args);
        try {
          const contentType = response.headers.get('content-type') || '';
          if (!response.body || !worthCapturing(requestUrl, contentType, method)) return response;
          const recorder = makeRecorder(requestUrl);
          const reader = response.clone().body.getReader();
          const decoder = new TextDecoder();
          (async () => {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                recorder.feed(decoder.decode(value, { stream: true }));
              }
              recorder.finish();
            } catch (e) {}
          })();
        } catch (e) {}
        return response;
      };

      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (method, url) {
        try { this.__premodUrl = String(url || ''); this.__premodMethod = method; } catch (e) {}
        return originalOpen.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function () {
        try {
          const url = this.__premodUrl;
          if (url && sameSite(url) && /(chat|completion|conversation|message|answer|generate|stream|sse)/i.test(url)) {
            const recorder = makeRecorder(url);
            let seen = 0;
            this.addEventListener('progress', () => {
              try {
                const text = this.responseText || '';
                if (text.length > seen) { recorder.feed(text.slice(seen)); seen = text.length; }
              } catch (e) {}
            });
            this.addEventListener('loadend', () => recorder.finish());
          }
        } catch (e) {}
        return originalSend.apply(this, arguments);
      };

      // DOM fallback: some domestic apps stream over transports we cannot hook
      // (or replace text on the fly). Keep the last stable reply-shaped block.
      const domSeen = new Map(); // element -> {text, stableAt, archived}
      const DOM_CANDIDATES = [
        '[class*="markdown"]', '[class*="message"]', '[class*="answer"]',
        '[class*="reply"]', '[class*="content"]', '[data-testid]', 'article', '.prose'
      ].join(',');
      setInterval(() => {
        if (!settings.archive) return;
        let nodes;
        try { nodes = document.querySelectorAll(DOM_CANDIDATES); } catch (e) { return; }
        const now = Date.now();
        for (const node of nodes) {
          let text = '';
          try { text = String(node.innerText || node.textContent || '').trim(); } catch (e) { continue; }
          if (text.length < 40 || text.length > 20000) continue;
          // Skip whole-page wrappers: reply blocks are normally compact.
          try { if (node.querySelectorAll && node.querySelectorAll('*').length > 60) continue; } catch (e) {}
          // Ignore obvious chrome / navigation blocks.
          if (text.split('\\n').length < 1) continue;
          if (/^(登录|注册|首页|设置|下载|了解|产品|关于|隐私|用户协议)/.test(text)) continue;
          let record = domSeen.get(node);
          if (!record) { domSeen.set(node, { text, stableAt: now, archived: false }); continue; }
          if (record.text !== text) { record.text = text; record.stableAt = now; record.archived = false; continue; }
          if (record.archived || now - record.stableAt < 2500) continue;
          record.archived = true;
          const known = archive.list().some((entry) => entry.text.indexOf(text.slice(0, 60)) === 0 || text.indexOf(entry.text.slice(0, 60)) === 0);
          if (!known) archive.add({ text, kind: 'dom', note: location.hostname + ' 页面回复(备用)' });
        }
        if (domSeen.size > 120) {
          // Drop detached nodes to keep the scan cheap.
          for (const [node, record] of domSeen) {
            if (!document.contains(node)) domSeen.delete(node);
          }
        }
      }, 1500);

      // WebSocket fallback (some domestic chat apps stream over WS).
      const OriginalWebSocket = window.WebSocket;
      if (OriginalWebSocket) {
        window.WebSocket = new Proxy(OriginalWebSocket, {
          construct(target, argList) {
            const socket = new target(...argList);
            try {
              const recorder = makeRecorder('wss://' + location.hostname + '/');
              const rawAdd = socket.addEventListener.bind(socket);
              rawAdd('message', (event) => {
                try {
                  if (typeof event.data === 'string') recorder.feed(event.data);
                } catch (e) {}
              });
              rawAdd('close', () => { try { recorder.finish(); } catch (e) {} });
            } catch (e) {}
            return socket;
          }
        });
      }
    }

    // ===== Boot =====
    function boot() {
      if (SITE === 'deepseek') installDeepSeek();
      else if (SITE === 'claude') installClaude();
      else installGenericArchive();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
      boot();
    }
  })();
`;
  const inpageCode = site === 'chatgpt' ? chatgptInpage : multisiteInpage;

  const isInjected = () => document.documentElement.dataset.premodInjected === '1';

  const findNonce = () => {
    for (const script of document.getElementsByTagName('script')) {
      const nonce = script.nonce || script.getAttribute('nonce');
      if (nonce) return nonce;
    }
    return '';
  };

  const injectWithNonce = (nonce) => {
    const script = document.createElement('script');
    script.nonce = nonce;
    script.textContent = inpageCode;
    document.documentElement.appendChild(script);
    script.remove();
    return isInjected();
  };

  const waitForNonce = () => {
    if (document.readyState !== 'loading' || isInjected()) return;
    const observer = new MutationObserver(() => {
      if (isInjected()) return observer.disconnect();
      const nonce = findNonce();
      if (!nonce) return;
      observer.disconnect();
      injectWithNonce(nonce);
    });
    observer.observe(document, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', () => observer.disconnect(), { once: true });
  };

  const injectWithBlob = () => {
    const script = document.createElement('script');
    script.src = URL.createObjectURL(new Blob([inpageCode], { type: 'text/javascript' }));
    const cleanup = () => {
      URL.revokeObjectURL(script.src);
      script.remove();
    };
    script.onload = cleanup;
    script.onerror = cleanup;
    document.documentElement.appendChild(script);
  };

  const injectWithAddElement = async () => {
    try {
      if (typeof GM_addElement === 'function') GM_addElement('script', { textContent: inpageCode });
      else if (typeof GM.addElement === 'function') await GM.addElement('script', { textContent: inpageCode });
    } catch {}
    return isInjected();
  };

  (async () => {
    if (await injectWithAddElement()) return;
    const nonce = findNonce();
    if (nonce && injectWithNonce(nonce)) return;
    injectWithBlob();
    waitForNonce();
  })();
})();
