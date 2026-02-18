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
import { convertToSarvamChatMessages } from "../chat/convert-messages";
import { SarvamLanguageCodeSchema } from "../shared/config";
import { mapSarvamFinishReason } from "../shared/map-finish-reason";
import {
    sarvamFailedResponseHandler
} from "../shared/error";
import { SarvamTransliterateSettings } from "./settings";

type SarvamTransliterateConfig = {
  provider: string;
  headers: () => Record<string, string | undefined>;
  url: (options: { path: string }) => string;
  fetch?: FetchFunction;
};

export class SarvamTransliterateModel implements LanguageModelV3 {
  readonly specificationVersion = "v3";

  readonly supportedUrls: Record<string, RegExp[]> = {};

  readonly modelId: "unknown";
  readonly settings: SarvamTransliterateSettings;

  private readonly config: SarvamTransliterateConfig;

  constructor(
    settings: SarvamTransliterateSettings,
    config: SarvamTransliterateConfig,
  ) {
    this.modelId = "unknown";
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

    if (this.settings.from !== "auto") {
      if (this.settings.to !== "en-IN" && this.settings.from !== "en-IN")
        throw new Error(
          "Sarvam doesn't support Indic-Indic Transliteration yet",
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
        ...(this.settings.spoken_form
          ? {
              spoken_form: this.settings.spoken_form,
              spoken_form_numerals_language:
                this.settings.spoken_form_numerals_language ?? "english",
            }
          : {}),
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
        path: "/transliterate",
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: args,
      failedResponseHandler: sarvamFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        sarvamTransliterateResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const text = response.transliterated_text ?? undefined;
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
    throw new Error("Transliterate feature doesn't support streaming yet");
  }
}

const sarvamTransliterateResponseSchema = z.object({
  transliterated_text: z.string().nullish(),
  source_language_code: SarvamLanguageCodeSchema.nullable(),
  request_id: z.string().nullish(),
});
