import { describe, expect, it, vi } from "vitest";
import { AnthropicLLMClient, DEFAULT_MAX_TOKENS } from "./anthropic.js";
import { LLMAuthenticationError, LLMConfigurationError } from "./errors.js";

describe("AnthropicLLMClient", () => {
  it("sendMessage で Messages API を呼び出して応答を正規化する", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "こんにちは" }],
      stop_reason: "end_turn",
      usage: {
        input_tokens: 12,
        output_tokens: 34,
      },
    });

    const client = new AnthropicLLMClient({
      apiKey: "test-key",
      clientFactory: async () => ({
        messages: {
          create,
        },
        models: {
          list: vi.fn(),
        },
      }),
    });

    const response = await client.sendMessage({
      model: "claude-sonnet-4-5",
      systemPrompt: "You are helpful",
      temperature: 0.4,
      maxTokens: 256,
      messages: [{ role: "user", content: "こんにちは" }],
    });

    expect(create).toHaveBeenCalledWith({
      model: "claude-sonnet-4-5",
      system: "You are helpful",
      temperature: 0.4,
      max_tokens: 256,
      messages: [{ role: "user", content: "こんにちは" }],
    });
    expect(response).toEqual({
      content: "こんにちは",
      stopReason: "end_turn",
      usage: {
        inputTokens: 12,
        outputTokens: 34,
      },
      raw: {
        content: [{ type: "text", text: "こんにちは" }],
        stop_reason: "end_turn",
        usage: {
          input_tokens: 12,
          output_tokens: 34,
        },
      },
    });
  });

  it("stream で text delta と最終 response を返す", async () => {
    async function* createStream() {
      yield {
        type: "message_start",
        message: {
          usage: {
            input_tokens: 9,
            output_tokens: 0,
          },
        },
      };
      yield {
        type: "content_block_delta",
        delta: {
          type: "text_delta",
          text: "こん",
        },
      };
      yield {
        type: "content_block_delta",
        delta: {
          type: "text_delta",
          text: "にちは",
        },
      };
      yield {
        type: "message_delta",
        delta: {
          stop_reason: "end_turn",
        },
        usage: {
          input_tokens: 9,
          output_tokens: 5,
        },
      };
    }

    const create = vi.fn().mockResolvedValue(createStream());
    const client = new AnthropicLLMClient({
      apiKey: "test-key",
      clientFactory: async () => ({
        messages: {
          create,
        },
        models: {
          list: vi.fn(),
        },
      }),
    });

    const events = [];
    for await (const event of client.stream({
      model: "claude-sonnet-4-5",
      messages: [{ role: "user", content: "こんにちは" }],
    })) {
      events.push(event);
    }

    expect(create).toHaveBeenCalledWith({
      model: "claude-sonnet-4-5",
      system: undefined,
      temperature: undefined,
      max_tokens: DEFAULT_MAX_TOKENS,
      messages: [{ role: "user", content: "こんにちは" }],
      stream: true,
    });
    expect(events).toEqual([
      {
        type: "text-delta",
        text: "こん",
      },
      {
        type: "text-delta",
        text: "にちは",
      },
      {
        type: "response",
        response: {
          content: "こんにちは",
          stopReason: "end_turn",
          usage: {
            inputTokens: 9,
            outputTokens: 5,
          },
          raw: {
            content: "こんにちは",
            stopReason: "end_turn",
            usage: {
              inputTokens: 9,
              outputTokens: 5,
            },
          },
        },
      },
    ]);
  });

  it("API キー未設定時は設定エラーを返す", async () => {
    const client = new AnthropicLLMClient({
      apiKeyEnvVar: "TEST_ANTHROPIC_API_KEY",
    });

    await expect(
      client.sendMessage({
        model: "claude-sonnet-4-5",
        messages: [{ role: "user", content: "こんにちは" }],
      }),
    ).rejects.toBeInstanceOf(LLMConfigurationError);
  });

  it("listModels で Models API の候補を正規化する", async () => {
    const list = vi.fn().mockResolvedValue({
      data: [
        {
          id: "claude-sonnet-4-5-20250929",
          display_name: "Claude Sonnet 4.5",
          created_at: "2025-09-29T00:00:00Z",
          type: "model",
        },
        {
          display_name: "IDなしは無視",
        },
      ],
    });

    const client = new AnthropicLLMClient({
      apiKey: "test-key",
      clientFactory: async () => ({
        messages: {
          create: vi.fn(),
        },
        models: {
          list,
        },
      }),
    });

    await expect(client.listModels()).resolves.toEqual([
      {
        id: "claude-sonnet-4-5-20250929",
        displayName: "Claude Sonnet 4.5",
        createdAt: "2025-09-29T00:00:00Z",
        raw: {
          id: "claude-sonnet-4-5-20250929",
          display_name: "Claude Sonnet 4.5",
          created_at: "2025-09-29T00:00:00Z",
          type: "model",
        },
      },
    ]);
    expect(list).toHaveBeenCalledWith();
  });

  it("401/403 を認証エラーに正規化する", async () => {
    const client = new AnthropicLLMClient({
      apiKey: "invalid-key",
      clientFactory: async () => ({
        messages: {
          create: vi.fn().mockRejectedValue({
            status: 401,
          }),
        },
        models: {
          list: vi.fn(),
        },
      }),
    });

    await expect(
      client.sendMessage({
        model: "claude-sonnet-4-5",
        messages: [{ role: "user", content: "こんにちは" }],
      }),
    ).rejects.toBeInstanceOf(LLMAuthenticationError);
  });
});
