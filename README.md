# AI Agent

A minimal web chat app with:
- Clean chat UI (vanilla HTML/CSS/JS)
- Markdown rendering (marked)
- “Typing” animation while waiting for a reply
- Express server that serves the client and proxies chat requests
- Dockerfile for containerized deployment

## Overview

- Frontend (public/index.html) renders a simple chat interface and sends a trimmed conversation to the server:
  - Always includes a system message
  - Includes only the last few user/assistant turns to keep prompts short
  - POSTs to `/api/chat` with `{ messages: [...] }`
- Backend (server.js) is the Node/Express entrypoint. It serves `public/` and exposes `/api/chat`.
- Dependencies include `express` and `volcano-sdk` (see server.js for how the model/provider is wired).

Directory layout:
```
ai-agent/
├─ Dockerfile
├─ package.json
├─ server.js
└─ public/
   ├─ index.html
   └─ images/
      └─ logo.png
```

