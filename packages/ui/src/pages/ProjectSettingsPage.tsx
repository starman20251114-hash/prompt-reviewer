import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useApiKey } from "../hooks/useApiKey";
import { ApiError, getProjectSettings, upsertProjectSettings } from "../lib/api";
import styles from "./ProjectSettingsPage.module.css";

const ANTHROPIC_MODELS = [
  { value: "claude-opus-4-6", label: "claude-opus-4-6" },
  { value: "claude-sonnet-4-6", label: "claude-sonnet-4-6" },
  { value: "claude-haiku-4-5-20251001", label: "claude-haiku-4-5-20251001" },
] as const;

const OPENAI_MODELS = [
  { value: "gpt-4o", label: "gpt-4o" },
  { value: "gpt-4o-mini", label: "gpt-4o-mini" },
] as const;

const ALL_MODELS = [...ANTHROPIC_MODELS.map((m) => m.value), ...OPENAI_MODELS.map((m) => m.value)];

function inferProvider(model: string): "anthropic" | "openai" {
  if (OPENAI_MODELS.some((m) => m.value === model)) return "openai";
  return "anthropic";
}

export function ProjectSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const queryClient = useQueryClient();

  const { apiKey, hasApiKey, setApiKey } = useApiKey(projectId);
  const [apiKeyInput, setApiKeyInput] = useState(apiKey);

  const [model, setModel] = useState("claude-opus-4-6");
  const [temperature, setTemperature] = useState(0.7);
  const [apiProvider, setApiProvider] = useState<"anthropic" | "openai">("anthropic");
  const [initialized, setInitialized] = useState(false);

  const [saveFeedback, setSaveFeedback] = useState<"success" | "error" | null>(null);
  const [apiKeySaved, setApiKeySaved] = useState(false);

  const {
    isLoading,
    data: settingsData,
    error,
  } = useQuery({
    queryKey: ["project-settings", projectId],
    queryFn: () => getProjectSettings(projectId),
    enabled: !Number.isNaN(projectId),
    retry: (failureCount, err) => {
      // 404は「未設定」として扱い、リトライしない
      if (err instanceof ApiError && err.status === 404) return false;
      return failureCount < 2;
    },
  });

  // DBから設定を取得したら初回のみフォームに反映する
  useEffect(() => {
    if (settingsData && !initialized) {
      setModel(settingsData.model);
      setTemperature(settingsData.temperature);
      setApiProvider(settingsData.api_provider);
      setInitialized(true);
    }
  }, [settingsData, initialized]);

  // 404（未設定）の場合はデフォルト値のまま初期化済みとする
  useEffect(() => {
    if (error instanceof ApiError && error.status === 404 && !initialized) {
      setInitialized(true);
    }
  }, [error, initialized]);

  const upsertMutation = useMutation({
    mutationFn: () =>
      upsertProjectSettings(projectId, {
        model,
        temperature,
        api_provider: apiProvider,
      }),
    onSuccess: () => {
      setSaveFeedback("success");
      void queryClient.invalidateQueries({ queryKey: ["project-settings", projectId] });
      setTimeout(() => setSaveFeedback(null), 3000);
    },
    onError: () => {
      setSaveFeedback("error");
      setTimeout(() => setSaveFeedback(null), 5000);
    },
  });

  function handleModelChange(newModel: string) {
    setModel(newModel);
    setApiProvider(inferProvider(newModel));
  }

  function handleSaveApiKey() {
    setApiKey(apiKeyInput);
    setApiKeySaved(true);
    setTimeout(() => setApiKeySaved(false), 2000);
  }

  if (isLoading) {
    return (
      <div className={styles.root}>
        <p className={styles.loadingMsg}>読み込み中...</p>
      </div>
    );
  }

  const isNetworkError = error instanceof ApiError ? error.status !== 404 : error != null;
  if (isNetworkError) {
    return (
      <div className={styles.root}>
        <p className={styles.errorMsg}>設定の取得に失敗しました。</p>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.pageHeader}>
        <h2 className={styles.pageTitle}>プロジェクト設定</h2>
      </div>

      <div className={styles.form}>
        {/* LLM設定セクション */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>LLM 設定</h3>

          {/* モデル選択 */}
          <div className={styles.fieldGroup}>
            <label htmlFor="settings-model" className={styles.fieldLabel}>
              モデル
            </label>
            <select
              id="settings-model"
              value={model}
              onChange={(e) => handleModelChange(e.target.value)}
              className={styles.fieldSelect}
            >
              <optgroup label="Anthropic">
                {ANTHROPIC_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="OpenAI">
                {OPENAI_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </optgroup>
              {/* DBに保存済みのモデルが上記リスト外の場合もオプションとして表示 */}
              {!ALL_MODELS.includes(model) && <option value={model}>{model}</option>}
            </select>
          </div>

          {/* APIプロバイダー */}
          <div className={styles.fieldGroup}>
            <label htmlFor="settings-provider" className={styles.fieldLabel}>
              API プロバイダー
            </label>
            <select
              id="settings-provider"
              value={apiProvider}
              onChange={(e) => setApiProvider(e.target.value as "anthropic" | "openai")}
              className={styles.fieldSelect}
            >
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
            </select>
            <p className={styles.fieldHint}>モデルを変更すると自動的に切り替わります</p>
          </div>

          {/* Temperatureスライダー */}
          <div className={styles.fieldGroup}>
            <label htmlFor="settings-temperature" className={styles.fieldLabel}>
              Temperature
            </label>
            <div className={styles.sliderRow}>
              <input
                id="settings-temperature"
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                className={styles.slider}
              />
              <span className={styles.sliderValue}>{temperature.toFixed(1)}</span>
            </div>
            <p className={styles.fieldHint}>0.0（より決定論的）〜 2.0（よりランダム）</p>
          </div>
        </div>

        {/* APIキーセクション */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>API キー</h3>
          <p className={styles.apiKeyNote}>
            APIキーはブラウザの localStorage にのみ保存されます。サーバーには送信されません。
          </p>

          <div className={styles.fieldGroup}>
            <label htmlFor="settings-api-key" className={styles.fieldLabel}>
              APIキー
            </label>
            <div className={styles.apiKeyInputRow}>
              <input
                id="settings-api-key"
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="sk-ant-... または sk-..."
                className={styles.apiKeyInput}
                autoComplete="off"
              />
              <button type="button" onClick={handleSaveApiKey} className={styles.btnSaveKey}>
                {apiKeySaved ? "保存済み" : "保存"}
              </button>
            </div>
            <div className={styles.apiKeyStatus}>
              {hasApiKey ? (
                <span className={styles.apiKeyStatusSet}>設定済み</span>
              ) : (
                <span className={styles.apiKeyStatusUnset}>
                  未設定 — Run 実行・Judge・Improve が無効になります
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 保存ボタン */}
        <div className={styles.formFooter}>
          <button
            type="button"
            onClick={() => upsertMutation.mutate()}
            disabled={upsertMutation.isPending}
            className={styles.btnSave}
          >
            {upsertMutation.isPending ? "保存中..." : "設定を保存"}
          </button>
          {saveFeedback === "success" && (
            <span className={styles.feedbackSuccess}>保存しました</span>
          )}
          {saveFeedback === "error" && (
            <span className={styles.feedbackError}>保存に失敗しました</span>
          )}
        </div>
      </div>
    </div>
  );
}
