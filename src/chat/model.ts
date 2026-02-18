import {
  InvalidResponseDataError,
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3FinishReason,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
  SharedV3Warning,
} from "@ai-sdk/provider";
import {
  FetchFunction,
  ParseResult,
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonResponseHandler,
  generateId,
  isParsableJson,
  parseProviderOptions,
  postJsonToApi,
} from "@ai-sdk/provider-utils";
import { z } from "zod";
import { convertToSarvamChatMessages } from "./convert-messages";
import { getResponseMetadata } from "../shared/get-response-metadata";
import { mapSarvamFinishReason } from "../shared/map-finish-reason";
import { SarvamChatModelId, SarvamChatSettings } from "./settings";
import {
  sarvamErrorDataSchema,
  sarvamFailedResponseHandler,
} from "../shared/error";
import {
  extractToolCallData,
  parseJSON,
  prepareTools,
  simulateJsonSchema,
  simulateToolCalling,
} from "./prepare-tools";

type SarvamChatConfig = {
  provider: string;
  headers: () => Record<string, string | undefined>;
  url: (options: { modelId: string; path: string }) => string;
  fetch?: FetchFunction;
};

export class SarvamChatLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = "v3";

  readonly supportedUrls: Record<string, RegExp[]> = {};

  readonly modelId: SarvamChatModelId;
  readonly settings: SarvamChatSettings;

  private readonly config: SarvamChatConfig;

  constructor(
    modelId: SarvamChatModelId,
    settings: SarvamChatSettings,
    config: SarvamChatConfig,
  ) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }

  get provider(): string {
    return this.config.provider;
  }

  private async getArgs(
    options: LanguageModelV3CallOptions & { stream: boolean },
  ) {
    const {
      prompt,
      maxOutputTokens,
      temperature,
      topP,
      topK,
      frequencyPenalty,
      presencePenalty,
      stopSequences,
      responseFormat,
      seed,
      tools,
      toolChoice,
      providerOptions,
      stream,
    } = options;

    const simulate = this.settings.simulate;
    const warnings: SharedV3Warning[] = [];

    if (stream) {
      warnings.push({
        type: "other",
        message: "Streaming is still experimental for Sarvam",
      });
    }

    if (topK != null) {
      warnings.push({
        type: "unsupported",
        feature: "topK",
      });
    }

    if (
      responseFormat != null &&
      responseFormat.type === "json" &&
      responseFormat.schema != null
    ) {
      warnings.push({
        type: "unsupported",
        feature: "responseFormat",
        details: "JSON response format schema is not supported",
      });
    }

    const sarvamOptions = await parseProviderOptions({
      provider: "sarvam",
      providerOptions,
      schema: z.object({
        reasoningFormat: z.enum(["parsed", "raw", "hidden"]).nullish(),
      }),
    });

    const { tools: sarvamTools, tool_choice, toolWarnings } = prepareTools({
      tools,
      toolChoice,
    });

    const extraSystemPrompt =
      sarvamTools && simulate === "tool-calling"
        ? simulateToolCalling(sarvamTools)
        : responseFormat?.type === "json" && simulate === "json-object"
          ? simulateJsonSchema()
          : undefined;

    const body = {
      model: this.modelId,
      messages: convertToSarvamChatMessages(prompt, extraSystemPrompt),
      user: this.settings.user,
      parallel_tool_calls: this.settings.parallelToolCalls,
      max_tokens: maxOutputTokens,
      temperature,
      top_p: topP,
      frequency_penalty: frequencyPenalty,
      presence_penalty: presencePenalty,
      stop: stopSequences,
      seed,
      response_format:
        stream === false && responseFormat?.type === "json"
          ? { type: "json_object" }
          : undefined,
      reasoning_format: sarvamOptions?.reasoningFormat,
      tools: sarvamTools,
      tool_choice,
    };

    return {
      args: body,
      warnings: [...warnings, ...toolWarnings],
    };
  }

  async doGenerate(
    options: LanguageModelV3CallOptions,
  ) {
    const { args, warnings } = await this.getArgs({
      ...options,
      stream: false,
    });

    const body = JSON.stringify(args);

    const {
      responseHeaders,
      value: response,
    } = await postJsonToApi({
      url: this.config.url({
        path: "/chat/completions",
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: args,
      failedResponseHandler: sarvamFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        sarvamChatResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const choice = response.choices[0];

    let text = choice.message.content ?? undefined;
    const content: LanguageModelV3Content[] = [];

    if (choice.message.reasoning) {
      content.push({ type: "reasoning", text: choice.message.reasoning });
    }

    let toolCalls = choice.message.tool_calls?.map((toolCall) => ({
      type: "tool-call" as const,
      toolCallId: toolCall.id ?? generateId(),
      toolName: toolCall.function.name,
      input: toolCall.function.arguments!,
    }));

    // simulate tool calling through prompt engineering
    if (this.settings.simulate === "tool-calling") {
        if (text && text.length !== 0) {
          const jsonObject = parseJSON(text);
          if (jsonObject) {
            const newTool = extractToolCallData(jsonObject);
            if (newTool) {
              toolCalls = [{ type: "tool-call", ...newTool }];
              text = undefined;
            }
          }
        }
    }

    // simulate JSON object generation through prompt engineering
    if (this.settings.simulate === "json-object") {
      if (text && text.length !== 0) {
        const jsonObject = parseJSON(text);
        if (jsonObject) {
            text = JSON.stringify(jsonObject);
        }
      }
    }

    if (text) {
      content.push({ type: "text", text });
    }

    if (toolCalls) {
      for (const tc of toolCalls) {
        content.push(tc);
      }
    }

    return {
      content,
      finishReason: mapSarvamFinishReason(choice.finish_reason),
      usage: {
        inputTokens: {
          total: response.usage?.prompt_tokens ?? undefined,
          noCache: undefined,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: response.usage?.completion_tokens ?? undefined,
          text: undefined,
          reasoning: undefined,
        },
      } satisfies LanguageModelV3Usage,
      request: { body },
      response: {
        ...getResponseMetadata(response),
        headers: responseHeaders,
      },
      warnings,
    };
  }

  async doStream(
    options: LanguageModelV3CallOptions,
  ) {
    const { args, warnings } = await this.getArgs({ ...options, stream: true });

    const body = JSON.stringify({ ...args, stream: true });

    const { responseHeaders, value: response } = await postJsonToApi({
      url: this.config.url({
        path: "/chat/completions",
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: {
        ...args,
        stream: true,
      },
      failedResponseHandler: sarvamFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        sarvamChatChunkSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const toolCalls: Array<{
      id: string;
      type: "function";
      function: {
        name: string;
        arguments: string;
      };
      hasFinished: boolean;
    }> = [];

    let finishReason: LanguageModelV3FinishReason = { unified: "other", raw: undefined };
    let usage: LanguageModelV3Usage = {
      inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: undefined, text: undefined, reasoning: undefined },
    };
    let isFirstChunk = true;
    let textStarted = false;
    let reasoningStarted = false;
    const textId = generateId();
    const reasoningId = generateId();

    return {
      stream: response.pipeThrough(
        new TransformStream<
          ParseResult<z.infer<typeof sarvamChatChunkSchema>>,
          LanguageModelV3StreamPart
        >({
          transform(chunk, controller) {
            if (!chunk.success) {
              finishReason = { unified: "error", raw: undefined };
              controller.enqueue({
                type: "error",
                error: chunk.error,
              });
              return;
            }

            const value = chunk.value;

            if ("error" in value) {
              finishReason = { unified: "error", raw: undefined };
              controller.enqueue({
                type: "error",
                error: value.error,
              });
              return;
            }

            if (isFirstChunk) {
              isFirstChunk = false;

              controller.enqueue({
                type: "stream-start",
                warnings,
              });

              controller.enqueue({
                type: "response-metadata",
                ...getResponseMetadata(value),
              });
            }

            if (value.x_sarvam?.usage != null) {
              usage = {
                inputTokens: {
                  total: value.x_sarvam.usage.prompt_tokens ?? undefined,
                  noCache: undefined,
                  cacheRead: undefined,
                  cacheWrite: undefined,
                },
                outputTokens: {
                  total: value.x_sarvam.usage.completion_tokens ?? undefined,
                  text: undefined,
                  reasoning: undefined,
                },
              };
            }

            const choice = value.choices[0];

            if (choice?.finish_reason != null) {
              finishReason = mapSarvamFinishReason(choice.finish_reason);
            }

            if (choice?.delta == null) {
              return;
            }

            const delta = choice.delta;

            if (delta.reasoning != null && delta.reasoning.length > 0) {
              if (!reasoningStarted) {
                reasoningStarted = true;
                controller.enqueue({ type: "reasoning-start", id: reasoningId });
              }
              controller.enqueue({
                type: "reasoning-delta",
                id: reasoningId,
                delta: delta.reasoning,
              });
            }

            if (delta.content != null && delta.content.length > 0) {
              if (!textStarted) {
                textStarted = true;
                controller.enqueue({ type: "text-start", id: textId });
              }
              controller.enqueue({
                type: "text-delta",
                id: textId,
                delta: delta.content,
              });
            }

            if (delta.tool_calls != null) {
              for (const toolCallDelta of delta.tool_calls) {
                const index = toolCallDelta.index;

                if (toolCalls[index] == null) {
                  if (toolCallDelta.type !== "function") {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'function' type.`,
                    });
                  }

                  if (toolCallDelta.id == null) {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'id' to be a string.`,
                    });
                  }

                  if (toolCallDelta.function?.name == null) {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'function.name' to be a string.`,
                    });
                  }

                  toolCalls[index] = {
                    id: toolCallDelta.id,
                    type: "function",
                    function: {
                      name: toolCallDelta.function.name,
                      arguments: toolCallDelta.function.arguments ?? "",
                    },
                    hasFinished: false,
                  };

                  const toolCall = toolCalls[index];

                  controller.enqueue({
                    type: "tool-input-start",
                    id: toolCall.id,
                    toolName: toolCall.function.name,
                  });

                  if (toolCall.function.arguments.length > 0) {
                    controller.enqueue({
                      type: "tool-input-delta",
                      id: toolCall.id,
                      delta: toolCall.function.arguments,
                    });
                  }

                  if (isParsableJson(toolCall.function.arguments)) {
                    controller.enqueue({
                      type: "tool-input-end",
                      id: toolCall.id,
                    });
                    controller.enqueue({
                      type: "tool-call",
                      toolCallId: toolCall.id,
                      toolName: toolCall.function.name,
                      input: toolCall.function.arguments,
                    });
                    toolCall.hasFinished = true;
                  }

                  continue;
                }

                const toolCall = toolCalls[index];

                if (toolCall.hasFinished) {
                  continue;
                }

                if (toolCallDelta.function?.arguments != null) {
                  toolCall.function!.arguments +=
                    toolCallDelta.function?.arguments ?? "";
                }

                controller.enqueue({
                  type: "tool-input-delta",
                  id: toolCall.id,
                  delta: toolCallDelta.function.arguments ?? "",
                });

                if (
                  toolCall.function?.name != null &&
                  toolCall.function?.arguments != null &&
                  isParsableJson(toolCall.function.arguments)
                ) {
                  controller.enqueue({
                    type: "tool-input-end",
                    id: toolCall.id,
                  });
                  controller.enqueue({
                    type: "tool-call",
                    toolCallId: toolCall.id,
                    toolName: toolCall.function.name,
                    input: toolCall.function.arguments,
                  });
                  toolCall.hasFinished = true;
                }
              }
            }
          },

          flush(controller) {
            if (reasoningStarted) {
              controller.enqueue({ type: "reasoning-end", id: reasoningId });
            }
            if (textStarted) {
              controller.enqueue({ type: "text-end", id: textId });
            }

            controller.enqueue({
              type: "finish",
              finishReason,
              usage,
            });
          },
        }),
      ),
      request: { body },
      response: { headers: responseHeaders },
    };
  }
}

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const sarvamChatResponseSchema = z.object({
  id: z.string().nullish(),
  created: z.number().nullish(),
  model: z.string().nullish(),
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string().nullish(),
        reasoning: z.string().nullish(),
        tool_calls: z
          .array(
            z.object({
              id: z.string().nullish(),
              type: z.literal("function"),
              function: z.object({
                name: z.string(),
                arguments: z.string(),
              }),
            }),
          )
          .nullish(),
      }),
      index: z.number(),
      finish_reason: z.string().nullish(),
    }),
  ),
  usage: z
    .object({
      prompt_tokens: z.number().nullish(),
      completion_tokens: z.number().nullish(),
    })
    .nullish(),
});

// limited version of the schema, focussed on what is needed for the implementation
// this approach limits breakages when the API changes and increases efficiency
const sarvamChatChunkSchema = z.union([
  z.object({
    id: z.string().nullish(),
    created: z.number().nullish(),
    model: z.string().nullish(),
    choices: z.array(
      z.object({
        delta: z
          .object({
            content: z.string().nullish(),
            reasoning: z.string().nullish(),
            tool_calls: z
              .array(
                z.object({
                  index: z.number(),
                  id: z.string().nullish(),
                  type: z.literal("function").optional(),
                  function: z.object({
                    name: z.string().nullish(),
                    arguments: z.string().nullish(),
                  }),
                }),
              )
              .nullish(),
          })
          .nullish(),
        finish_reason: z.string().nullable().optional(),
        index: z.number(),
      }),
    ),
    x_sarvam: z
      .object({
        usage: z
          .object({
            prompt_tokens: z.number().nullish(),
            completion_tokens: z.number().nullish(),
          })
          .nullish(),
      })
      .nullish(),
  }),
  sarvamErrorDataSchema,
]);
