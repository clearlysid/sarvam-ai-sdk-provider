import type { SpeechModelV3, SharedV3Warning } from "@ai-sdk/provider";
import {
    combineHeaders,
    createJsonResponseHandler,
    parseProviderOptions,
    postJsonToApi,
} from "@ai-sdk/provider-utils";
import type { SarvamConfig, SarvamLanguageCode } from "../shared/config";
import { sarvamFailedResponseHandler } from "../shared/error";
import {
    SarvamProviderOptionsSchema,
    SarvamSpeechSettings,
    SpeakerSchema,
    type SarvamSpeechModelId,
} from "./settings";

import { z } from "zod";

interface SarvamSpeechModelConfig extends SarvamConfig {
    _internal?: {
        currentDate?: () => Date;
    };
    speech?: SarvamSpeechSettings;
}

type SarvamSpeechCallOptions = {
    speaker: z.infer<typeof SpeakerSchema>;
};

export class SarvamSpeechModel implements SpeechModelV3 {
    readonly specificationVersion = "v3";

    get provider(): string {
        return this.config.provider;
    }

    constructor(
        readonly modelId: SarvamSpeechModelId,
        readonly languageCode: SarvamLanguageCode,
        private readonly config: SarvamSpeechModelConfig,
    ) {}

    private async getArgs({
        text,
        voice,
        outputFormat = "wav",
        providerOptions,
    }: Parameters<SpeechModelV3["doGenerate"]>[0]) {
        const warnings: SharedV3Warning[] = [];

        const sarvamOptions = await parseProviderOptions({
            provider: "sarvam",
            providerOptions: {
                sarvam: {
                    ...providerOptions?.sarvam,
                    ...this.config.speech,
                },
            },
            schema: SarvamProviderOptionsSchema,
        });

        const getSpeaker = (): SarvamSpeechCallOptions["speaker"] => {
            if (sarvamOptions?.speaker) return sarvamOptions.speaker;
            if (voice) {
                return SpeakerSchema.parse(voice);
            }

            switch (this.modelId) {
                case "bulbul:v2":
                    return "manisha";
                case "bulbul:v3":
                    return "anushka";
            }

            return "anushka";
        };

        const requestBody: Record<string, unknown> = {
            model: this.modelId,
            text: text,
            target_language_code: this.languageCode,
            speaker: getSpeaker(),
        };

        if (outputFormat) {
            if (
                ["mp3", "opus", "aac", "flac", "wav", "pcm"].includes(
                    outputFormat,
                )
            ) {
                requestBody.response_format = outputFormat;
            } else {
                warnings.push({
                    type: "unsupported",
                    feature: "outputFormat",
                    details: `Unsupported output format: ${outputFormat}. Using mp3 instead.`,
                });
            }
        }

        if (sarvamOptions) {
            const optionalKeys = [
                "pitch", "pace", "loudness", "speech_sample_rate",
                "enable_preprocessing", "output_audio_codec", "temperature",
            ] as const;
            for (const key of optionalKeys) {
                const value = sarvamOptions[key];
                if (value !== undefined) {
                    requestBody[key] = value;
                }
            }
        }

        return {
            requestBody,
            warnings,
        };
    }

    async doGenerate(
        options: Parameters<SpeechModelV3["doGenerate"]>[0],
    ): Promise<Awaited<ReturnType<SpeechModelV3["doGenerate"]>>> {
        const currentDate =
            this.config._internal?.currentDate?.() ?? new Date();
        const { requestBody, warnings } = await this.getArgs(options);

        const {
            value,
            responseHeaders,
            rawValue: rawResponse,
        } = await postJsonToApi({
            url: this.config.url({
                path: "/text-to-speech",
                modelId: this.modelId,
            }),
            headers: combineHeaders(this.config.headers(), options.headers),
            body: requestBody,
            failedResponseHandler: sarvamFailedResponseHandler,
            successfulResponseHandler: createJsonResponseHandler(
                z.object({
                    request_id: z.string(),
                    audios: z.array(z.string()),
                }),
            ),
            abortSignal: options.abortSignal,
            fetch: this.config.fetch,
        });

        const audio = value.audios[0];

        return {
            audio,
            warnings,
            request: {
                body: JSON.stringify(requestBody),
            },
            response: {
                timestamp: currentDate,
                modelId: this.modelId,
                headers: responseHeaders,
                body: rawResponse,
            },
        };
    }
}
