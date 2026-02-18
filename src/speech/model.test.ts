import { createTestServer } from "@ai-sdk/test-server/with-vitest";
import { SarvamSpeechModel } from "./model";
import { createSarvam } from "../provider";

const provider = createSarvam({ apiKey: "test-api-key" });
const model = provider.speech("bulbul:v2", "hi-IN");

const server = createTestServer({
    "https://api.sarvam.ai/text-to-speech": {},
});

describe("doGenerate", () => {
    function prepareJsonResponse({
        headers,
        audios = ["base64audiodata"],
        request_id = "req-123",
    }: {
        headers?: Record<string, string>;
        audios?: string[];
        request_id?: string;
    } = {}) {
        server.urls["https://api.sarvam.ai/text-to-speech"].response = {
            type: "json-value",
            headers: {
                "content-type": "application/json",
                ...headers,
            },
            body: {
                request_id,
                audios,
            },
        };
    }

    it("should pass the model, text, and language code", async () => {
        prepareJsonResponse();

        await model.doGenerate({
            text: "Hello from the AI SDK!",
        });

        expect(await server.calls[0].requestBodyJson).toMatchObject({
            model: "bulbul:v2",
            text: "Hello from the AI SDK!",
            target_language_code: "hi-IN",
        });
    });

    it("should pass headers", async () => {
        prepareJsonResponse();

        const provider = createSarvam({
            apiKey: "test-api-key",
            headers: {
                "Custom-Provider-Header": "provider-header-value",
            },
        });

        await provider.speech("bulbul:v2", "hi-IN").doGenerate({
            text: "Hello from the AI SDK!",
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

    it("should return audio data from response", async () => {
        prepareJsonResponse({ audios: ["dGVzdGF1ZGlv"] });

        const result = await model.doGenerate({
            text: "Hello from the AI SDK!",
        });

        expect(result.audio).toBe("dGVzdGF1ZGlv");
    });

    it("should include response data with timestamp, modelId and headers", async () => {
        prepareJsonResponse({
            headers: {
                "x-request-id": "test-request-id",
                "x-ratelimit-remaining": "123",
            },
        });

        const testDate = new Date(0);
        const customModel = new SarvamSpeechModel("bulbul:v2", "hi-IN", {
            provider: "test-provider",
            url: () => "https://api.sarvam.ai/text-to-speech",
            headers: () => ({}),
            _internal: {
                currentDate: () => testDate,
            },
        });

        const result = await customModel.doGenerate({
            text: "Hello from the AI SDK!",
        });

        expect(result.response).toMatchObject({
            timestamp: testDate,
            modelId: "bulbul:v2",
        });
        expect(result.response.headers).toMatchObject({
            "x-request-id": "test-request-id",
            "x-ratelimit-remaining": "123",
        });
    });

    it("should pass output format", async () => {
        prepareJsonResponse();

        await model.doGenerate({
            text: "Hello from the AI SDK!",
            outputFormat: "wav",
        });

        expect(await server.calls[0].requestBodyJson).toMatchObject({
            response_format: "wav",
        });
    });

    it("should include warnings if any are generated", async () => {
        prepareJsonResponse();

        const result = await model.doGenerate({
            text: "Hello from the AI SDK!",
        });

        expect(result.warnings).toEqual([]);
    });
});
