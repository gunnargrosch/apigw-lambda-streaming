# API Gateway Response Streaming Demo

Demonstrates the performance difference between API Gateway progressive response streaming and traditional buffered responses when calling Amazon Bedrock.

## Architecture

```
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

| Metric | Streaming | Buffered |
|--------|-----------|----------|
| Time to first byte | ~500ms | ~8-10s |
| Total time | ~8-10s | ~8-10s |
| User experience | Progressive, real-time | Waiting, then all at once |

## Prerequisites

- AWS account with [Amazon Bedrock model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html) enabled
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) configured with credentials
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- Node.js 20+

## Deploy

```bash
cd functions && npm install && cd ..
sam build
sam deploy --guided
```

SAM outputs the API Gateway base URL when deployment completes. Copy it for the demo client.

## Demo

Open `demo.html` in a browser, paste your API Gateway URL, and click **Run Comparison**. Both endpoints fire simultaneously so you can see the streaming panel fill up token-by-token while the buffered panel waits.

You can also test with curl:

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

The streaming configuration lives in two places:

**`openapi.yaml`** — API Gateway integration:
- Lambda URI path: `/response-streaming-invocations` (instead of `/invocations`)
- `responseTransferMode: STREAM`

**`functions/src/streaming.ts`** — Lambda handler:
- Wrapped with `awslambda.streamifyResponse()`
- Writes SSE events to `HttpResponseStream`

```
data: {"token":"Once"}

data: {"token":" upon"}

data: {"token":" a"}

...
data: [DONE]
```

## Clean Up

```bash
sam delete
```
