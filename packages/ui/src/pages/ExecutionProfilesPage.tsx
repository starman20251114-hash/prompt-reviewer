import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useApiKey } from "../hooks/useApiKey";
import {
  ApiError,
  type ApiProvider,
  type LLMModelOption,
  createExecutionProfile,
  deleteExecutionProfile,
  getExecutionProfiles,
  listExecutionProfileModels,
  updateExecutionProfile,
} from "../lib/api";
import styles from "./ExecutionProfilesPage.module.css";

type SaveFeedback = "success" | "error" | null;

type ProfileFormState = {
  name: string;
  description: string;
  model: string;
  temperature: number;
  apiProvider: ApiProvider;
  maxTokens: string;
};

const DEFAULT_FORM_STATE: ProfileFormState = {
  name: "",
  description: "",
  model: "",
  temperature: 0.7,
  apiProvider: "anthropic",
  maxTokens: "",
};

function toNullableMaxTokens(value: string): number | null {
  if (value.trim() === "") {
    return null;
  }

  return Number(value);
}

export function ExecutionProfilesPage() {
  const queryClient = useQueryClient();
  const { apiKey, hasApiKey, setApiKey } = useApiKey("shared");

  const [apiKeyInput, setApiKeyInput] = useState(apiKey);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [formState, setFormState] = useState<ProfileFormState>(DEFAULT_FORM_STATE);
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback>(null);
  const [apiKeySaved, setApiKeySaved] = useState(false);

  const {
    data: profiles = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["execution-profiles"],
    queryFn: () => getExecutionProfiles(),
  });

  const selectedProfile =
    selectedProfileId === null
      ? null
      : (profiles.find((profile) => profile.id === selectedProfileId) ?? null);

  const {
    data: modelOptionsData,
    isFetching: isFetchingModels,
    error: modelsError,
  } = useQuery({
    queryKey: ["execution-profile-models", formState.apiProvider, hasApiKey, apiKey],
    queryFn: () =>
      listExecutionProfileModels({
        api_provider: formState.apiProvider,
        api_key: apiKey,
      }),
    enabled: hasApiKey,
    retry: false,
  });

  const modelOptions = modelOptionsData?.models ?? [];
  const modelIds = modelOptions.map((option) => option.id);
  const hasRemoteModelOptions = modelOptions.length > 0;
  const shouldShowSavedModelOption = formState.model !== "" && !modelIds.includes(formState.model);
  const isModelSelectDisabled = !hasApiKey || isFetchingModels || !hasRemoteModelOptions;

  useEffect(() => {
    setApiKeyInput(apiKey);
  }, [apiKey]);

  useEffect(() => {
    if (!selectedProfile) {
      return;
    }

    setFormState({
      name: selectedProfile.name,
      description: selectedProfile.description ?? "",
      model: selectedProfile.model,
      temperature: selectedProfile.temperature,
      apiProvider: selectedProfile.api_provider,
      maxTokens: selectedProfile.max_tokens === null ? "" : String(selectedProfile.max_tokens),
    });
  }, [selectedProfile]);

  useEffect(() => {
    if (selectedProfileId !== null && !selectedProfile) {
      setSelectedProfileId(null);
      setFormState(DEFAULT_FORM_STATE);
    }
  }, [selectedProfile, selectedProfileId]);

  useEffect(() => {
    const firstModelOption = modelOptionsData?.models[0];
    if (formState.model === "" && firstModelOption) {
      setFormState((current) =>
        current.model === ""
          ? {
              ...current,
              model: firstModelOption.id,
            }
          : current,
      );
    }
  }, [formState.model, modelOptionsData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: formState.name.trim(),
        description: formState.description.trim() || null,
        model: formState.model,
        temperature: formState.temperature,
        api_provider: formState.apiProvider,
        max_tokens: toNullableMaxTokens(formState.maxTokens),
      };

      if (selectedProfileId === null) {
        return createExecutionProfile(payload);
      }

      return updateExecutionProfile(selectedProfileId, payload);
    },
    onSuccess: async (savedProfile) => {
      setSaveFeedback("success");
      setSelectedProfileId(savedProfile.id);
      await queryClient.invalidateQueries({ queryKey: ["execution-profiles"] });
      setTimeout(() => setSaveFeedback(null), 3000);
    },
    onError: () => {
      setSaveFeedback("error");
      setTimeout(() => setSaveFeedback(null), 5000);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteExecutionProfile(id),
    onSuccess: async () => {
      setSelectedProfileId(null);
      setFormState(DEFAULT_FORM_STATE);
      await queryClient.invalidateQueries({ queryKey: ["execution-profiles"] });
    },
  });

  function handleSaveApiKey() {
    setApiKey(apiKeyInput);
    setApiKeySaved(true);
    void queryClient.invalidateQueries({ queryKey: ["execution-profile-models"] });
    setTimeout(() => setApiKeySaved(false), 2000);
  }

  function handleCreateNew() {
    setSelectedProfileId(null);
    setFormState(DEFAULT_FORM_STATE);
    setSaveFeedback(null);
  }

  function handleDelete() {
    if (!selectedProfile) {
      return;
    }

    const confirmed = window.confirm(`「${selectedProfile.name}」を削除しますか？`);
    if (!confirmed) {
      return;
    }

    deleteMutation.mutate(selectedProfile.id);
  }

  function updateForm<K extends keyof ProfileFormState>(key: K, value: ProfileFormState[K]) {
    setFormState((current) => ({ ...current, [key]: value }));
  }

  const canSaveProfile =
    formState.name.trim().length > 0 &&
    formState.model.trim().length > 0 &&
    !saveMutation.isPending;

  if (isLoading) {
    return (
      <div className={styles.root}>
        <p className={styles.loadingMsg}>読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.root}>
        <p className={styles.errorMsg}>実行設定の取得に失敗しました。</p>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Execution Profiles</p>
          <h2 className={styles.pageTitle}>実行設定</h2>
        </div>
        <button type="button" onClick={handleCreateNew} className={styles.primaryButton}>
          新規プロファイル
        </button>
      </div>

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <h3 className={styles.sidebarTitle}>登録済みプロファイル</h3>
            <p className={styles.sidebarHint}>Run 実行時に使うモデル設定を管理します。</p>
          </div>

          <div className={styles.profileList}>
            {profiles.map((profile) => (
              <button
                type="button"
                key={profile.id}
                onClick={() => setSelectedProfileId(profile.id)}
                className={`${styles.profileCard} ${selectedProfileId === profile.id ? styles.profileCardActive : ""}`}
              >
                <span className={styles.profileName}>{profile.name}</span>
                <span className={styles.profileMeta}>
                  {profile.api_provider} / {profile.model}
                </span>
              </button>
            ))}
            {profiles.length === 0 && (
              <div className={styles.emptyCard}>
                <p className={styles.emptyTitle}>まだプロファイルがありません</p>
                <p className={styles.emptyText}>右側のフォームから最初の実行設定を作成できます。</p>
              </div>
            )}
          </div>
        </aside>

        <div className={styles.content}>
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h3 className={styles.sectionTitle}>
                  {selectedProfile ? "実行設定を編集" : "実行設定を作成"}
                </h3>
                <p className={styles.sectionDescription}>
                  モデル・temperature・トークン上限をひとまとまりで保存できます。
                </p>
              </div>
              {selectedProfile && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                  className={styles.dangerButton}
                >
                  {deleteMutation.isPending ? "削除中..." : "削除"}
                </button>
              )}
            </div>

            <div className={styles.formGrid}>
              <div className={styles.fieldGroup}>
                <label htmlFor="execution-profile-name" className={styles.fieldLabel}>
                  プロファイル名
                </label>
                <input
                  id="execution-profile-name"
                  type="text"
                  value={formState.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  placeholder="例: Claude 4 Sonnet / 安定運用"
                  className={styles.fieldInput}
                />
              </div>

              <div className={styles.fieldGroup}>
                <label htmlFor="execution-profile-provider" className={styles.fieldLabel}>
                  API プロバイダー
                </label>
                <select
                  id="execution-profile-provider"
                  value={formState.apiProvider}
                  onChange={(event) => {
                    updateForm("apiProvider", event.target.value as ApiProvider);
                    updateForm("model", "");
                  }}
                  className={styles.fieldSelect}
                >
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                </select>
                <p className={styles.fieldHint}>変更すると候補モデルを再取得します。</p>
              </div>

              <div className={`${styles.fieldGroup} ${styles.fieldGroupWide}`}>
                <label htmlFor="execution-profile-description" className={styles.fieldLabel}>
                  説明
                </label>
                <textarea
                  id="execution-profile-description"
                  value={formState.description}
                  onChange={(event) => updateForm("description", event.target.value)}
                  placeholder="この設定をどんな用途で使うかをメモできます"
                  rows={3}
                  className={styles.fieldTextarea}
                />
              </div>

              <div className={styles.fieldGroup}>
                <label htmlFor="execution-profile-model" className={styles.fieldLabel}>
                  モデル
                </label>
                <select
                  id="execution-profile-model"
                  value={formState.model}
                  onChange={(event) => updateForm("model", event.target.value)}
                  className={styles.fieldSelect}
                  disabled={isModelSelectDisabled}
                >
                  {!hasApiKey && <option value="">API キーを保存すると候補を取得します</option>}
                  {hasApiKey && isFetchingModels && (
                    <option value={formState.model}>候補を取得中...</option>
                  )}
                  {hasApiKey && !isFetchingModels && !hasRemoteModelOptions && (
                    <option value={formState.model}>候補を取得できません</option>
                  )}
                  {modelOptions.map((option: LLMModelOption) => (
                    <option key={option.id} value={option.id}>
                      {option.displayName === option.id
                        ? option.id
                        : `${option.displayName} (${option.id})`}
                    </option>
                  ))}
                  {shouldShowSavedModelOption && (
                    <option value={formState.model}>{formState.model}（保存済み）</option>
                  )}
                </select>
                {!hasApiKey && (
                  <p className={styles.fieldHint}>
                    先に下の API キー欄を保存すると、利用可能なモデル候補を取得します。
                  </p>
                )}
                {hasApiKey &&
                  !isFetchingModels &&
                  hasRemoteModelOptions &&
                  formState.model === "" && (
                    <p className={styles.fieldHint}>取得した候補からモデルを選択してください。</p>
                  )}
                {shouldShowSavedModelOption && (
                  <p className={styles.fieldHint}>
                    保存済みモデルは現在の候補一覧に含まれていません。
                  </p>
                )}
                {modelsError instanceof ApiError && (
                  <p className={styles.fieldError}>
                    {modelsError.status === 501
                      ? "このプロバイダーのモデル候補取得は未対応です。"
                      : modelsError.status === 401
                        ? "API キーの認証に失敗しました。キーを確認してください。"
                        : "モデル候補の取得に失敗しました。"}
                  </p>
                )}
              </div>

              <div className={styles.fieldGroup}>
                <label htmlFor="execution-profile-temperature" className={styles.fieldLabel}>
                  Temperature
                </label>
                <div className={styles.sliderRow}>
                  <input
                    id="execution-profile-temperature"
                    type="range"
                    min={0}
                    max={2}
                    step={0.1}
                    value={formState.temperature}
                    onChange={(event) => updateForm("temperature", Number(event.target.value))}
                    className={styles.slider}
                  />
                  <span className={styles.sliderValue}>{formState.temperature.toFixed(1)}</span>
                </div>
                <p className={styles.fieldHint}>0.0 で安定寄り、2.0 で発散寄りです。</p>
              </div>

              <div className={styles.fieldGroup}>
                <label htmlFor="execution-profile-max-tokens" className={styles.fieldLabel}>
                  Max Tokens
                </label>
                <input
                  id="execution-profile-max-tokens"
                  type="number"
                  min={1}
                  step={1}
                  value={formState.maxTokens}
                  onChange={(event) => updateForm("maxTokens", event.target.value)}
                  placeholder="デフォルト値を使う場合は空欄"
                  className={styles.fieldInput}
                />
                <p className={styles.fieldHint}>空欄ならプロバイダー既定値を利用します。</p>
              </div>
            </div>

            <div className={styles.formFooter}>
              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={!canSaveProfile}
                className={styles.primaryButton}
              >
                {saveMutation.isPending
                  ? "保存中..."
                  : selectedProfile
                    ? "変更を保存"
                    : "プロファイルを作成"}
              </button>
              {saveFeedback === "success" && (
                <span className={styles.feedbackSuccess}>保存しました</span>
              )}
              {saveFeedback === "error" && (
                <span className={styles.feedbackError}>保存に失敗しました</span>
              )}
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>モデル候補取得用 API キー</h3>
            <p className={styles.apiKeyNote}>
              API キーはブラウザの localStorage に保存され、モデル候補取得時と Run
              実行時に一時的に送信されます。サーバー側では保存しません。
            </p>

            <div className={styles.fieldGroup}>
              <label htmlFor="execution-profile-api-key" className={styles.fieldLabel}>
                API キー
              </label>
              <div className={styles.apiKeyInputRow}>
                <input
                  id="execution-profile-api-key"
                  type="password"
                  value={apiKeyInput}
                  onChange={(event) => setApiKeyInput(event.target.value)}
                  placeholder="sk-ant-... または sk-..."
                  className={styles.apiKeyInput}
                  autoComplete="off"
                />
                <button type="button" onClick={handleSaveApiKey} className={styles.secondaryButton}>
                  {apiKeySaved ? "保存済み" : "保存"}
                </button>
              </div>
              <div className={styles.apiKeyStatus}>
                {hasApiKey ? (
                  <span className={styles.apiKeyStatusSet}>設定済み</span>
                ) : (
                  <span className={styles.apiKeyStatusUnset}>未設定</span>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
