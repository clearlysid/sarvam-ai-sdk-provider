import { LanguageModelV3Prompt } from "@ai-sdk/provider";
import { convertReadableStreamToArray } from "@ai-sdk/provider-utils/test";
import { createTestServer } from "@ai-sdk/test-server/with-vitest";
import { createSarvam } from "../provider";

const TEST_PROMPT: LanguageModelV3Prompt = [
    { role: "user", content: [{ type: "text", text: "Hello" }] },
];

const provider = createSarvam({
    apiKey: "test-api-key",
});

const model = provider("sarvam-m");

const server = createTestServer({
    "https://api.sarvam.ai/v1/chat/completions": {},
});

describe("doGenerate", () => {
    function prepareJsonResponse({
        content = "",
        reasoning,
        tool_calls,
        usage = {
            prompt_tokens: 4,
            total_tokens: 34,
            completion_tokens: 30,
        },
        finish_reason = "stop",
        id = "chatcmpl-95ZTZkhr0mHNKqerQfiwkuox3PHAd",
        created = 1711115037,
        model = "sarvam-m",
        headers,
    }: {
        content?: string;
        reasoning?: string;
        tool_calls?: Array<{
            id: string;
            type: "function";
            function: {
                name: string;
                arguments: string;
            };
        }>;
        usage?: {
            prompt_tokens?: number;
            total_tokens?: number;
            completion_tokens?: number;
        };
        finish_reason?: string;
        created?: number;
        id?: string;
        model?: string;
        headers?: Record<string, string>;
    } = {}) {
        server.urls[
            "https://api.sarvam.ai/v1/chat/completions"
        ].response = {
            type: "json-value",
            headers,
            body: {
                id,
                object: "chat.completion",
                created,
                model,
                choices: [
                    {
                        index: 0,
                        message: {
                            role: "assistant",
                            content,
                            reasoning,
                            tool_calls,
                        },
                        finish_reason,
                    },
                ],
                usage,
                system_fingerprint: "fp_3bc1b5746c",
            },
        };
    }

    it("should extract text response", async () => {
        prepareJsonResponse({ content: "Hello, World!" });

        const result = await model.doGenerate({
            prompt: TEST_PROMPT,
        });

        expect(result.content).toStrictEqual([
            { type: "text", text: "Hello, World!" },
        ]);
    });

    it("should extract reasoning", async () => {
        prepareJsonResponse({
            content: "Hello",
            reasoning: "This is a test reasoning",
        });

        const result = await model.doGenerate({
            prompt: TEST_PROMPT,
        });

        expect(result.content).toStrictEqual([
            { type: "reasoning", text: "This is a test reasoning" },
            { type: "text", text: "Hello" },
        ]);
    });

    it("should extract usage", async () => {
        prepareJsonResponse({
            content: "",
            usage: {
                prompt_tokens: 20,
                total_tokens: 25,
                completion_tokens: 5,
            },
        });

        const { usage } = await model.doGenerate({
            prompt: TEST_PROMPT,
        });

        expect(usage).toStrictEqual({
            inputTokens: {
                total: 20,
                noCache: undefined,
                cacheRead: undefined,
                cacheWrite: undefined,
            },
            outputTokens: {
                total: 5,
                text: undefined,
                reasoning: undefined,
            },
        });
    });

    it("should send additional response information", async () => {
        prepareJsonResponse({
            id: "test-id",
            created: 123,
            model: "test-model",
        });

        const { response } = await model.doGenerate({
            prompt: TEST_PROMPT,
        });

        expect(response).toMatchObject({
            id: "test-id",
            timestamp: new Date(123 * 1000),
            modelId: "test-model",
        });
    });

    it("should support partial usage", async () => {
        prepareJsonResponse({
            content: "",
            usage: { prompt_tokens: 20, total_tokens: 20 },
        });

        const { usage } = await model.doGenerate({
            prompt: TEST_PROMPT,
        });

        expect(usage).toStrictEqual({
            inputTokens: {
                total: 20,
                noCache: undefined,
                cacheRead: undefined,
                cacheWrite: undefined,
            },
            outputTokens: {
                total: undefined,
                text: undefined,
                reasoning: undefined,
            },
        });
    });

    it("should extract finish reason", async () => {
        prepareJsonResponse({
            content: "",
            finish_reason: "stop",
        });

        const response = await model.doGenerate({
            prompt: TEST_PROMPT,
        });

        expect(response.finishReason).toStrictEqual({
            unified: "stop",
            raw: "stop",
        });
    });

    it("should support unknown finish reason", async () => {
        prepareJsonResponse({
            content: "",
            finish_reason: "eos",
        });

        const response = await model.doGenerate({
            prompt: TEST_PROMPT,
        });

        expect(response.finishReason).toStrictEqual({
            unified: "other",
            raw: "eos",
        });
    });

    it("should expose response headers", async () => {
        prepareJsonResponse({
            headers: {
                "test-header": "test-value",
            },
        });

        const { response } = await model.doGenerate({
            prompt: TEST_PROMPT,
        });

        expect(response?.headers).toMatchObject({
            "test-header": "test-value",
        });
    });

    it("should pass the model and the messages", async () => {
        prepareJsonResponse({ content: "" });

        await model.doGenerate({
            prompt: TEST_PROMPT,
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
            model: "sarvam-m",
            messages: [{ role: "user", content: "Hello" }],
        });
    });

    it("should pass settings", async () => {
        prepareJsonResponse();

        await provider("sarvam-m", {
            parallelToolCalls: false,
            user: "test-user-id",
        }).doGenerate({
            prompt: TEST_PROMPT,
            providerOptions: {
                sarvam: { reasoningFormat: "hidden" },
            },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
            model: "sarvam-m",
            messages: [{ role: "user", content: "Hello" }],
            parallel_tool_calls: false,
            user: "test-user-id",
            reasoning_format: "hidden",
        });
    });

    it("should pass tools and toolChoice", async () => {
        prepareJsonResponse({ content: "" });

        await model.doGenerate({
            prompt: TEST_PROMPT,
            tools: [
                {
                    type: "function",
                    name: "test-tool",
                    inputSchema: {
                        type: "object",
                        properties: { value: { type: "string" } },
                        required: ["value"],
                        additionalProperties: false,
                        $schema: "http://json-schema.org/draft-07/schema#",
                    },
                },
            ],
            toolChoice: {
                type: "tool",
                toolName: "test-tool",
            },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
            model: "sarvam-m",
            messages: [{ role: "user", content: "Hello" }],
            tools: [
                {
                    type: "function",
                    function: {
                        name: "test-tool",
                        parameters: {
                            type: "object",
                            properties: { value: { type: "string" } },
                            required: ["value"],
                            additionalProperties: false,
                            $schema: "http://json-schema.org/draft-07/schema#",
                        },
                    },
                },
            ],
            tool_choice: {
                type: "function",
                function: { name: "test-tool" },
            },
        });
    });

    it("should pass headers", async () => {
        prepareJsonResponse({ content: "" });

        const provider = createSarvam({
            apiKey: "test-api-key",
            headers: {
                "Custom-Provider-Header": "provider-header-value",
            },
        });

        await provider("sarvam-m").doGenerate({
            prompt: TEST_PROMPT,
            headers: {
                "Custom-Request-Header": "request-header-value",
            },
        });

        expect(server.calls[0].requestHeaders).toMatchObject({
            authorization: "Bearer test-api-key",
            "content-type": "application/json",
            "custom-provider-header": "provider-header-value",
            "custom-request-header": "request-header-value",
        });
    });

    it("should parse tool results", async () => {
        prepareJsonResponse({
            tool_calls: [
                {
                    id: "call_O17Uplv4lJvD6DVdIvFFeRMw",
                    type: "function",
                    function: {
                        name: "test-tool",
                        arguments: '{"value":"Spark"}',
                    },
                },
            ],
        });

        const result = await model.doGenerate({
            prompt: TEST_PROMPT,
            tools: [
                {
                    type: "function",
                    name: "test-tool",
                    inputSchema: {
                        type: "object",
                        properties: { value: { type: "string" } },
                        required: ["value"],
                        additionalProperties: false,
                        $schema: "http://json-schema.org/draft-07/schema#",
                    },
                },
            ],
            toolChoice: {
                type: "tool",
                toolName: "test-tool",
            },
        });

        expect(result.content).toStrictEqual([
            {
                type: "tool-call",
                toolCallId: "call_O17Uplv4lJvD6DVdIvFFeRMw",
                toolName: "test-tool",
                input: '{"value":"Spark"}',
            },
        ]);
    });

    it("should pass json response format", async () => {
        prepareJsonResponse({ content: '{"value":"Spark"}' });

        const model = provider("sarvam-m");

        await model.doGenerate({
            prompt: TEST_PROMPT,
            responseFormat: {
                type: "json",
            },
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
            model: "sarvam-m",
            messages: [{ role: "user", content: "Hello" }],
            response_format: {
                type: "json_object",
            },
        });
    });

    it("should send request body", async () => {
        prepareJsonResponse({ content: "" });

        const { request } = await model.doGenerate({
            prompt: TEST_PROMPT,
        });

        expect(request).toStrictEqual({
            body: '{"model":"sarvam-m","messages":[{"role":"user","content":"Hello"}]}',
        });
    });
});

describe("doStream", () => {
    function prepareStreamResponse({
        content = [],
        finish_reason = "stop",
        headers,
    }: {
        content?: string[];
        finish_reason?: string;
        headers?: Record<string, string>;
    }) {
        server.urls[
            "https://api.sarvam.ai/v1/chat/completions"
        ].response = {
            type: "stream-chunks",
            headers,
            chunks: [
                `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1702657020,"model":"sarvam-m",` +
                    `"system_fingerprint":null,"choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n`,
                ...content.map((text) => {
                    return (
                        `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1702657020,"model":"sarvam-m",` +
                        `"system_fingerprint":null,"choices":[{"index":0,"delta":{"content":"${text}"},"finish_reason":null}]}\n\n`
                    );
                }),
                `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1702657020,"model":"sarvam-m",` +
                    `"system_fingerprint":null,"choices":[{"index":0,"delta":{},"finish_reason":"${finish_reason}"}]}\n\n`,
                `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1729171479,"model":"sarvam-m",` +
                    `"system_fingerprint":"fp_10c08bf97d","choices":[{"index":0,"delta":{},"logprobs":null,"finish_reason":"${finish_reason}"}],` +
                    `"x_sarvam":{"id":"req_01jadadp0femyae9kav1gpkhe8","usage":{"queue_time":0.061348671,"prompt_tokens":18,"prompt_time":0.000211569,` +
                    `"completion_tokens":439,"completion_time":0.798181818,"total_tokens":457,"total_time":0.798393387}}}\n\n`,
                "data: [DONE]\n\n",
            ],
        };
    }

    it("should stream text deltas", async () => {
        prepareStreamResponse({
            content: ["Hello", ", ", "World!"],
            finish_reason: "stop",
        });

        const { stream } = await model.doStream({
            prompt: TEST_PROMPT,
        });

        const events = await convertReadableStreamToArray(stream);

        expect(events).toStrictEqual([
            {
                type: "stream-start",
                warnings: [
                    { type: "other", message: "Streaming is still experimental for Sarvam" },
                ],
            },
            {
                type: "response-metadata",
                id: "chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798",
                modelId: "sarvam-m",
                timestamp: new Date("2023-12-15T16:17:00.000Z"),
            },
            { type: "text-start", id: expect.any(String) },
            { type: "text-delta", id: expect.any(String), delta: "Hello" },
            { type: "text-delta", id: expect.any(String), delta: ", " },
            { type: "text-delta", id: expect.any(String), delta: "World!" },
            { type: "text-end", id: expect.any(String) },
            {
                type: "finish",
                finishReason: { unified: "stop", raw: "stop" },
                usage: {
                    inputTokens: { total: 18, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
                    outputTokens: { total: 439, text: undefined, reasoning: undefined },
                },
            },
        ]);
    });

    it("should stream reasoning deltas", async () => {
        server.urls[
            "https://api.sarvam.ai/v1/chat/completions"
        ].response = {
            type: "stream-chunks",
            chunks: [
                `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1702657020,"model":"sarvam-m",` +
                    `"system_fingerprint":null,"choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n`,
                `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1702657020,"model":"sarvam-m",` +
                    `"system_fingerprint":null,"choices":[{"index":0,"delta":{"reasoning":"I think,"},"finish_reason":null}]}\n\n`,
                `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1702657020,"model":"sarvam-m",` +
                    `"system_fingerprint":null,"choices":[{"index":0,"delta":{"reasoning":"therefore I am."},"finish_reason":null}]}\n\n`,
                `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1702657020,"model":"sarvam-m",` +
                    `"system_fingerprint":null,"choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}\n\n`,
                `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1702657020,"model":"sarvam-m",` +
                    `"system_fingerprint":null,"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n`,
                `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1729171479,"model":"sarvam-m",` +
                    `"system_fingerprint":"fp_10c08bf97d","choices":[{"index":0,"delta":{},"logprobs":null,"finish_reason":"stop"}],` +
                    `"x_sarvam":{"id":"req_01jadadp0femyae9kav1gpkhe8","usage":{"queue_time":0.061348671,"prompt_tokens":18,"prompt_time":0.000211569,` +
                    `"completion_tokens":439,"completion_time":0.798181818,"total_tokens":457,"total_time":0.798393387}}}\n\n`,
                "data: [DONE]\n\n",
            ],
        };

        const { stream } = await model.doStream({
            prompt: TEST_PROMPT,
        });

        const events = await convertReadableStreamToArray(stream);

        expect(events).toStrictEqual([
            {
                type: "stream-start",
                warnings: [
                    { type: "other", message: "Streaming is still experimental for Sarvam" },
                ],
            },
            {
                type: "response-metadata",
                id: "chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798",
                modelId: "sarvam-m",
                timestamp: new Date("2023-12-15T16:17:00.000Z"),
            },
            { type: "reasoning-start", id: expect.any(String) },
            { type: "reasoning-delta", id: expect.any(String), delta: "I think," },
            { type: "reasoning-delta", id: expect.any(String), delta: "therefore I am." },
            { type: "text-start", id: expect.any(String) },
            { type: "text-delta", id: expect.any(String), delta: "Hello" },
            { type: "reasoning-end", id: expect.any(String) },
            { type: "text-end", id: expect.any(String) },
            {
                type: "finish",
                finishReason: { unified: "stop", raw: "stop" },
                usage: {
                    inputTokens: { total: 18, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
                    outputTokens: { total: 439, text: undefined, reasoning: undefined },
                },
            },
        ]);
    });

    it("should stream tool deltas", async () => {
        server.urls[
            "https://api.sarvam.ai/v1/chat/completions"
        ].response = {
            type: "stream-chunks",
            chunks: [
                `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"sarvam-m",` +
                    `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"role":"assistant","content":null,` +
                    `"tool_calls":[{"index":0,"id":"call_O17Uplv4lJvD6DVdIvFFeRMw","type":"function","function":{"name":"test-tool","arguments":""}}]},` +
                    `"finish_reason":null}]}\n\n`,
                `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"sarvam-m",` +
                    `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\""}}]},` +
                    `"finish_reason":null}]}\n\n`,
                `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"sarvam-m",` +
                    `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"value"}}]},` +
                    `"finish_reason":null}]}\n\n`,
                `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"sarvam-m",` +
                    `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\":\\""}}]},` +
                    `"finish_reason":null}]}\n\n`,
                `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"sarvam-m",` +
                    `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"Spark"}}]},` +
                    `"finish_reason":null}]}\n\n`,
                `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"sarvam-m",` +
                    `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"le"}}]},` +
                    `"finish_reason":null}]}\n\n`,
                `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"sarvam-m",` +
                    `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":" Day"}}]},` +
                    `"finish_reason":null}]}\n\n`,
                `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"sarvam-m",` +
                    `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"}"}}]},` +
                    `"finish_reason":null}]}\n\n`,
                `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1729171479,"model":"sarvam-m",` +
                    `"system_fingerprint":"fp_10c08bf97d","choices":[{"index":0,"delta":{},"logprobs":null,"finish_reason":"tool_calls"}],` +
                    `"x_sarvam":{"id":"req_01jadadp0femyae9kav1gpkhe8","usage":{"queue_time":0.061348671,"prompt_tokens":18,"prompt_time":0.000211569,` +
                    `"completion_tokens":439,"completion_time":0.798181818,"total_tokens":457,"total_time":0.798393387}}}\n\n`,
                "data: [DONE]\n\n",
            ],
        };

        const { stream } = await model.doStream({
            prompt: TEST_PROMPT,
            tools: [
                {
                    type: "function",
                    name: "test-tool",
                    inputSchema: {
                        type: "object",
                        properties: { value: { type: "string" } },
                        required: ["value"],
                        additionalProperties: false,
                        $schema: "http://json-schema.org/draft-07/schema#",
                    },
                },
            ],
        });

        const events = await convertReadableStreamToArray(stream);

        expect(events).toStrictEqual([
            {
                type: "stream-start",
                warnings: expect.any(Array),
            },
            {
                type: "response-metadata",
                id: "chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798",
                modelId: "sarvam-m",
                timestamp: new Date("2024-03-25T09:06:38.000Z"),
            },
            { type: "tool-input-start", id: "call_O17Uplv4lJvD6DVdIvFFeRMw", toolName: "test-tool" },
            { type: "tool-input-delta", id: "call_O17Uplv4lJvD6DVdIvFFeRMw", delta: '{"' },
            { type: "tool-input-delta", id: "call_O17Uplv4lJvD6DVdIvFFeRMw", delta: "value" },
            { type: "tool-input-delta", id: "call_O17Uplv4lJvD6DVdIvFFeRMw", delta: '":"' },
            { type: "tool-input-delta", id: "call_O17Uplv4lJvD6DVdIvFFeRMw", delta: "Spark" },
            { type: "tool-input-delta", id: "call_O17Uplv4lJvD6DVdIvFFeRMw", delta: "le" },
            { type: "tool-input-delta", id: "call_O17Uplv4lJvD6DVdIvFFeRMw", delta: " Day" },
            { type: "tool-input-delta", id: "call_O17Uplv4lJvD6DVdIvFFeRMw", delta: '"}'  },
            { type: "tool-input-end", id: "call_O17Uplv4lJvD6DVdIvFFeRMw" },
            {
                type: "tool-call",
                toolCallId: "call_O17Uplv4lJvD6DVdIvFFeRMw",
                toolName: "test-tool",
                input: '{"value":"Sparkle Day"}',
            },
            {
                type: "finish",
                finishReason: { unified: "tool-calls", raw: "tool_calls" },
                usage: {
                    inputTokens: { total: 18, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
                    outputTokens: { total: 439, text: undefined, reasoning: undefined },
                },
            },
        ]);
    });

    it("should stream tool call that is sent in one chunk", async () => {
        server.urls[
            "https://api.sarvam.ai/v1/chat/completions"
        ].response = {
            type: "stream-chunks",
            chunks: [
                `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1711357598,"model":"sarvam-m",` +
                    `"system_fingerprint":"fp_3bc1b5746c","choices":[{"index":0,"delta":{"role":"assistant","content":null,` +
                    `"tool_calls":[{"index":0,"id":"call_O17Uplv4lJvD6DVdIvFFeRMw","type":"function","function":{"name":"test-tool","arguments":"{\\"value\\":\\"Sparkle Day\\"}"}}]},` +
                    `"finish_reason":null}]}\n\n`,
                `data: {"id":"chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798","object":"chat.completion.chunk","created":1729171479,"model":"sarvam-m",` +
                    `"system_fingerprint":"fp_10c08bf97d","choices":[{"index":0,"delta":{},"logprobs":null,"finish_reason":"tool_calls"}],` +
                    `"x_sarvam":{"id":"req_01jadadp0femyae9kav1gpkhe8","usage":{"queue_time":0.061348671,"prompt_tokens":18,"prompt_time":0.000211569,` +
                    `"completion_tokens":439,"completion_time":0.798181818,"total_tokens":457,"total_time":0.798393387}}}\n\n`,
                "data: [DONE]\n\n",
            ],
        };

        const { stream } = await model.doStream({
            prompt: TEST_PROMPT,
            tools: [
                {
                    type: "function",
                    name: "test-tool",
                    inputSchema: {
                        type: "object",
                        properties: { value: { type: "string" } },
                        required: ["value"],
                        additionalProperties: false,
                        $schema: "http://json-schema.org/draft-07/schema#",
                    },
                },
            ],
        });

        const events = await convertReadableStreamToArray(stream);

        expect(events).toStrictEqual([
            { type: "stream-start", warnings: expect.any(Array) },
            {
                type: "response-metadata",
                id: "chatcmpl-e7f8e220-656c-4455-a132-dacfc1370798",
                modelId: "sarvam-m",
                timestamp: new Date("2024-03-25T09:06:38.000Z"),
            },
            { type: "tool-input-start", id: "call_O17Uplv4lJvD6DVdIvFFeRMw", toolName: "test-tool" },
            { type: "tool-input-delta", id: "call_O17Uplv4lJvD6DVdIvFFeRMw", delta: '{"value":"Sparkle Day"}' },
            { type: "tool-input-end", id: "call_O17Uplv4lJvD6DVdIvFFeRMw" },
            {
                type: "tool-call",
                toolCallId: "call_O17Uplv4lJvD6DVdIvFFeRMw",
                toolName: "test-tool",
                input: '{"value":"Sparkle Day"}',
            },
            {
                type: "finish",
                finishReason: { unified: "tool-calls", raw: "tool_calls" },
                usage: {
                    inputTokens: { total: 18, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
                    outputTokens: { total: 439, text: undefined, reasoning: undefined },
                },
            },
        ]);
    });

    it("should not duplicate tool calls when there is an additional empty chunk after completion", async () => {
        server.urls[
            "https://api.sarvam.ai/v1/chat/completions"
        ].response = {
            type: "stream-chunks",
            chunks: [
                `data: {"id":"chat-2267f7e2910a4254bac0650ba74cfc1c","object":"chat.completion.chunk","created":1733162241,` +
                    `"model":"meta/llama-3.1-8b-instruct:fp8","choices":[{"index":0,"delta":{"role":"assistant","content":""},"logprobs":null,"finish_reason":null}]}\n\n`,
                `data: {"id":"chat-2267f7e2910a4254bac0650ba74cfc1c","object":"chat.completion.chunk","created":1733162241,` +
                    `"model":"meta/llama-3.1-8b-instruct:fp8","choices":[{"index":0,"delta":{"tool_calls":[{"id":"chatcmpl-tool-b3b307239370432d9910d4b79b4dbbaa",` +
                    `"type":"function","index":0,"function":{"name":"searchGoogle"}}]},"logprobs":null,"finish_reason":null}]}\n\n`,
                `data: {"id":"chat-2267f7e2910a4254bac0650ba74cfc1c","object":"chat.completion.chunk","created":1733162241,` +
                    `"model":"meta/llama-3.1-8b-instruct:fp8","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,` +
                    `"function":{"arguments":"{\\"query\\": \\""}}]},"logprobs":null,"finish_reason":null}]}\n\n`,
                `data: {"id":"chat-2267f7e2910a4254bac0650ba74cfc1c","object":"chat.completion.chunk","created":1733162241,` +
                    `"model":"meta/llama-3.1-8b-instruct:fp8","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,` +
                    `"function":{"arguments":"latest"}}]},"logprobs":null,"finish_reason":null}]}\n\n`,
                `data: {"id":"chat-2267f7e2910a4254bac0650ba74cfc1c","object":"chat.completion.chunk","created":1733162241,` +
                    `"model":"meta/llama-3.1-8b-instruct:fp8","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,` +
                    `"function":{"arguments":" news"}}]},"logprobs":null,"finish_reason":null}]}\n\n`,
                `data: {"id":"chat-2267f7e2910a4254bac0650ba74cfc1c","object":"chat.completion.chunk","created":1733162241,` +
                    `"model":"meta/llama-3.1-8b-instruct:fp8","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,` +
                    `"function":{"arguments":" on"}}]},"logprobs":null,"finish_reason":null}]}\n\n`,
                `data: {"id":"chat-2267f7e2910a4254bac0650ba74cfc1c","object":"chat.completion.chunk","created":1733162241,` +
                    `"model":"meta/llama-3.1-8b-instruct:fp8","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,` +
                    `"function":{"arguments":" ai\\"}"}}]},"logprobs":null,"finish_reason":null}]}\n\n`,
                // empty arguments chunk after the tool call has already been finished:
                `data: {"id":"chat-2267f7e2910a4254bac0650ba74cfc1c","object":"chat.completion.chunk","created":1733162241,` +
                    `"model":"meta/llama-3.1-8b-instruct:fp8","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,` +
                    `"function":{"arguments":""}}]},"logprobs":null,"finish_reason":"tool_calls","stop_reason":128008}]}\n\n`,
                `data: {"id":"chat-2267f7e2910a4254bac0650ba74cfc1c","object":"chat.completion.chunk","created":1733162241,` +
                    `"model":"meta/llama-3.1-8b-instruct:fp8","choices":[]}\n\n`,
                `data: [DONE]\n\n`,
            ],
        };

        const { stream } = await model.doStream({
            prompt: TEST_PROMPT,
            tools: [
                {
                    type: "function",
                    name: "searchGoogle",
                    inputSchema: {
                        type: "object",
                        properties: { query: { type: "string" } },
                        required: ["query"],
                        additionalProperties: false,
                        $schema: "http://json-schema.org/draft-07/schema#",
                    },
                },
            ],
        });

        const events = await convertReadableStreamToArray(stream);

        expect(events).toStrictEqual([
            { type: "stream-start", warnings: expect.any(Array) },
            {
                type: "response-metadata",
                id: "chat-2267f7e2910a4254bac0650ba74cfc1c",
                modelId: "meta/llama-3.1-8b-instruct:fp8",
                timestamp: new Date("2024-12-02T17:57:21.000Z"),
            },
            { type: "tool-input-start", id: "chatcmpl-tool-b3b307239370432d9910d4b79b4dbbaa", toolName: "searchGoogle" },
            { type: "tool-input-delta", id: "chatcmpl-tool-b3b307239370432d9910d4b79b4dbbaa", delta: '{"query": "' },
            { type: "tool-input-delta", id: "chatcmpl-tool-b3b307239370432d9910d4b79b4dbbaa", delta: "latest" },
            { type: "tool-input-delta", id: "chatcmpl-tool-b3b307239370432d9910d4b79b4dbbaa", delta: " news" },
            { type: "tool-input-delta", id: "chatcmpl-tool-b3b307239370432d9910d4b79b4dbbaa", delta: " on" },
            { type: "tool-input-delta", id: "chatcmpl-tool-b3b307239370432d9910d4b79b4dbbaa", delta: ' ai"}' },
            { type: "tool-input-end", id: "chatcmpl-tool-b3b307239370432d9910d4b79b4dbbaa" },
            {
                type: "tool-call",
                toolCallId: "chatcmpl-tool-b3b307239370432d9910d4b79b4dbbaa",
                toolName: "searchGoogle",
                input: '{"query": "latest news on ai"}',
            },
            {
                type: "finish",
                finishReason: { unified: "tool-calls", raw: "tool_calls" },
                usage: {
                    inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
                    outputTokens: { total: undefined, text: undefined, reasoning: undefined },
                },
            },
        ]);
    });

    it("should handle error stream parts", async () => {
        server.urls[
            "https://api.sarvam.ai/v1/chat/completions"
        ].response = {
            type: "stream-chunks",
            chunks: [
                `data: {"error":{"message": "The server had an error processing your request. Sorry about that!","type":"invalid_request_error"}}\n\n`,
                "data: [DONE]\n\n",
            ],
        };

        const { stream } = await model.doStream({
            prompt: TEST_PROMPT,
        });

        const events = await convertReadableStreamToArray(stream);

        expect(events).toStrictEqual([
            {
                type: "error",
                error: {
                    message:
                        "The server had an error processing your request. Sorry about that!",
                    type: "invalid_request_error",
                },
            },
            {
                type: "finish",
                finishReason: { unified: "error", raw: undefined },
                usage: {
                    inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
                    outputTokens: { total: undefined, text: undefined, reasoning: undefined },
                },
            },
        ]);
    });

    it("should handle unparsable stream parts", async () => {
        server.urls[
            "https://api.sarvam.ai/v1/chat/completions"
        ].response = {
            type: "stream-chunks",
            chunks: [`data: {unparsable}\n\n`, "data: [DONE]\n\n"],
        };

        const { stream } = await model.doStream({
            prompt: TEST_PROMPT,
        });

        const elements = await convertReadableStreamToArray(stream);

        expect(elements.length).toBe(2);
        expect(elements[0].type).toBe("error");
        expect(elements[1]).toStrictEqual({
            type: "finish",
            finishReason: { unified: "error", raw: undefined },
            usage: {
                inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
                outputTokens: { total: undefined, text: undefined, reasoning: undefined },
            },
        });
    });

    it("should expose the response headers", async () => {
        prepareStreamResponse({
            headers: {
                "test-header": "test-value",
            },
        });

        const { response } = await model.doStream({
            prompt: TEST_PROMPT,
        });

        expect(response?.headers).toMatchObject({
            "test-header": "test-value",
        });
    });

    it("should pass the messages and the model", async () => {
        prepareStreamResponse({ content: [] });

        await model.doStream({
            prompt: TEST_PROMPT,
        });

        expect(await server.calls[0].requestBodyJson).toStrictEqual({
            stream: true,
            model: "sarvam-m",
            messages: [{ role: "user", content: "Hello" }],
        });
    });

    it("should pass headers", async () => {
        prepareStreamResponse({ content: [] });

        const provider = createSarvam({
            apiKey: "test-api-key",
            headers: {
                "Custom-Provider-Header": "provider-header-value",
            },
        });

        await provider("sarvam-m").doStream({
            prompt: TEST_PROMPT,
            headers: {
                "Custom-Request-Header": "request-header-value",
            },
        });

        expect(server.calls[0].requestHeaders).toMatchObject({
            authorization: "Bearer test-api-key",
            "content-type": "application/json",
            "custom-provider-header": "provider-header-value",
            "custom-request-header": "request-header-value",
        });
    });

    it("should send request body", async () => {
        prepareStreamResponse({ content: [] });

        const { request } = await model.doStream({
            prompt: TEST_PROMPT,
        });

        expect(request).toStrictEqual({
            body: '{"model":"sarvam-m","messages":[{"role":"user","content":"Hello"}],"stream":true}',
        });
    });
});
