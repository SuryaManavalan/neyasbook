const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const { OpenAI } = require('openai');
const s3Storage = require('./storage/s3');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Use S3 for storage
const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

const getStorageKey = (projectId, type, key) => {
    if (type === 'manifest') return `projects/${projectId}/manifest.json`;
    if (type === 'chapter') return `projects/${projectId}/chapters/${key}.json`;
    if (type === 'entity') return key ? `projects/${projectId}/entities/profiles/${key}.json` : `projects/${projectId}/entities/index.json`;
    if (type === 'chat') return `projects/${projectId}/chat.json`;
    if (type === 'sweep') return `projects/${projectId}/sweeps/${key}.json`;
    return `projects/${projectId}/${key}`;
};

// Storage helpers
async function readData(projectId, type, key = null) {
    const storageKey = getStorageKey(projectId, type, key);
    try {
        const content = await s3Storage.readFile(storageKey);
        return JSON.parse(content);
    } catch (error) {
        if (error.message === 'ENOENT') return null;
        throw error;
    }
}

async function writeData(projectId, type, data, key = null) {
    const storageKey = getStorageKey(projectId, type, key);
    await s3Storage.writeFile(storageKey, JSON.stringify(data, null, 2));
}

async function listProjects() {
    const keys = await s3Storage.listKeys('projects/');
    const projectIds = new Set();
    keys.forEach(key => {
        const match = key.match(/^projects\/([^\/]+)\//);
        if (match) projectIds.add(match[1]);
    });
    return Array.from(projectIds);
}

// --- Project Endpoints ---
app.get('/projects', async (req, res) => {
    try {
        const projectIds = await listProjects();
        const projects = await Promise.all(projectIds.map(async (id) => {
            const manifest = await readData(id, 'manifest');
            return {
                id,
                title: manifest?.title || id,
                description: manifest?.description || ''
            };
        }));
        res.json(projects);
    } catch (error) {
        console.error('Error listing projects:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/projects', async (req, res) => {
    try {
        const { id, title, description } = req.body;
        const manifest = {
            title: title || id,
            description: description || '',
            hierarchy: [{ id: 'part_1', title: 'Volume I', children: [{ id: '1', title: 'Chapter 1' }] }]
        };
        await writeData(id, 'manifest', manifest);
        await writeData(id, 'entity', { characters: [], places: [], institutions: [] });
        res.json({ success: true, id });
    } catch (error) {
        console.error('Error creating project:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/projects/:projectId', async (req, res) => {
    // Simplified - in production you'd delete all S3 objects for this project
    res.json({ success: true });
});

// --- Manifest Endpoints ---
app.get('/manifest/:projectId', async (req, res) => {
    try {
        const manifest = await readData(req.params.projectId, 'manifest');
        res.json(manifest || { hierarchy: [] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/manifest/:projectId', async (req, res) => {
    try {
        await writeData(req.params.projectId, 'manifest', req.body);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Content Endpoints ---
app.get('/content/:projectId/:chapterId', async (req, res) => {
    try {
        const content = await readData(req.params.projectId, 'chapter', req.params.chapterId);
        res.json(content || { content: '' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/content/:projectId/:chapterId', async (req, res) => {
    try {
        await writeData(req.params.projectId, 'chapter', req.body, req.params.chapterId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Entity Endpoints ---
app.get('/entities/:projectId', async (req, res) => {
    try {
        const entities = await readData(req.params.projectId, 'entity');
        res.json(entities || { characters: [], places: [], institutions: [] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/entities/:projectId', async (req, res) => {
    try {
        await writeData(req.params.projectId, 'entity', req.body);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/entities/:projectId/:entityId', async (req, res) => {
    try {
        const entity = await readData(req.params.projectId, 'entity', req.params.entityId);
        res.json(entity || {});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/entities/:projectId/:entityId', async (req, res) => {
    try {
        await writeData(req.params.projectId, 'entity', req.body, req.params.entityId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Chat Endpoints ---
app.post('/chat/:projectId', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (type, data) => {
        res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
        const { messages, context } = req.body;
        const projectId = req.params.projectId;

        // Get chat history
        const chatHistory = await readData(projectId, 'chat') || { messages: [] };
        
        // Build system message with context
        let systemMessage = "You are Archie, the Demon of Literature, bound to this manuscript...";
        
        if (context?.currentChapter) {
            const chapterContent = await readData(projectId, 'chapter', context.currentChapter);
            if (chapterContent) {
                systemMessage += `\n\nCurrent Chapter Content:\n${chapterContent.content}`;
            }
        }

        if (context?.entities && context.entities.length > 0) {
            for (const entityId of context.entities) {
                const entity = await readData(projectId, 'entity', entityId);
                if (entity) {
                    systemMessage += `\n\nEntity @${entityId}:\n${JSON.stringify(entity, null, 2)}`;
                }
            }
        }

        const allMessages = [
            { role: 'system', content: systemMessage },
            ...messages
        ];

        const stream = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: allMessages,
            stream: true,
            temperature: 0.8,
        });

        let fullResponse = '';
        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                fullResponse += content;
                sendEvent('token', { content });
            }
        }

        // Save to history
        chatHistory.messages.push(...messages, { role: 'assistant', content: fullResponse });
        await writeData(projectId, 'chat', chatHistory);

        sendEvent('done', {});
        res.end();
    } catch (error) {
        console.error('Chat Error:', error);
        sendEvent('error', { message: error.message });
        res.end();
    }
});

app.get('/chat/:projectId', async (req, res) => {
    try {
        const chatHistory = await readData(req.params.projectId, 'chat');
        res.json(chatHistory || { messages: [] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Sweep Endpoints ---
app.post('/sweep/:projectId', async (req, res) => {
    try {
        const { chapterId, content } = req.body;
        const projectId = req.params.projectId;

        // Extract entities using OpenAI
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{
                role: 'system',
                content: 'You are a literary analyst. Extract all characters, places, and institutions from the text. Return JSON format: {characters: [{id, name, description, timeline}], places: [{id, name, description}], institutions: [{id, name, description}]}'
            }, {
                role: 'user',
                content: `Chapter ${chapterId}:\n\n${content}`
            }],
            response_format: { type: 'json_object' }
        });

        const extracted = JSON.parse(response.choices[0].message.content);
        
        // Merge with existing entities
        const currentEntities = await readData(projectId, 'entity') || { characters: [], places: [], institutions: [] };
        
        // Simple merge logic (in production, you'd want smarter deduplication)
        currentEntities.characters = [...currentEntities.characters, ...extracted.characters];
        currentEntities.places = [...currentEntities.places, ...extracted.places];
        currentEntities.institutions = [...currentEntities.institutions, ...extracted.institutions];

        await writeData(projectId, 'entity', currentEntities);
        
        // Save sweep result
        await writeData(projectId, 'sweep', { chapterId, extracted, timestamp: new Date().toISOString() }, chapterId);

        res.json({ success: true, extracted });
    } catch (error) {
        console.error('Sweep Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

// Export for Lambda or run locally
if (isLambda) {
    module.exports.handler = serverless(app);
} else {
    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
        console.log(`✨ Neyasbook Backend running on port ${PORT}`);
        console.log(`📚 Using local filesystem storage`);
    });
}
