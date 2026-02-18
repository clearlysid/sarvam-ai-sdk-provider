import {
  LanguageModelV3Prompt,
  UnsupportedFunctionalityError,
} from "@ai-sdk/provider";
import { SarvamChatPrompt } from "./sarvam-api-types";

export function convertToSarvamChatMessages(
  prompt: LanguageModelV3Prompt,
  fakeToolSystemPrompt?: string,
): SarvamChatPrompt {
  const messages: SarvamChatPrompt = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case "system": {
        const contentData = fakeToolSystemPrompt
          ? `${content}\n\n${fakeToolSystemPrompt}`
          : content;
        messages.push({ role: "system", content: contentData });
        break;
      }

      case "user": {
        if (content.length === 1 && content[0].type === "text") {
          messages.push({ role: "user", content: content[0].text });
          break;
        }

        messages.push({
          role: "user",
          content: content.map((part) => {
            switch (part.type) {
              case "text": {
                return { type: "text", text: part.text };
              }
              case "file": {
                if (!part.mediaType.startsWith("image/")) {
                  throw new UnsupportedFunctionalityError({
                    functionality: "Non-image file content parts in user messages",
                  });
                }

                if (part.data instanceof URL) {
                  return {
                    type: "image_url",
                    image_url: {
                      url: part.data.toString(),
                    },
                  };
                }

                const base64 =
                  typeof part.data === "string"
                    ? part.data
                    : Buffer.from(part.data).toString("base64");

                return {
                  type: "image_url",
                  image_url: {
                    url: `data:${part.mediaType};base64,${base64}`,
                  },
                };
              }
            }
          }),
        });

        break;
      }

      case "assistant": {
        let text = "";
        const toolCalls: Array<{
          id: string;
          type: "function";
          function: { name: string; arguments: string };
        }> = [];

        for (const part of content) {
          switch (part.type) {
            case "text": {
              text += part.text;
              break;
            }
            case "tool-call": {
              toolCalls.push({
                id: part.toolCallId,
                type: "function",
                function: {
                  name: part.toolName,
                  arguments: JSON.stringify(part.input),
                },
              });
              break;
            }
          }
        }

        messages.push({
          role: "assistant",
          content: text,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        });

        break;
      }

      case "tool": {
        for (const toolResponse of content) {
          if (toolResponse.type !== "tool-result") continue;
          const output = toolResponse.output;
          let toolContent: string;
          switch (output.type) {
            case "text":
            case "error-text":
              toolContent = output.value;
              break;
            case "json":
            case "error-json":
              toolContent = JSON.stringify(output.value);
              break;
            case "execution-denied":
              toolContent = output.reason ?? "Tool execution denied";
              break;
            default:
              toolContent = JSON.stringify(output);
              break;
          }
          messages.push({
            role: "tool",
            tool_call_id: toolResponse.toolCallId,
            content: toolContent,
          });
        }
        break;
      }

      default: {
        const _exhaustiveCheck: never = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }

  return messages;
}
