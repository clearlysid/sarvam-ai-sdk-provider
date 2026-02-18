import { z } from "zod";

export type SarvamSpeechModelId = "bulbul:v2" | "bulbul:v3" | (string & {});

export type SarvamSpeechVoices = z.infer<typeof SpeakerSchema>;

export const SpeakerSchema = z
    .enum([
        "anushka",
        "abhilash",
        "manisha",
        "vidya",
        "arya",
        "karun",
        "hitesh",
        "aditya",
        "ritu",
        "priya",
        "neha",
        "rahul",
        "pooja",
        "rohan",
        "simran",
        "kavya",
        "amit",
        "dev",
        "ishita",
        "shreya",
        "ratan",
        "varun",
        "manan",
        "sumit",
        "roopa",
        "kabir",
        "aayan",
        "shubh",
        "ashutosh",
        "advait",
        "amelia",
        "sophia",
        "anand",
        "tanya",
        "tarun",
        "sunny",
        "mani",
        "gokul",
        "vijay",
        "shruti",
        "suhani",
        "mohit",
        "kavitha",
        "rehan",
        "soham",
        "rupali",
    ])
    .default("anushka");

// https://docs.sarvam.ai/api-reference-docs/text-to-speech/convert
export const SarvamProviderOptionsSchema = z
    .object({
        speaker: SpeakerSchema,
        pitch: z.number().min(-0.75).max(0.75).default(0.0),
        pace: z.number().min(0.5).max(2.0).default(1.0),
        loudness: z.number().min(0.3).max(3.0).default(1.0),
        speech_sample_rate: z.number().default(22050),
        enable_preprocessing: z.boolean().default(false),
        output_audio_codec: z.enum([
            "mp3", "linear16", "mulaw", "alaw", "opus", "flac", "aac", "wav",
        ]).optional(),
        temperature: z.number().optional(),
    })
    .partial();

export type SarvamSpeechSettings = {
    speaker?: SarvamSpeechVoices;

    /**
     * Controls the pitch of the audio. Only supported for bulbul:v2.
     * @default 0.0
     */
    pitch?: number;

    /**
     * Controls the speed of the audio.
     * @default 1.0
     */
    pace?: number;

    /**
     * Controls the loudness of the audio. Only supported for bulbul:v2.
     * @default 1.0
     */
    loudness?: number;

    /**
     * Specifies the sample rate of the output audio.
     * bulbul:v2: 8000, 16000, 22050, 24000
     * bulbul:v3: 8000, 16000, 22050, 24000, 32000, 44100, 48000
     * @default 22050
     */
    speech_sample_rate?: number;

    /**
     * Enables preprocessing for normalization of English words and numeric entities.
     * @default false
     */
    enable_preprocessing?: boolean;

    /**
     * Output audio codec.
     */
    output_audio_codec?: "mp3" | "linear16" | "mulaw" | "alaw" | "opus" | "flac" | "aac" | "wav";

    /**
     * Temperature for bulbul:v3.
     */
    temperature?: number;
};
