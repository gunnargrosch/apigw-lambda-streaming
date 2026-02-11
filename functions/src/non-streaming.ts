import { BedrockRuntimeClient, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION });

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const body = JSON.parse(event.body || '{}');
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';

    if (!prompt) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Prompt is required' }),
      };
    }

    const command = new ConverseStreamCommand({
      modelId: process.env.BEDROCK_MODEL_ID,
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      inferenceConfig: { maxTokens: 2048 },
    });

    const response = await client.send(command);
    let fullResponse = '';

    for await (const chunk of response.stream!) {
      if (chunk.contentBlockDelta?.delta?.text) {
        fullResponse += chunk.contentBlockDelta.delta.text;
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ response: fullResponse }),
    };
  } catch (error) {
    console.error('Non-streaming error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Failed to generate response' }),
    };
  }
};
