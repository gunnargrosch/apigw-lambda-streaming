import { BedrockRuntimeClient, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import type { APIGatewayProxyEvent } from 'aws-lambda';

declare const awslambda: {
  HttpResponseStream: {
    from: (
      responseStream: NodeJS.WritableStream,
      metadata: { statusCode: number; headers: Record<string, string> }
    ) => NodeJS.WritableStream;
  };
  streamifyResponse: (
    handler: (event: APIGatewayProxyEvent, responseStream: NodeJS.WritableStream) => Promise<void>
  ) => (event: APIGatewayProxyEvent) => Promise<void>;
};

const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION });

const streamingHandler = async (
  event: APIGatewayProxyEvent,
  responseStream: NodeJS.WritableStream
): Promise<void> => {
  const httpResponseStream = awslambda.HttpResponseStream.from(responseStream, {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });

  try {
    const body = JSON.parse(event.body || '{}');
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';

    if (!prompt) {
      httpResponseStream.write(`data: ${JSON.stringify({ error: 'Prompt is required' })}\n\n`);
      httpResponseStream.end();
      return;
    }

    const command = new ConverseStreamCommand({
      modelId: process.env.BEDROCK_MODEL_ID,
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      inferenceConfig: { maxTokens: 2048 },
    });

    const response = await client.send(command);

    for await (const chunk of response.stream!) {
      if (chunk.contentBlockDelta?.delta?.text) {
        const token = chunk.contentBlockDelta.delta.text;
        httpResponseStream.write(`data: ${JSON.stringify({ token })}\n\n`);
      }
    }

    httpResponseStream.write('data: [DONE]\n\n');
    httpResponseStream.end();
  } catch (error) {
    console.error('Streaming error:', error);
    httpResponseStream.write(`data: ${JSON.stringify({ error: 'Failed to generate response' })}\n\n`);
    httpResponseStream.end();
  }
};

export const handler = awslambda.streamifyResponse(streamingHandler);
