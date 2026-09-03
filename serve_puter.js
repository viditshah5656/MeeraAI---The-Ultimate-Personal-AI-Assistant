const http = require('http');
const path = require('path');

const PORT = Number(process.env.PORT) || 3001;

const HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Puter AI Chat</title>
  <style>
    :root {
      --bg1: #0b1020;
      --bg2: #151d34;
      --panel: rgba(20, 24, 38, 0.9);
      --panel-2: #1c243d;
      --text: #ebf2ff;
      --muted: #a9b7d3;
      --accent: #7c8cff;
      --accent-2: #8ae3ff;
      --border: rgba(255,255,255,0.1);
      --user: #2c427e;
      --assistant: #182235;
      --success: #5ee6a8;
      --danger: #ff7b7b;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: Segoe UI, Tahoma, sans-serif;
      background: linear-gradient(135deg, var(--bg1), var(--bg2));
      color: var(--text);
      display: grid;
      place-items: center;
    }

    .app {
      width: min(900px, calc(100vw - 32px));
      height: min(760px, calc(100vh - 32px));
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 20px;
      box-shadow: 0 30px 70px rgba(0,0,0,0.45);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 18px 22px;
      background: rgba(255,255,255,0.02);
      border-bottom: 1px solid var(--border);
    }

    .brand {
      font-weight: 700;
      font-size: 1.2rem;
      letter-spacing: 0.02em;
    }

    .badge {
      font-size: 0.74rem;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid rgba(142, 227, 255, 0.35);
      color: var(--accent-2);
      background: rgba(138,227,255,0.08);
    }

    .chat {
      flex: 1;
      overflow-y: auto;
      padding: 20px 18px 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: rgba(255,255,255,0.015);
    }

    .message {
      display: flex;
      max-width: 82%;
      line-height: 1.55;
      font-size: 0.96rem;
      word-break: break-word;
      white-space: pre-wrap;
    }

    .message.user {
      align-self: flex-end;
      justify-content: flex-end;
    }

    .message.assistant {
      align-self: flex-start;
      justify-content: flex-start;
    }

    .bubble {
      padding: 12px 14px;
      border-radius: 16px;
      border: 1px solid var(--border);
    }

    .message.user .bubble {
      background: linear-gradient(135deg, var(--user), #233f79);
      border-bottom-right-radius: 6px;
    }

    .message.assistant .bubble {
      background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.03));
      border-bottom-left-radius: 6px;
    }

    .typing {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      min-height: 18px;
    }

    .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--accent-2);
      animation: blink 1.1s infinite ease-in-out;
    }

    .dot:nth-child(2) { animation-delay: 0.15s; }
    .dot:nth-child(3) { animation-delay: 0.3s; }

    @keyframes blink {
      0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
      40% { opacity: 1; transform: translateY(-2px); }
    }

    .composer {
      display: grid;
      grid-template-columns: 130px 130px 1fr 110px;
      gap: 10px;
      padding: 16px 18px 18px;
      border-top: 1px solid var(--border);
      background: rgba(255,255,255,0.02);
    }

    select, textarea, button {
      font: inherit;
      border-radius: 12px;
      border: 1px solid var(--border);
    }

    select, textarea {
      background: rgba(255,255,255,0.04);
      color: var(--text);
    }

    select {
      padding: 12px 12px;
      outline: none;
    }

    textarea {
      resize: none;
      min-height: 52px;
      max-height: 160px;
      padding: 12px 14px;
      line-height: 1.4;
      outline: none;
    }

    button {
      background: linear-gradient(135deg, var(--accent), #5d70ff);
      color: white;
      font-weight: 600;
      border: none;
      cursor: pointer;
      transition: transform 0.15s ease, filter 0.15s ease;
    }

    button:hover:not(:disabled) {
      transform: translateY(-1px);
      filter: brightness(1.05);
    }

    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .error {
      color: var(--danger);
      margin-top: 2px;
      font-size: 0.9rem;
    }

    @media (max-width: 640px) {
      .composer {
        grid-template-columns: 1fr;
      }

      .app {
        width: calc(100vw - 18px);
        height: calc(100vh - 18px);
      }
    }
  </style>
</head>
<body>
  <div class="app">
    <div class="topbar">
      <div class="brand">Puter AI Chat</div>
      <div class="badge">Live streaming</div>
    </div>

    <div class="chat" id="chat"></div>

    <div class="composer">
      <select id="modelSelect">
        <optgroup label="Puter Codex (Recommended)">
          <option value="gpt-5.3-codex">GPT-5.3 Codex</option>
          <option value="gpt-5-codex">GPT-5 Codex</option>
          <option value="gpt-5.4-nano">GPT-5.4 Nano</option>
          <option value="gpt-5.4-mini">GPT-5.4 Mini</option>
        </optgroup>
        <optgroup label="OpenAI / Google">
          <option value="gpt-4o">GPT-4o</option>
          <option value="gpt-4o-mini">GPT-4o Mini</option>
          <option value="gemini-3.1-flash">Gemini 3.1 Flash</option>
          <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite</option>
        </optgroup>
      </select>

      <select id="reasoningSelect" style="display: none;">
        <option value="">No Reasoning</option>
        <option value="low">Low</option>
        <option value="medium" selected>Medium</option>
        <option value="high">High</option>
        <option value="ultra">Ultra</option>
      </select>

      <textarea id="prompt" rows="1" placeholder="Type your message..."></textarea>
      <button id="sendBtn">Send</button>
    </div>
  </div>

  <script src="https://js.puter.com/v2/"></script>
  <script>
    const chatEl = document.getElementById('chat');
    const promptEl = document.getElementById('prompt');
    const modelSelectEl = document.getElementById('modelSelect');
    const reasoningSelectEl = document.getElementById('reasoningSelect');
    const sendBtn = document.getElementById('sendBtn');

    // Models that support reasoning in Puter.
    // Keep this list aligned with actual Puter model IDs exposed by the SDK.
    const reasoningModels = ['gpt-5.3-codex', 'gpt-5-codex', 'gpt-5.4-nano', 'gpt-5.4-mini', 'gemini-3.1-flash', 'gemini-3.1-flash-lite'];

    function toggleReasoningUI() {
      const model = modelSelectEl.value;
      if (reasoningModels.includes(model)) {
        reasoningSelectEl.style.display = 'block';
      } else {
        reasoningSelectEl.style.display = 'none';
        reasoningSelectEl.value = '';
      }
    }

    modelSelectEl.addEventListener('change', toggleReasoningUI);

    function addMessage(role, text) {
      const row = document.createElement('div');
      row.className = 'message ' + role;

      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.textContent = text;
      row.appendChild(bubble);

      chatEl.appendChild(row);
      chatEl.scrollTop = chatEl.scrollHeight;
      return bubble;
    }

    function addTyping() {
      const row = document.createElement('div');
      row.className = 'message assistant';
      row.id = 'typing-row';

      const bubble = document.createElement('div');
      bubble.className = 'bubble typing';
      bubble.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
      row.appendChild(bubble);
      chatEl.appendChild(row);
      chatEl.scrollTop = chatEl.scrollHeight;
      return row;
    }

    function removeTyping() {
      const el = document.getElementById('typing-row');
      if (el) el.remove();
    }

    function escapeText(text) {
      return String(text ?? '');
    }

    async function streamPuterReply(prompt, model, reasoning) {
      if (!window.puter || !window.puter.ai) {
        throw new Error('Puter is not available. Make sure the Puter script loaded correctly.');
      }

      const assistantBubble = addMessage('assistant', '');

      const modelOptions = {
        model,
        stream: true,
        ...(reasoning && { reasoning, reasoning_effort: reasoning })
      };
      
      const streamResp = await window.puter.ai.chat(prompt, modelOptions);

      const reader = streamResp?.getReader?.();
      const chunks = streamResp?.chunks ?? streamResp?.stream ?? streamResp;

      if (reader) {
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const txt = decoder.decode(value, { stream: true });
          assistantBubble.textContent += escapeText(txt);
          chatEl.scrollTop = chatEl.scrollHeight;
        }
        return;
      }

      if (chunks && typeof chunks[Symbol.asyncIterator] === 'function') {
        for await (const chunk of chunks) {
          const txt = typeof chunk === 'string' ? chunk : (chunk?.text || chunk?.token || JSON.stringify(chunk));
          assistantBubble.textContent += escapeText(txt);
          chatEl.scrollTop = chatEl.scrollHeight;
        }
        return;
      }

      if (typeof streamResp === 'string') {
        assistantBubble.textContent = streamResp;
        return;
      }

      if (streamResp && typeof streamResp.then === 'function') {
        const result = await streamResp;
        assistantBubble.textContent = escapeText(result?.text || result?.content || result || '');
        return;
      }

      assistantBubble.textContent = 'No response stream returned by Puter.';
    }

    async function handleSend() {
      const promptText = promptEl.value.trim();
      if (!promptText) return;

      const model = modelSelectEl.value;
      const reasoning = reasoningSelectEl.value || '';
      
      addMessage('user', promptText);
      promptEl.value = '';
      promptEl.style.height = 'auto';
      addTyping();
      sendBtn.disabled = true;

      try {
        await streamPuterReply(promptText, model, reasoning);
      } catch (error) {
        removeTyping();
        addMessage('assistant', 'Error: ' + (error && error.message ? error.message : String(error)));
      } finally {
        removeTyping();
        sendBtn.disabled = false;
        promptEl.focus();
      }
    }

    promptEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSend();
      }
    });

    promptEl.addEventListener('input', () => {
      promptEl.style.height = 'auto';
      promptEl.style.height = Math.min(promptEl.scrollHeight, 160) + 'px';
    });

    sendBtn.addEventListener('click', handleSend);

    toggleReasoningUI();
    addMessage('assistant', 'Welcome to Puter AI Chat! Select a model and reasoning level (if available), then type your message.');
  </script>
</body>
</html>
`;

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);

  if (pathname === '/' || pathname === '/puter.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log('Puter AI chat demo running at http://localhost:' + PORT + '/');
  console.log('Open this URL in your browser to chat with the model.');
});
