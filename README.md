# AI SDK - Sarvam Provider

The **[Sarvam provider](https://ai-sdk.dev/providers/community-providers/sarvam)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for the [Sarvam AI](https://sarvam.ai) chat, text-to-speech, speech-to-text, translation, transliteration, and language identification APIs.

## Setup

The Sarvam provider is available in the `sarvam-ai-sdk` module. You can install it with

```bash
npm i sarvam-ai-sdk
```

## Provider Instance

You can import the default provider instance `sarvam` from `sarvam-ai-sdk`:

```ts
import { sarvam } from "sarvam-ai-sdk";
```

Set your API key from the **[Sarvam Dashboard](https://dashboard.sarvam.ai/)**:

```bash
SARVAM_API_KEY="your_api_key"
```

## Supported Models

| API | Model IDs | Method |
|-----|-----------|--------|
| Chat | `sarvam-m` | `sarvam("sarvam-m")` |
| Text-to-Speech | `bulbul:v2`, `bulbul:v3` | `sarvam.speech("bulbul:v3", "hi-IN")` |
| Speech-to-Text | `saarika:v2.5`, `saaras:v3` | `sarvam.transcription("saarika:v2.5", "hi-IN")` |
| Speech Translation | `saaras:v2.5` | `sarvam.speechTranslation("saaras:v2.5")` |
| Translation | `mayura:v1`, `sarvam-translate:v1` | `sarvam.translation({ from: "hi-IN", to: "en-IN" })` |
| Transliteration | - | `sarvam.transliterate({ from: "en-IN", to: "hi-IN" })` |
| Language ID | - | `sarvam.languageIdentification()` |

## Example

```ts
import { sarvam } from "sarvam-ai-sdk";
import { generateText } from "ai";

const { text } = await generateText({
  model: sarvam("sarvam-m"),
  prompt: "Translate this to Malayalam: 'Keep cooking, guys'",
});

console.log(text);
```

## Documentation

Please check out the **[Sarvam provider documentation](https://ai-sdk.dev/providers/community-providers/sarvam)** and **[Sarvam API documentation](https://docs.sarvam.ai)** for more information.
