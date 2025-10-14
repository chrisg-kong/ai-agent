// server.js
import express from 'express';
import { agent, llmOpenAI, mcp } from 'volcano-sdk';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());

// Create OpenAI provider
const openai = llmOpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'Chris',
  baseURL: 'http://host.docker.internal:8000/1',
  model: 'gpt-4.1-mini',
});

// MCP services
const mcps = ['vehicles'].map(name =>
  mcp(`http://host.docker.internal:8000/${name}`)
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
    
    res.status(500).json({
      error: 'Sorry I am unable to help right now, please ask me something else',
    });
  }
});

app.listen(PORT, () => {
  console.log(`AI agent (Volcano) listening on http://0.0.0.0:${PORT}`);
});
