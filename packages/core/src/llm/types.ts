export type LLMMessageRole = "user" | "assistant";

export type LLMMessage = {
  role: LLMMessageRole;
  content: string;
};

export type LLMRequest = {
  model: string;
  messages: LLMMessage[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
};

export type LLMUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type LLMResponse = {
  content: string;
  stopReason: string | null;
  usage?: LLMUsage;
  raw: unknown;
};

export type LLMStreamEvent =
  | {
      type: "text-delta";
      text: string;
    }
  | {
      type: "response";
      response: LLMResponse;
    };

export interface LLMClient {
  sendMessage(request: LLMRequest): Promise<LLMResponse>;
  stream(request: LLMRequest): AsyncIterable<LLMStreamEvent>;
}
