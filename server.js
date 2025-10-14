// server.js
import express from 'express';
import { agent, llmOpenAI, mcp } from 'volcano-sdk';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());


// Environment variables with sensible defaults
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'Chris';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'http://host.docker.internal:8000/1';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const MCP_SERVICE_NAMES = (process.env.MCP_SERVICE_NAMES || 'vehicles').split(',').map(s => s.trim()).filter(Boolean);
const MCP_BASE_URL = process.env.MCP_BASE_URL || 'http://host.docker.internal:8000';

// Create OpenAI provider
const openai = llmOpenAI({
  apiKey: OPENAI_API_KEY,
  baseURL: OPENAI_BASE_URL,
  model: OPENAI_MODEL,
});

// MCP services
const mcps = MCP_SERVICE_NAMES.map(name =>
  mcp(`${MCP_BASE_URL}/${name}`)
);

async function runAgent(messages, useMcp = false) {
  // New agent each time so no context ensures message history is consistent from browser and can reset with a refresh
  const volcanoAgent = agent({ llm: openai });
  
  const config = {
    prompt: JSON.stringify(messages, null, 2),
    ...(useMcp && { mcps })
  };
  
  const out = await volcanoAgent.then(config).run();
  console.dir(out, { depth: null });

  const final = [...out].reverse().find(s => s.llmOutput);

  return {
    model: final?.llmInfo?.model || process.env.OPENAI_MODEL,
    reply: final?.llmOutput || 'Sorry, I could not produce a response.',
  };
}

// --- Express route ---
app.post('/api/chat', async (req, res) => {
  try {
    const allMessages = req.body.messages || [];
    const lastUserMsg = allMessages.at(-1)?.content || '';

    // Regex to detect MCP key words (case‑insensitive)
    const needsMcp = /\b(fetch|list|retrieve|weather)\b/i.test(lastUserMsg);
    
    const result = await runAgent(allMessages, needsMcp);

    res.json({
      response: result.reply
    });
  } catch (err) {
    console.error('Volcano agent error:', err);

    // Detect 429 rate limit
    if (err.status === 429 || err.cause?.status === 429) {
      return res.status(429).json({
        error: 'Rate limit has been hit. Please wait a few seconds and try again.',
      });
    }
    
    // Detect 400 bad request (prompt guard, content filter, etc.)
    if (err.status === 400 || err.cause?.status === 400) {
      return res.status(400).json({
        error: 'Your message was blocked by content filters. Please rephrase your request.',
      });
    }
    
    res.status(500).json({
      error: 'Sorry I am unable to help right now, please ask me something else',
    });
  }
});

app.listen(PORT, () => {
  console.log(`AI agent (Volcano) listening on http://0.0.0.0:${PORT}`);
});
