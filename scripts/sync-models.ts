/**
 * Compares model IDs, voices, and languages in this provider
 * against the official sarvamai SDK's type declarations.
 *
 * Run: npx tsx scripts/sync-models.ts
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";

const sdkTypesDir = resolve(
  dirname(require.resolve("sarvamai/package.json")),
  "dist/cjs/api/types",
);

function extractEnumValues(filename: string): string[] {
  const filepath = resolve(sdkTypesDir, filename);
  try {
    const content = readFileSync(filepath, "utf-8");
    const matches = content.matchAll(/readonly \w+: "([^"]+)"/g);
    return [...matches].map((m) => m[1]);
  } catch {
    console.error(`  Could not read ${filename}`);
    return [];
  }
}

function extractStringType(filename: string): string[] {
  const filepath = resolve(sdkTypesDir, filename);
  try {
    const content = readFileSync(filepath, "utf-8");
    const matches = content.matchAll(/"([^"]+)"/g);
    return [...matches].map((m) => m[1]);
  } catch {
    console.error(`  Could not read ${filename}`);
    return [];
  }
}

function diff(label: string, sdk: string[], provider: string[]) {
  const sdkSet = new Set(sdk);
  const provSet = new Set(provider);
  const missing = sdk.filter((v) => !provSet.has(v));
  const extra = provider.filter((v) => !sdkSet.has(v));

  if (missing.length === 0 && extra.length === 0) {
    console.log(`  ${label}: in sync`);
    return;
  }
  if (missing.length > 0) {
    console.log(`  ${label} — missing from provider: ${missing.join(", ")}`);
  }
  if (extra.length > 0) {
    console.log(`  ${label} — extra in provider (not in SDK): ${extra.join(", ")}`);
  }
}

console.log("Sarvam SDK vs Provider sync check\n");

// TTS
console.log("Text-to-Speech:");
diff("Models", extractEnumValues("TextToSpeechModel.d.ts"), ["bulbul:v2", "bulbul:v3"]);
diff("Speakers", extractEnumValues("TextToSpeechSpeaker.d.ts"), [
  "anushka", "abhilash", "manisha", "vidya", "arya", "karun", "hitesh",
  "aditya", "ritu", "priya", "neha", "rahul", "pooja", "rohan", "simran",
  "kavya", "amit", "dev", "ishita", "shreya", "ratan", "varun", "manan",
  "sumit", "roopa", "kabir", "aayan", "shubh", "ashutosh", "advait",
  "amelia", "sophia", "anand", "tanya", "tarun", "sunny", "mani", "gokul",
  "vijay", "shruti", "suhani", "mohit", "kavitha", "rehan", "soham", "rupali",
]);

// STT
console.log("\nSpeech-to-Text:");
diff("Models", extractEnumValues("SpeechToTextModel.d.ts"), ["saarika:v2.5", "saaras:v3"]);

// STT Translate
console.log("\nSpeech-to-Text Translate:");
diff("Models", extractStringType("SpeechToTextTranslateModel.d.ts"), ["saaras:v2.5"]);

// Translation
console.log("\nTranslation:");
diff("Models", extractEnumValues("TranslateModel.d.ts"), ["mayura:v1", "sarvam-translate:v1"]);

// Chat
console.log("\nChat:");
diff("Models", extractStringType("SarvamModelIds.d.ts"), ["sarvam-m"]);

// Languages
console.log("\nLanguages (STT):");
diff(
  "STT Languages",
  extractEnumValues("SpeechToTextLanguage.d.ts"),
  [
    "unknown", "hi-IN", "bn-IN", "kn-IN", "ml-IN", "mr-IN", "od-IN",
    "pa-IN", "ta-IN", "te-IN", "en-IN", "gu-IN", "as-IN", "ur-IN",
    "ne-IN", "kok-IN", "ks-IN", "sd-IN", "sa-IN", "sat-IN", "mni-IN",
    "brx-IN", "mai-IN", "doi-IN",
  ],
);

console.log("\nDone.");
