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
import { SarvamLanguageCodeSchema, SarvamScriptCodeSchema } from "./sarvam-config";
import { mapSarvamFinishReason } from "./map-sarvam-finish-reason";
import {
    sarvamFailedResponseHandler
} from "./sarvam-error";

type SarvamLidConfig = {
  provider: string;
  headers: () => Record<string, string | undefined>;
  url: (options: { path: string }) => string;
  fetch?: FetchFunction;
};

export class SarvamLidModel implements LanguageModelV3 {
  readonly specificationVersion = "v3";

  readonly supportedUrls: Record<string, RegExp[]> = {};

  readonly modelId: "unknown";

  private readonly config: SarvamLidConfig;

  constructor(
    config: SarvamLidConfig,
  ) {
    this.modelId = "unknown";
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

    const messages = convertToSarvamChatMessages(prompt);

    return {
      messages,
      args: {
        input: messages
          .filter((m) => m.role === "user")
          .map((m) => m.content)
          .join("\n"),
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
        path: "/text-lid",
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: args,
      failedResponseHandler: sarvamFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        sarvamLidResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const text = response.language_code ?? undefined;
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
    throw new Error("Language Identification feature doesn't support streaming yet");
  }
}

const sarvamLidResponseSchema = z.object({
  script_code: SarvamScriptCodeSchema.nullish(),
  language_code: SarvamLanguageCodeSchema.nullable(),
  request_id: z.string().nullish(),
});
