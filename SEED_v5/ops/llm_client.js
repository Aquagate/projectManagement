const http = require('http');

/**
 * LLM Client Adapter
 * Connects to a local LLM service (e.g., Ollama running Gemma 3 Quantized)
 * Default endpoint: http://localhost:11434/api/generate (Ollama default)
 */
const CONFIG = {
    endpoint: process.env.LLM_ENDPOINT || 'http://localhost:11434/api/generate',
    model: process.env.LLM_MODEL || 'gemma3:12b', // Standard Model for SEED apps
    mock_mode: process.env.LLM_MOCK === 'true' // Default: Real Connection (Ollama)
};

const SYSTEM_PROMPT = `
あなたはSEEDプロジェクトの高度な開発アシスタントです。
以下のルールを厳守してください：
1. 回答は必ず「日本語」で行うこと。
2. 技術用語は適切に使用するが、説明文は日本語とする。
3. 特に指定がない限り、論理的かつ簡潔に回答すること。
4. JSON形式が指定された場合は、妥当なJSONのみを返し、前後の説明文は一切加えないこと。
`;

async function generateCompletion(prompt, options = { json: true }) {
    if (CONFIG.mock_mode) {
        return mockResponse(prompt);
    }

    const jsonInstruction = options.json ? "\n\nRespond in JSON format only. (Values must be in Japanese)" : "\n\n日本語で回答してください。Markdown形式を推奨します。";
    const fullPrompt = `${SYSTEM_PROMPT}\n\n[USER REQUEST]\n${prompt}${jsonInstruction}`;

    const postData = JSON.stringify({
        model: CONFIG.model,
        prompt: fullPrompt,
        stream: false,
        format: options.json ? "json" : undefined
    });

    try {
        const response = await makeRequest(CONFIG.endpoint, postData);
        // Ollama returns { "response": "..." }
        if (response.response) {
            if (options.json) {
                try {
                    return JSON.parse(response.response);
                } catch (e) {
                    console.warn("Failed to parse AI response as JSON. Returning raw string.");
                    return response.response;
                }
            }
            return response.response;
        }
        return response; // Fallback
    } catch (e) {
        console.warn("LLM Connection Failed. Falling back to Mock.", e.message);
        return mockResponse(prompt);
    }
}

function makeRequest(urlStr, postData) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlStr);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    reject(new Error('Invalid JSON response'));
                }
            });
        });

        req.on('error', e => reject(e));
        req.write(postData);
        req.end();
    });
}

function mockResponse(prompt) {
    // Simple heuristic simulation
    console.log("[Mock LLM] Analyzing prompt...");

    // Detect keywords in prompt to return relevant mock data
    if (prompt.includes("Example") || prompt.includes("Sample")) {
        return {
            trigger_text: "Example Trigger",
            suggested_title: "Sample Standard Procedure",
            category: "General",
            reason: "Repetitive pattern detected in sample data."
        };
    }

    // Default mock
    return {
        trigger_text: "Unknown",
        suggested_title: "General Inquiry Handling",
        category: "General",
        reason: "Generic fallback response."
    };
}

module.exports = { generateCompletion };
