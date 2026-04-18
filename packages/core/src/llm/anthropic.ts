import { LLMAuthenticationError, LLMConfigurationError } from "./errors.js";
import type {
  LLMClient,
  LLMModel,
  LLMModelClient,
  LLMRequest,
  LLMResponse,
  LLMStreamEvent,
  LLMUsage,
} from "./types.js";

type AnthropicTextBlock = {
  type: "text";
  text: string;
};

type AnthropicUsage = {
  input_tokens?: number;
  output_tokens?: number;
};

type AnthropicMessageResponse = {
  content?: Array<AnthropicTextBlock | { type: string }>;
  stop_reason?: string | null;
  usage?: AnthropicUsage;
};

type AnthropicModelInfo = {
  id?: string;
  display_name?: string;
  created_at?: string;
};

type AnthropicModelListResponse = {
  data?: AnthropicModelInfo[];
};

type AnthropicStreamEventShape = {
  type: string;
  delta?: {
    type?: string;
    text?: string;
    stop_reason?: string | null;
  };
  usage?: AnthropicUsage;
  message?: {
    usage?: AnthropicUsage;
  };
};

type AnthropicMessagesAPI = {
  create(params: Record<string, unknown>): Promise<unknown>;
};

type AnthropicModelsAPI = {
  list(params?: Record<string, unknown>): Promise<unknown> | unknown;
};

type AnthropicSDKClient = {
  messages: AnthropicMessagesAPI;
  models: AnthropicModelsAPI;
};

type AnthropicClientFactory = (apiKey: string) => Promise<AnthropicSDKClient> | AnthropicSDKClient;

export type AnthropicLLMClientOptions = {
  apiKey?: string;
  apiKeyEnvVar?: string;
  defaultMaxTokens?: number;
  clientFactory?: AnthropicClientFactory;
};

const DEFAULT_ANTHROPIC_API_KEY_ENV = "ANTHROPIC_API_KEY";
export const DEFAULT_MAX_TOKENS = 4096;

export class AnthropicLLMClient implements LLMClient, LLMModelClient {
  private readonly apiKey: string | undefined;
  private readonly apiKeyEnvVar: string;
  private readonly defaultMaxTokens: number;
  private readonly clientFactory: AnthropicClientFactory;
  private clientPromise?: Promise<AnthropicSDKClient>;

  constructor(options: AnthropicLLMClientOptions = {}) {
    this.apiKey = options.apiKey;
    this.apiKeyEnvVar = options.apiKeyEnvVar ?? DEFAULT_ANTHROPIC_API_KEY_ENV;
    this.defaultMaxTokens = options.defaultMaxTokens ?? DEFAULT_MAX_TOKENS;
    this.clientFactory = options.clientFactory ?? createAnthropicSdkClient;
  }

  async sendMessage(request: LLMRequest): Promise<LLMResponse> {
    try {
      const client = await this.getClient();
      const response = (await client.messages.create(
        this.buildMessageParams(request),
      )) as AnthropicMessageResponse;

      return buildLLMResponse({
        content: extractTextContent(response.content),
        stopReason: response.stop_reason ?? null,
        usage: mapUsage(response.usage),
        raw: response,
      });
    } catch (error) {
      throw normalizeAnthropicError(error, this.apiKeyEnvVar);
    }
  }

  async listModels(): Promise<LLMModel[]> {
    try {
      const client = await this.getClient();
      const response = (await client.models.list()) as AnthropicModelListResponse;

      return (response.data ?? []).flatMap((model) => {
        if (!model.id) {
          return [];
        }

        return [
          {
            id: model.id,
            displayName: model.display_name ?? model.id,
            ...(model.created_at ? { createdAt: model.created_at } : {}),
            raw: model,
          },
        ];
      });
    } catch (error) {
      throw normalizeAnthropicError(error, this.apiKeyEnvVar);
    }
  }

  async *stream(request: LLMRequest): AsyncIterable<LLMStreamEvent> {
    try {
      const client = await this.getClient();
      const stream = (await client.messages.create({
        ...this.buildMessageParams(request),
        stream: true,
      })) as AsyncIterable<AnthropicStreamEventShape>;

      let content = "";
      let stopReason: string | null = null;
      let usage: LLMUsage | undefined;

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
          const text = event.delta.text ?? "";
          if (text.length > 0) {
            content += text;
            yield {
              type: "text-delta",
              text,
            };
          }
        }

        if (event.type === "message_delta") {
          stopReason = event.delta?.stop_reason ?? stopReason;
          usage = mapUsage(event.usage) ?? usage;
        }

        if (event.type === "message_start") {
          usage = mapUsage(event.message?.usage) ?? usage;
        }
      }

      yield {
        type: "response",
        response: buildLLMResponse({
          content,
          stopReason,
          usage,
          raw: {
            content,
            stopReason,
            usage,
          },
        }),
      };
    } catch (error) {
      throw normalizeAnthropicError(error, this.apiKeyEnvVar);
    }
  }

  private async getClient(): Promise<AnthropicSDKClient> {
    if (!this.clientPromise) {
      const apiKey = this.resolveApiKey();
      this.clientPromise = Promise.resolve(this.clientFactory(apiKey));
    }

    return this.clientPromise;
  }

  private resolveApiKey(): string {
    const apiKey = this.apiKey ?? process.env[this.apiKeyEnvVar];

    if (!apiKey) {
      throw new LLMConfigurationError(
        `${this.apiKeyEnvVar} is not set. Configure an Anthropic API key before using LLM features.`,
      );
    }

    return apiKey;
  }

  private buildMessageParams(request: LLMRequest): Record<string, unknown> {
    return {
      model: request.model,
      messages: request.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      system: request.systemPrompt,
      temperature: request.temperature,
      max_tokens: request.maxTokens ?? this.defaultMaxTokens,
    };
  }
}

function extractTextContent(content: AnthropicMessageResponse["content"]): string {
  if (!content) {
    return "";
  }

  return content.flatMap((block) => (isAnthropicTextBlock(block) ? [block.text] : [])).join("");
}

function mapUsage(usage?: AnthropicUsage): LLMUsage | undefined {
  if (!usage) {
    return undefined;
  }

  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
  };
}

function buildLLMResponse(params: {
  content: string;
  stopReason: string | null;
  usage: LLMUsage | undefined;
  raw: unknown;
}): LLMResponse {
  return {
    content: params.content,
    stopReason: params.stopReason,
    raw: params.raw,
    ...(params.usage ? { usage: params.usage } : {}),
  };
}

function normalizeAnthropicError(error: unknown, apiKeyEnvVar: string): Error {
  if (error instanceof LLMConfigurationError || error instanceof LLMAuthenticationError) {
    return error;
  }

  if (isAnthropicAuthError(error)) {
    return new LLMAuthenticationError(
      `Anthropic API authentication failed. Check ${apiKeyEnvVar} and account permissions.`,
    );
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error("Unknown Anthropic API error");
}

function isAnthropicTextBlock(
  block: AnthropicTextBlock | { type: string },
): block is AnthropicTextBlock {
  return block.type === "text";
}

function isAnthropicAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeStatus = "status" in error ? error.status : undefined;
  return maybeStatus === 401 || maybeStatus === 403;
}

async function createAnthropicSdkClient(apiKey: string): Promise<AnthropicSDKClient> {
  const loadModule = new Function("return import('@anthropic-ai/sdk')") as () => Promise<{
    default: new (options: { apiKey: string }) => AnthropicSDKClient;
  }>;
  const { default: Anthropic } = await loadModule();
  return new Anthropic({ apiKey });
}
