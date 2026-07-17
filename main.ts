// ============================================================
// DeepSeek Knowledge Organizer — Plugin Entry
// ============================================================
import { Plugin, Notice, TFile } from "obsidian";
import { DeepSeekClient } from "./src/api";
import { ChatModelManager } from "./src/LLMProviders/chatModelManager";
import { DeepSeekSettingTab, DEFAULT_SETTINGS } from "./src/settings";
import type { DeepSeekSettings } from "./src/settings";
import { DeepSeekSidebarView } from "./src/sidebar";
import { VIEW_TYPE_DEEPSEEK_CHAT } from "./src/constants";
import { registerCommands } from "./src/commands";
import { Pipeline } from "./src/pipeline";
import { MemoryStore } from "./src/memory";
import { VaultSearchIndex, getSearchIndex } from "./src/search/vaultSearch";
import { registerBuiltinTools } from "./src/tools/builtinTools";
import { CustomCommandManager } from "./src/commands/customCommandManager";
import { ChatPersistenceManager } from "./src/core/chatPersistence";
import { registerQuickAsk } from "./src/editor/quickAsk";
import { RAGManager } from "./src/rag/RAGManager";

export default class DeepSeekPlugin extends Plugin {
  settings: DeepSeekSettings = { ...DEFAULT_SETTINGS };
  apiClient!: DeepSeekClient;
  modelManager!: ChatModelManager;
  pipeline!: Pipeline;
  memory!: MemoryStore;
  searchIndex!: VaultSearchIndex;
  customCommands!: CustomCommandManager;
  chatPersistence!: ChatPersistenceManager;
  ragManager!: RAGManager;
  /** 当前聊天对应的笔记路径，供工具（如 saveCanvas）使用 */
  currentNotePath: string = "";

  async onload(): Promise<void> {
    try {
    await this.loadSettings();

    const effectiveKey = this.getEffectiveApiKey();
    this.apiClient = new DeepSeekClient(
      this.settings.baseUrl,
      effectiveKey,
      this.settings.model,
      this.settings.reasoningEffort,
    );

    // Initialize multi-provider model manager
    this.modelManager = new ChatModelManager(
      this.settings.baseUrl,
      effectiveKey,
      this.settings.model,
      this.settings.reasoningEffort,
    );
    this.syncProviders();

    // Initialize search index (deferred to layout ready)
    this.searchIndex = getSearchIndex(this.app.vault);

    this.pipeline = new Pipeline(this);
    // 延迟初始化 memory，避免 vault 未就绪时报错
    try {
      this.memory = new MemoryStore(this.app, this.settings.memoryFolder, this.settings.memoryMaxSizeMB);
      await this.memory.initialize();
    } catch (e) { console.warn("[DeepSeek] Memory init failed (vault not ready):", e); }
    this.addSettingTab(new DeepSeekSettingTab(this.app, this));
    this.registerView(VIEW_TYPE_DEEPSEEK_CHAT, (leaf) => new DeepSeekSidebarView(leaf, this));
    this.addRibbonIcon("message-square", "DeepSeek 助手", async () => { await this.activateChatSidebar(); });
    this.addCommand({ id: "open-deepseek-chat", name: "打开 DeepSeek 助手", callback: async () => { await this.activateChatSidebar(); } });
    registerCommands(this);

    // Initialize tools
    registerBuiltinTools(this);

    // Initialize custom commands & chat persistence
    this.customCommands = new CustomCommandManager(this.app.vault);
    this.chatPersistence = new ChatPersistenceManager(this.app);

    // Register Quick Ask commands
    registerQuickAsk(this);

    // Defer heavy init to after layout ready
    this.app.workspace.onLayoutReady(() => {
      this.searchIndex.initialize().catch((e) =>
        console.warn("[DeepSeek] Search index init failed:", e),
      );
      this.customCommands.initialize().catch((e) =>
        console.warn("[DeepSeek] Custom commands init failed:", e),
      );
      // Initialize RAG (hybrid search)
      this.initRAG().catch((e) =>
        console.warn("[DeepSeek] RAG init failed:", e),
      );
    });

    } catch (e) {
      console.error("[AI Assistant] onload failed:", e);
      new Notice("AI 助手加载失败：" + (e instanceof Error ? e.message : String(e)), 10000);
      throw e;
    }
  }

  /** Sync provider configs from settings to model manager */
  syncProviders(): void {
    const s = this.settings;
    const effectiveKey = this.getEffectiveApiKey();
    // DeepSeek — only if API key is configured (via settings or env var)
    if (effectiveKey) {
      this.modelManager.registerProvider({
        provider: "deepseek",
        apiKey: effectiveKey,
        baseUrl: s.baseUrl,
        model: s.model,
      });
    }
    // 通义千问
    if (s.qwenApiKey) {
      this.modelManager.registerProvider({
        provider: "qwen",
        apiKey: s.qwenApiKey,
        baseUrl: s.qwenBaseUrl,
        model: s.qwenModel,
      });
    }
    // 智谱 GLM
    if (s.glmApiKey) {
      this.modelManager.registerProvider({
        provider: "glm",
        apiKey: s.glmApiKey,
        baseUrl: s.glmBaseUrl,
        model: s.glmModel,
      });
    }
    // Ollama 本地
    if (s.ollamaBaseUrl) {
      this.modelManager.registerProvider({
        provider: "ollama",
        apiKey: "ollama",
        baseUrl: s.ollamaBaseUrl,
        model: s.ollamaModel,
      });
    }
    // 多模态视觉
    if (s.visionProvider && s.visionProvider !== "none" && s.visionApiKey) {
      this.modelManager.registerVision({
        provider: s.visionProvider as "qwen-vl" | "glm-v",
        apiKey: s.visionApiKey,
        baseUrl: s.visionBaseUrl,
        model: s.visionModel,
      });
    }
  }

  /** Initialize RAG (hybrid search) after layout is ready */
  async initRAG(): Promise<void> {
    this.ragManager = new RAGManager(this);
    await this.ragManager.initialize();
    // Register file change listeners for incremental indexing
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof TFile && file.extension === "md") this.ragManager.indexNote(file);
      }),
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile && file.extension === "md") this.ragManager.indexNote(file);
      }),
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        this.ragManager.unindexNote(file.path);
      }),
    );
  }

  async activateChatSidebar(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE_DEEPSEEK_CHAT);
    if (existing.length > 0) { workspace.revealLeaf(existing[0]); return; }
    const leaf = workspace.getRightLeaf(false);
    if (leaf) { await leaf.setViewState({ type: VIEW_TYPE_DEEPSEEK_CHAT, active: true }); workspace.revealLeaf(leaf); }
  }

  getSidebarView(): DeepSeekSidebarView | null {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_DEEPSEEK_CHAT);
    return leaves.length === 0 ? null : leaves[0].view as DeepSeekSidebarView;
  }

  getEffectiveApiKey(): string {
    const envKey = (process as any)?.env?.DEEPSEEK_API_KEY;
    return (envKey && envKey.trim()) ? envKey.trim() : this.settings.apiKey;
  }

  async loadSettings(): Promise<void> {
    const stored = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...(stored || {}) };
    const effectiveKey = this.getEffectiveApiKey();
    if (this.apiClient) {
      this.apiClient.updateConfig(this.settings.baseUrl, effectiveKey, this.settings.model, this.settings.reasoningEffort);
    }
    if (this.modelManager) {
      this.modelManager.updateDeepSeekConfig(this.settings.baseUrl, effectiveKey, this.settings.model, this.settings.reasoningEffort);
      this.syncProviders();
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    const effectiveKey = this.getEffectiveApiKey();
    if (this.apiClient) {
      this.apiClient.updateConfig(this.settings.baseUrl, effectiveKey, this.settings.model, this.settings.reasoningEffort);
    }
    if (this.modelManager) {
      this.modelManager.updateDeepSeekConfig(this.settings.baseUrl, effectiveKey, this.settings.model, this.settings.reasoningEffort);
      this.syncProviders();
    }
    // Refresh sidebar provider list
    const sidebar = this.getSidebarView();
    if (sidebar) sidebar.refreshChat();
  }

  onunload(): void {
    console.log("[DeepSeek Organizer] 插件已卸载");
  }
}
