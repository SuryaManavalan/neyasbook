import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ChatRequest } from '../../shared/types';

/**
 * Chat Lambda: Handles Archie's responses and entity simulacra.
 * Uses SSE to stream back 'thinking' lines followed by the final message.
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const body = JSON.parse(event.body || '{}') as ChatRequest;

    // 1. Resolve context (S3 fetch manifest, chapter, entities)
    // 2. Build prompt with timeline scoping
    // 3. call LLM with streaming

    // Note: For SSE in Lambda + API Gateway:
    // - Use HTTP API (v2) for best support
    // - Return headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
        body: JSON.stringify({ message: "Streaming started" }), // Stream actual content via response-stream or just return full if non-streaming fallback
    };
};

/* 
Example Streaming implementation detail (pseudo-code):
const stream = await OpenAI.chat.completions.create({ stream: true, ... });
for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content || '';
  if (content) {
    // Send via SSE format: data: JSON.stringify({type: 'content', delta: content})\n\n
  }
}
*/
