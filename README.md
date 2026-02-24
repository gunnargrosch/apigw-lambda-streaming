# apigw-lambda-streaming

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Demonstrates the performance difference between [API Gateway response streaming](https://docs.aws.amazon.com/apigateway/latest/developerguide/rest-api-streaming.html) and traditional buffered responses when calling [Amazon Bedrock](https://aws.amazon.com/bedrock/). Streaming delivers the first token to the client in ~500ms instead of waiting ~8-10s for the full response — with no change in total generation time.

## Architecture

```text
                        ┌──────────────┐
               POST     │              │     ConverseStream
Client ───────────────▶ │ API Gateway  │ ──────────────────▶ Amazon Bedrock
  ▲                     │              │                         │
  │                     └──────┬───────┘                         │
  │                            │                                 │
  │   ┌────────────────────────┼─────────────────────────┐       │
  │   │                        │                         │       │
  │   │  /streaming            │   /non-streaming        │       │
  │   │  Lambda + streamify    │   Lambda (standard)     │       │
  │   │  SSE tokens ◀─────────┼───────────────────────── │ ◀─────┘
  │   │                        │   Buffers full response  │
  │   └────────────────────────┼─────────────────────────┘
  │                            │
  ◀────────────────────────────┘
  Streaming: tokens arrive         Buffered: waits for
  in ~500ms                        complete response ~8-10s
```

Two Lambda functions call the same Bedrock model with the same prompt:

- **Streaming** (`/streaming`) — Uses `awslambda.streamifyResponse()` and API Gateway's `responseTransferMode: STREAM` to forward tokens as Server-Sent Events the moment Bedrock generates them.
- **Buffered** (`/non-streaming`) — Accumulates the full response in memory, then returns it as a single JSON payload.

The total generation time is the same. The difference is when the user starts seeing output.

| Metric             | Streaming              | Buffered                  |
| ------------------ | ---------------------- | ------------------------- |
| Time to first byte | ~500ms                 | ~8-10s                    |
| Total time         | ~8-10s                 | ~8-10s                    |
| User experience    | Progressive, real-time | Waiting, then all at once |

## Project Structure

```text
.
├── template.yaml              # SAM infrastructure template
├── openapi.yaml               # API Gateway OpenAPI spec (streaming config)
├── demo.html                  # Interactive side-by-side demo client
└── functions/
    └── src/
        ├── streaming.ts       # Streaming Lambda handler (SSE)
        └── non-streaming.ts   # Buffered Lambda handler (JSON)
```

## Prerequisites

- AWS account with [Amazon Bedrock model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html) enabled for the configured model
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) configured with credentials
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- Node.js 20+

## Getting Started

### Deploy

```bash
cd functions && npm install && cd ..
sam build
sam deploy --guided
```

SAM outputs the API Gateway base URL when deployment completes. Copy it for the next step.

### Run the Demo

Open `demo.html` in a browser, paste your API Gateway URL, and click **Run Comparison**. Both endpoints fire simultaneously so you can see the streaming panel fill up token-by-token while the buffered panel waits.

Keyboard shortcut: **Ctrl+Enter** (or **Cmd+Enter** on macOS) to run.

### Test with curl

```bash
# Streaming — tokens appear progressively as SSE events
curl -N -X POST https://<api-id>.execute-api.<region>.amazonaws.com/demo/streaming \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Write a short story about serverless computing"}'

# Buffered — waits for the complete response
curl -X POST https://<api-id>.execute-api.<region>.amazonaws.com/demo/non-streaming \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Write a short story about serverless computing"}'
```

## How Streaming Works

The streaming setup requires configuration in two places:

### API Gateway (OpenAPI spec)

In `openapi.yaml`, the streaming endpoint uses a special Lambda invocation URI and transfer mode:

- **URI path**: `/response-streaming-invocations` instead of the standard `/invocations`
- **Transfer mode**: `responseTransferMode: STREAM`
- **Integration type**: `AWS_PROXY`

### Lambda Handler

In `functions/src/streaming.ts`, the handler is wrapped with `awslambda.streamifyResponse()` which provides a writable `HttpResponseStream`. Tokens are written as [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) as soon as Bedrock generates them:

```text
data: {"token":"Once"}

data: {"token":" upon"}

data: {"token":" a"}

...
data: [DONE]
```

The buffered handler in `functions/src/non-streaming.ts` uses a standard Lambda handler that accumulates the full Bedrock response before returning a JSON payload.

## Configuration

The Bedrock model ID is configurable via the `BedrockModelId` SAM parameter. Default: `us.anthropic.claude-3-5-sonnet-20241022-v2:0`.

Override during deployment:

```bash
sam deploy --parameter-overrides BedrockModelId=us.anthropic.claude-3-haiku-20240307-v1:0
```

## Clean Up

```bash
sam delete
```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

[MIT](LICENSE)
