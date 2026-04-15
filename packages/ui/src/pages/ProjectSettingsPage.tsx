import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useApiKey } from "../hooks/useApiKey";
import {
  type ApiProvider,
  ApiError,
  getProjectSettings,
  listProjectSettingsModels,
  upsertProjectSettings,
} from "../lib/api";
import styles from "./ProjectSettingsPage.module.css";

export function ProjectSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const queryClient = useQueryClient();

  const { apiKey, hasApiKey, setApiKey } = useApiKey(projectId);
  const [apiKeyInput, setApiKeyInput] = useState(apiKey);

  const [model, setModel] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [apiProvider, setApiProvider] = useState<ApiProvider>("anthropic");
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

  const {
    data: modelOptionsData,
    isFetching: isFetchingModels,
    error: modelsError,
  } = useQuery({
    queryKey: ["project-settings-models", projectId, apiProvider, hasApiKey],
    queryFn: () =>
      listProjectSettingsModels(projectId, {
        api_provider: apiProvider,
        api_key: apiKey,
      }),
    enabled: !Number.isNaN(projectId) && hasApiKey,
    retry: false,
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

  useEffect(() => {
    if (initialized && model === "" && modelOptionsData?.models[0]) {
      setModel(modelOptionsData.models[0].id);
    }
  }, [initialized, model, modelOptionsData]);

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

  function handleSaveApiKey() {
    setApiKey(apiKeyInput);
    setApiKeySaved(true);
    void queryClient.invalidateQueries({ queryKey: ["project-settings-models", projectId] });
    setTimeout(() => setApiKeySaved(false), 2000);
  }

  if (isLoading) {
    return (
      <div className={styles.root}>
        <p className={styles.loadingMsg}>読み込み中...</p>
      </div>
    );
  }

  const modelOptions = modelOptionsData?.models ?? [];
  const modelIds = modelOptions.map((option) => option.id);
  const hasRemoteModelOptions = modelOptions.length > 0;
  const shouldShowSavedModelOption = model !== "" && !modelIds.includes(model);
  const isModelSelectDisabled = !hasApiKey || isFetchingModels || !hasRemoteModelOptions;
  const canSaveSettings = model.trim().length > 0 && !upsertMutation.isPending;

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
              onChange={(e) => setModel(e.target.value)}
              className={styles.fieldSelect}
              disabled={isModelSelectDisabled}
            >
              {!hasApiKey && <option value="">APIキーを保存すると候補を取得します</option>}
              {hasApiKey && isFetchingModels && <option value={model}>候補を取得中...</option>}
              {hasApiKey && !isFetchingModels && !hasRemoteModelOptions && (
                <option value={model}>候補を取得できません</option>
              )}
              {modelOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.displayName === option.id
                    ? option.id
                    : `${option.displayName} (${option.id})`}
                </option>
              ))}
              {shouldShowSavedModelOption && <option value={model}>{model}（保存済み）</option>}
            </select>
            {hasApiKey && !isFetchingModels && hasRemoteModelOptions && model === "" && (
              <p className={styles.fieldHint}>取得した候補からモデルを選択してください</p>
            )}
            {!hasApiKey && (
              <p className={styles.fieldHint}>先に API キーを保存すると、利用可能なモデル候補を取得します</p>
            )}
            {modelsError instanceof ApiError && (
              <p className={styles.fieldError}>
                {modelsError.status === 501
                  ? "このプロバイダーのモデル候補取得は未対応です。"
                  : modelsError.status === 401
                    ? "APIキーの認証に失敗しました。キーを確認してください。"
                    : "モデル候補の取得に失敗しました。"}
              </p>
            )}
            {shouldShowSavedModelOption && (
              <p className={styles.fieldHint}>保存済みモデルは取得候補に含まれていません</p>
            )}
          </div>

          {/* APIプロバイダー */}
          <div className={styles.fieldGroup}>
            <label htmlFor="settings-provider" className={styles.fieldLabel}>
              API プロバイダー
            </label>
            <select
              id="settings-provider"
              value={apiProvider}
              onChange={(e) => {
                setApiProvider(e.target.value as ApiProvider);
                setModel("");
              }}
              className={styles.fieldSelect}
            >
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
            </select>
            <p className={styles.fieldHint}>プロバイダーを変更するとモデル候補を再取得します</p>
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
            APIキーはブラウザの localStorage に保存され、モデル候補取得時にサーバーへ一時送信されます。
            サーバー側では保存しません。
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
            disabled={!canSaveSettings}
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
