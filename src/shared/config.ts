import { FetchFunction } from "@ai-sdk/provider-utils";
import { z } from "zod";

export type SarvamConfig = {
    provider: string;
    url: (options: { modelId: string; path: string }) => string;
    headers: () => Record<string, string | undefined>;
    fetch?: FetchFunction;
    generateId?: () => string;
};

export type SarvamLanguageCode = z.infer<typeof SarvamLanguageCodeSchema>;

export const SarvamLanguageCodeSchema = z.enum([
    "hi-IN",
    "bn-IN",
    "kn-IN",
    "ml-IN",
    "mr-IN",
    "od-IN",
    "pa-IN",
    "ta-IN",
    "te-IN",
    "en-IN",
    "gu-IN",
    "as-IN",
    "ur-IN",
    "ne-IN",
    "kok-IN",
    "ks-IN",
    "sd-IN",
    "sa-IN",
    "sat-IN",
    "mni-IN",
    "brx-IN",
    "mai-IN",
    "doi-IN",
]);

export type SarvamScriptCode = z.infer<typeof SarvamScriptCodeSchema>

export const SarvamScriptCodeSchema = z.enum([
    "Latn",
    "Deva",
    "Beng",
    "Gujr",
    "Knda",
    "Mlym",
    "Orya",
    "Guru",
    "Taml",
    "Telu",
])
