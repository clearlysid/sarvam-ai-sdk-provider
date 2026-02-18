import { createTestServer } from "@ai-sdk/test-server/with-vitest";
import { createSarvam } from "./sarvam-provider";

const provider = createSarvam({ apiKey: "test-api-key" });
const model = provider.transcription("saarika:v2", "hi-IN");

const server = createTestServer({
    "https://api.sarvam.ai/speech-to-text": {},
});

describe("doGenerate", () => {
    it("should extract the transcript text", async () => {
        server.urls["https://api.sarvam.ai/speech-to-text"].response = {
            type: "json-value",
            body: {
                transcript: "hello",
                request_id: "req-123",
                language_code: "hi-IN",
            },
        };

        const result = await model.doGenerate({
            audio: new Uint8Array([0, 1, 2, 3]),
            mediaType: "audio/mp3",
        });

        expect(result.text.toLowerCase()).toBe("hello");
    });
});
