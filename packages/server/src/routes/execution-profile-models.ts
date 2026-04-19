import {
  AnthropicLLMClient,
  LLMAuthenticationError,
  LLMConfigurationError,
} from "@prompt-reviewer/core";
import { z } from "zod";

export const listExecutionProfileModelsSchema = z.object({
  api_provider: z.enum(["anthropic", "openai"], {
    error: 'api_providerは "anthropic" または "openai" である必要があります',
  }),
  api_key: z.string().min(1, "api_keyは1文字以上必要です"),
});

export type ListExecutionProfileModelsBody = z.infer<typeof listExecutionProfileModelsSchema>;

export type ExecutionProfileModelListClient = {
  listModels(): Promise<unknown[]>;
};

export type ExecutionProfileModelClientFactory = (
  body: ListExecutionProfileModelsBody,
) => ExecutionProfileModelListClient | null;

export function defaultExecutionProfileModelClientFactory(
  body: ListExecutionProfileModelsBody,
): ExecutionProfileModelListClient | null {
  if (body.api_provider === "anthropic") {
    return new AnthropicLLMClient({ apiKey: body.api_key });
  }

  return null;
}

export async function fetchExecutionProfileModels(
  body: ListExecutionProfileModelsBody,
  modelClientFactory: ExecutionProfileModelClientFactory,
): Promise<{ status: number; body: { error?: string; models?: unknown[] } }> {
  const client = modelClientFactory(body);

  if (!client) {
    return {
      status: 501,
      body: { error: "Provider model listing is not implemented" },
    };
  }

  try {
    const models = await client.listModels();
    return {
      status: 200,
      body: { models },
    };
  } catch (error) {
    if (error instanceof LLMConfigurationError) {
      return {
        status: 400,
        body: { error: error.message },
      };
    }

    if (error instanceof LLMAuthenticationError) {
      return {
        status: 401,
        body: { error: error.message },
      };
    }

    return {
      status: 502,
      body: { error: "Failed to fetch models" },
    };
  }
}
