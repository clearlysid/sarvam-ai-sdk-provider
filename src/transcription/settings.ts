import { z } from "zod";

export type SarvamTranscriptionModelId =
    | "saarika:v2.5"
    | "saaras:v3"
    | (string & {});

export type SarvamSpeechTranslationModelId =
    | "saaras:v2.5"
    | (string & {});

export const SarvamProviderOptionsSchema = z.object({
    with_timestamps: z.boolean().nullish().default(false),
    with_diarization: z.boolean().nullish().default(false),
    num_speakers: z.number().int().nullish(),
    mode: z.enum(["transcribe", "translate", "verbatim", "translit", "codemix"]).nullish(),
});

export type SarvamTranscriptionCallOptions = {
    with_timestamps?: boolean,
    /**
     * Enables speaker diarization, which identifies and separates different speakers in the audio.
     */
    with_diarization?: boolean,
    /**
     * Number of speakers to be detected in the audio.
     * Used when with_diarization is true.
     */
    num_speakers?: number,
    /**
     * Output mode for saaras:v3. Controls transcription behavior.
     * - transcribe: standard transcription
     * - translate: transcribe + translate to English
     * - verbatim: exact transcription without normalization
     * - translit: transliterated output
     * - codemix: code-mixed output
     */
    mode?: "transcribe" | "translate" | "verbatim" | "translit" | "codemix",
}
