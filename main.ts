// ============================================================
// DeepSeek Knowledge Organizer — Plugin Entry
// ============================================================
import { Plugin } from "obsidian";
import { DeepSeekClient } from "./src/api";
import { DeepSeekSettingTab, DEFAULT_SETTINGS } from "./src/settings";
import type { DeepSeekSettings } from "./src/settings";
import { DeepSeekSidebarView, VIEW_TYPE_DEEPSEEK_CHAT } from "./src/sidebar";
import { registerCommands } from "./src/commands";
import { Pipeline } from "./src/pipeline";
import { MemoryStore } from "./src/memory";

export default class DeepSeekPlugin extends Plugin {
  settings: DeepSeekSettings = { ...DEFAULT_SETTINGS };
  apiClient!: DeepSeekClient;
  pipeline!: Pipeline;
  memory!: MemoryStore;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.apiClient = new DeepSeekClient(
      this.settings.baseUrl,
      this.settings.apiKey,
      this.settings.model,
      this.settings.reasoningEffort,
    );
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
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    const effectiveKey = this.getEffectiveApiKey();
    if (this.apiClient) {
      this.apiClient.updateConfig(this.settings.baseUrl, effectiveKey, this.settings.model, this.settings.reasoningEffort);
    }
  }

  onunload(): void {
    console.log("[DeepSeek Organizer] 插件已卸载");
  }
}
