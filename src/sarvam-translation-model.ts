import {
    LanguageModelV3,
    LanguageModelV3CallOptions,
    LanguageModelV3Content,
    LanguageModelV3Usage,
    SharedV3Warning,
} from "@ai-sdk/provider";
import {
    FetchFunction,
    combineHeaders,
    createJsonResponseHandler,
    postJsonToApi
} from "@ai-sdk/provider-utils";
import { z } from "zod";
import { convertToSarvamChatMessages } from "./convert-to-sarvam-chat-messages";
import { SarvamLanguageCodeSchema } from "./sarvam-config";
import { mapSarvamFinishReason } from "./map-sarvam-finish-reason";
import {
    sarvamFailedResponseHandler
} from "./sarvam-error";
import { SarvamTranslationSettings } from "./sarvam-translation-settings";

type SarvamTranslationConfig = {
  provider: string;
  headers: () => Record<string, string | undefined>;
  url: (options: { path: string }) => string;
  fetch?: FetchFunction;
};

export class SarvamTranslationModel implements LanguageModelV3 {
  readonly specificationVersion = "v3";

  readonly supportedUrls: Record<string, RegExp[]> = {};

  readonly modelId: NonNullable<SarvamTranslationSettings["model"]>
  readonly settings: SarvamTranslationSettings;

  private readonly config: SarvamTranslationConfig;

  constructor(
    settings: SarvamTranslationSettings,
    config: SarvamTranslationConfig,
  ) {
    this.modelId = settings.model ?? "mayura:v1";
    this.settings = settings;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  private getArgs({
    prompt,
  }: LanguageModelV3CallOptions & {
    stream: boolean;
  }) {
    const warnings: SharedV3Warning[] = [];

    if (this.settings.from === this.settings.to) {
        throw new Error(
        "Source and target languages code must be different.",
        );
    }

    if (this.modelId === "sarvam-translate:v1") {
        if ((this.settings.mode ?? "formal") !== "formal")
            throw new Error(
            "Sarvam 'sarvam-translate:v1' only support mode formal.",
            );
        if ((this.settings.from ?? "auto") === "auto")
            throw new Error(
            "Sarvam 'sarvam-translate:v1' requires source language code.",
            );
    }

    const messages = convertToSarvamChatMessages(prompt);

    return {
      messages,
      args: {
        input: messages
          .filter((m) => m.role === "user")
          .map((m) => m.content)
          .join("\n"),
        source_language_code: this.settings.from ?? "auto",
        target_language_code: this.settings.to,
        numerals_format: this.settings.numerals_format ?? "international",
        enable_preprocessing: this.settings.enable_preprocessing ?? false,
        output_script: this.settings.output_script ?? null,
        speaker_gender: this.settings.speaker_gender ?? "Male",
        mode: this.settings.mode ?? "formal",
        model: this.modelId,
      },
      warnings,
    };
  }

  async doGenerate(
    options: LanguageModelV3CallOptions,
  ) {
    const { args, warnings } = this.getArgs({
      ...options,
      stream: false,
    });

    const body = JSON.stringify(args);

    const {
      responseHeaders,
      value: response,
    } = await postJsonToApi({
      url: this.config.url({
        path: "/translate",
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: args,
      failedResponseHandler: sarvamFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        sarvamTranslationResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const text = response.translated_text ?? undefined;
    const content: LanguageModelV3Content[] = [];
    if (text) {
      content.push({ type: "text", text });
    }

    return {
      content,
      finishReason: mapSarvamFinishReason(undefined),
      usage: {
        inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: undefined, text: undefined, reasoning: undefined },
      } satisfies LanguageModelV3Usage,
      request: { body },
      response: {
        headers: responseHeaders,
      },
      warnings,
    };
  }

  async doStream(
    _options: LanguageModelV3CallOptions,
  ): Promise<never> {
    throw new Error("Translation feature doesn't support streaming yet");
  }
}

const sarvamTranslationResponseSchema = z.object({
  translated_text: z.string().nullish(),
  source_language_code: SarvamLanguageCodeSchema.nullable(),
  request_id: z.string().nullish(),
});
