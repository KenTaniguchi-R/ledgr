import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

export type AiProvider = "openai" | "anthropic" | "google" | "openrouter" | "custom";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export interface ProviderConfig {
  aiProvider: AiProvider;
  aiModel: string;
  aiApiKey: string;
  aiBaseUrl?: string;
  confidenceThreshold: number;
  toolCalling: boolean;
}

export function createUserModel(config: ProviderConfig): LanguageModel {
  switch (config.aiProvider) {
    case "openai": {
      const provider = createOpenAI({ apiKey: config.aiApiKey });
      return provider(config.aiModel);
    }
    case "anthropic": {
      const provider = createAnthropic({ apiKey: config.aiApiKey });
      return provider(config.aiModel);
    }
    case "google": {
      const provider = createGoogleGenerativeAI({ apiKey: config.aiApiKey });
      return provider(config.aiModel);
    }
    case "openrouter": {
      // OpenRouter speaks the OpenAI-compatible API, but unlike an arbitrary
      // `custom` endpoint it honours json_schema response formats — without
      // supportsStructuredOutputs the adapter drops the schema and sends a
      // bare json_object, leaving categorization to guess the shape.
      const provider = createOpenAICompatible({
        baseURL: config.aiBaseUrl ?? OPENROUTER_BASE_URL,
        apiKey: config.aiApiKey,
        name: "openrouter",
        supportsStructuredOutputs: true,
      });
      return provider(config.aiModel);
    }
    case "custom": {
      if (!config.aiBaseUrl) {
        throw new Error("aiBaseUrl is required for custom provider");
      }
      const provider = createOpenAICompatible({
        baseURL: config.aiBaseUrl,
        apiKey: config.aiApiKey || "none",
        name: "custom",
      });
      return provider(config.aiModel);
    }
  }
}
