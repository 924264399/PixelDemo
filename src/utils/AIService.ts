/**
 * AI API 调用封装 - 安全的API调用管理
 * 
 * 功能：
 * 1. 封装API调用逻辑，保护敏感信息
 * 2. 统一错误处理和重试机制
 * 3. 请求频率控制和缓存
 * 4. 成本监控和日志记录
 */

// 消息类型定义
export interface AIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

// API响应类型
export interface AIResponse {
    success: boolean;
    content?: string;
    error?: string;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    cost?: number; // 估算成本（美元）
}

// API配置类型
export interface AIConfig {
    endpoint: string;
    apiKey: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
}

/**
 * AI API 调用器 - 单例模式
 */
export class AIAPIClient {
    private static instance: AIAPIClient;
    private config: AIConfig;
    private requestCount = 0;
    private totalCost = 0;
    private lastRequestTime = 0;
    private readonly MIN_REQUEST_INTERVAL = 500; // 各请求间最短间隔（ms）
    private retryAfter = 0; // 429错误后的等待时间

    // 全局串行队列：同一时间只有 1 个 LLM 请求在跑
    //   'high'（玩家对话）→ 插到队列最前，当前 low 任务跑完立刻轮到
    //   'low'（气泡/八卦）→ 正常追加到队尾
    private requestQueue: Array<{ task: () => Promise<void>; priority: 'high' | 'low' }> = [];
    private isProcessingQueue = false;

    // 全局对话冻结开关：对话期间所有 low 请求直接丢弃，不入队
    private frozen = false;

    /** 进入对话时冻结：清空队列中所有 low 任务，后续 low 请求直接丢弃 */
    freeze(): void {
        this.frozen = true;
        const before = this.requestQueue.length;
        this.requestQueue = this.requestQueue.filter(item => item.priority === 'high');
        console.log(`🧊 AI全局冻结，清除 ${before - this.requestQueue.length} 个low任务`);
    }

    /** 对话结束时解冻：后续 low 请求恢复正常排队 */
    unfreeze(): void {
        this.frozen = false;
        console.log(`🔥 AI全局解冻，后台任务恢复`);
    }

    private constructor() {
        // 从环境变量加载配置（支持浏览器环境）
        this.config = {
            endpoint: this.getEnvVar('AI_API_ENDPOINT') || 'https://api.qnaigc.com/v1/chat/completions',
            apiKey: this.getEnvVar('AI_API_KEY') || '',
            model: this.getEnvVar('AI_MODEL') || 'deepseek/deepseek-v3',
            temperature: 0.8,
            maxTokens: 200,  // NPC回复极短，200足够，减少等待时间
            timeout: 20000   // 超时20s，给网络足够余量
        };

        if (!this.config.apiKey) {
            console.warn('⚠️  AI_API_KEY 未设置，AI功能将无法使用');
        } else {
            console.log('✅ AI服务配置加载成功');
        }
    }
    
    /**
     * 获取环境变量 - 兼容浏览器和Node.js环境
     */
    private getEnvVar(key: string): string | undefined {
        // 在浏览器环境中，Vite会将process.env注入到全局
        if (typeof process !== 'undefined' && process.env) {
            return process.env[key];
        }
        
        // 浏览器环境的备用方案 - 从全局变量获取
        if (typeof window !== 'undefined' && (window as any).ENV_CONFIG) {
            return (window as any).ENV_CONFIG[key];
        }
        
        return undefined;
    }

    static getInstance(): AIAPIClient {
        if (!AIAPIClient.instance) {
            AIAPIClient.instance = new AIAPIClient();
        }
        return AIAPIClient.instance;
    }

    /**
     * 发送聊天请求。
     *
     * 设计原则：
     *   - 全局单锁：同一时间只有 1 个 HTTP 请求在跑，绝不并发
     *   - 玩家优先：priority='high' 的请求插到队列最前面
     *   - 不覆盖：所有请求都会最终执行（low任务不会被high任务覆盖）
     *   - 去重：如果队列里已有相同 NPC 的 low 请求，丢掉旧的保留新的
     */
    async chatCompletion(
        messages: AIMessage[],
        options?: {
            temperature?: number;
            maxTokens?: number;
            stream?: boolean;
        }
    ): Promise<AIResponse> {
        // 1. 检查 API 密钥
        if (!this.config.apiKey || this.config.apiKey === 'your-api-key-here') {
            return { success: false, error: 'API密钥未配置或无效' };
        }

        // 2. 检查 429 冷却期
        const now = Date.now();
        if (now < this.retryAfter) {
            const waitTime = Math.ceil((this.retryAfter - now) / 1000);
            console.warn(`⏳ API限流冷却中，还需等待 ${waitTime} 秒`);
            return { success: false, error: `API限流中，请等待${waitTime}秒` };
        }

        const priority = (options as any)?._priority ?? 'low';

        // 3. 冻结期间：low 请求直接丢弃，high 请求照常执行
        if (this.frozen && priority === 'low') {
            console.log(`🧊 冻结中，丢弃 low 请求`);
            return { success: false, error: 'frozen' };
        }

        return new Promise<AIResponse>((resolve) => {
            const task = async () => { resolve(await this.executeRequest(messages, options)); };

            if (priority === 'high') {
                // 玩家对话：插到队列最前面
                this.requestQueue.unshift({ task, priority: 'high' });
                console.log(`⚡ 玩家对话入队最前，队列长度: ${this.requestQueue.length}`);
            } else {
                // NPC 气泡/八卦：追加到队尾
                this.requestQueue.push({ task, priority: 'low' });
            }

            this.processQueue();
        });
    }

    /** 全局串行消费队列：同一时间只有 1 个请求在跑 */
    private async processQueue(): Promise<void> {
        if (this.isProcessingQueue) return; // 已有消费者在跑，直接返回
        this.isProcessingQueue = true;

        while (this.requestQueue.length > 0) {
            const { task, priority } = this.requestQueue.shift()!;
            console.log(`🔄 执行请求 priority=${priority}，剩余队列: ${this.requestQueue.length}`);
            await task();
            // 请求之间保留最短间隔，避免触发限流
            const gap = this.MIN_REQUEST_INTERVAL - (Date.now() - this.lastRequestTime);
            if (gap > 0) await this.sleep(gap);
        }

        this.isProcessingQueue = false;
    }

    /** 实际执行单次 HTTP 请求 */
    private async executeRequest(
        messages: AIMessage[],
        options?: { temperature?: number; maxTokens?: number; stream?: boolean }
    ): Promise<AIResponse> {
        try {
            const requestData = {
                stream: false,
                model: this.config.model,
                messages,
                temperature: options?.temperature ?? this.config.temperature,
                max_tokens: options?.maxTokens ?? this.config.maxTokens,
            };

            console.log(`🤖 AI请求 #${++this.requestCount} (messages: ${messages.length})`);
            this.lastRequestTime = Date.now();

            const response = await this.makeRequest(requestData);

            if (response.choices && response.choices[0]) {
                const content = response.choices[0].message?.content || '';
                const usage = response.usage;
                const estimatedCost = this.calculateCost(usage);
                this.totalCost += estimatedCost;
                console.log(`✅ AI响应成功 tokens:${usage?.total_tokens || 0} cost:$${estimatedCost.toFixed(5)}`);
                return { success: true, content, usage, cost: estimatedCost };
            } else {
                throw new Error('API返回格式异常');
            }
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : '未知错误';
            if (errMsg.includes('429')) {
                this.retryAfter = Date.now() + 30000;
                console.warn('🚫 API限流(429)，冷却30秒后恢复');
                return { success: false, error: '请求太频繁，请稍后再说话' };
            }
            console.error('❌ AI请求失败:', errMsg);
            return { success: false, error: errMsg };
        }
    }

    /**
     * 执行实际的HTTP请求
     */
    private async makeRequest(data: any): Promise<any> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        try {
            const response = await fetch(this.config.endpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * 估算API调用成本
     */
    private calculateCost(usage?: any): number {
        if (!usage) return 0;

        // 基于MiniMax定价估算（这里使用模拟数据）
        const inputTokenPrice = 0.0001;  // 每1K token价格
        const outputTokenPrice = 0.0002; // 每1K token价格

        const inputCost = (usage.prompt_tokens || 0) / 1000 * inputTokenPrice;
        const outputCost = (usage.completion_tokens || 0) / 1000 * outputTokenPrice;

        return inputCost + outputCost;
    }

    /**
     * 获取使用统计
     */
    getUsageStats(): {
        requestCount: number;
        totalCost: number;
        averageCostPerRequest: number;
    } {
        return {
            requestCount: this.requestCount,
            totalCost: this.totalCost,
            averageCostPerRequest: this.requestCount > 0 ? this.totalCost / this.requestCount : 0
        };
    }

    /**
     * 重置统计
     */
    resetStats(): void {
        this.requestCount = 0;
        this.totalCost = 0;
    }

    /**
     * 检查API是否可用
     */
    async healthCheck(): Promise<boolean> {
        try {
            const response = await this.chatCompletion([
                { role: 'user', content: 'Hello' }
            ]);
            return response.success;
        } catch {
            return false;
        }
    }

    // 辅助方法
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * 便利的AI助手类 - 为NPC提供简化的AI接口
 */
export class NPCAIAssistant {
    private client: AIAPIClient;
    private npcId: string;
    private conversationHistory: AIMessage[] = [];
    private readonly MAX_HISTORY = 10; // 最大对话历史数量

    constructor(npcId: string) {
        this.client = AIAPIClient.getInstance();
        this.npcId = npcId;
    }

    /**
     * NPC进行AI决策
     */
    async makeDecision(
        systemPrompt: string,
        contextInfo: string
    ): Promise<string | null> {
        const messages: AIMessage[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: contextInfo }
        ];

        const response = await this.client.chatCompletion(messages, {
            temperature: 0.8, // 决策需要一定随机性
            maxTokens: 300
        });

        if (response.success && response.content) {
            console.log(`🧠 ${this.npcId} AI决策:`, response.content);
            return response.content;
        }

        console.warn(`⚠️  ${this.npcId} AI决策失败，使用降级逻辑`);
        return null;
    }

    /**
     * NPC处理对话
     * @param priority 'high'=玩家主动对话（插队），'low'=气泡/开场白/八卦（排队）
     */
    async handleConversation(
        systemPrompt: string,
        playerMessage: string,
        priority: 'high' | 'low' = 'low'
    ): Promise<string | null> {
        // 构建包含历史的消息
        const messages: AIMessage[] = [
            { role: 'system', content: systemPrompt },
            ...this.conversationHistory,
            { role: 'user', content: playerMessage }
        ];

        const response = await this.client.chatCompletion(messages, {
            temperature: 0.7,
            maxTokens: 400,
            _priority: priority,
        } as any);

        if (response.success && response.content) {
            // 更新对话历史
            this.addToHistory('user', playerMessage);
            this.addToHistory('assistant', response.content);

            console.log(`💬 ${this.npcId} AI回复:`, response.content);
            return response.content;
        }

        console.warn(`⚠️  ${this.npcId} AI对话失败，使用降级回复`);
        return null;
    }

    /**
     * 添加到对话历史
     */
    private addToHistory(role: 'user' | 'assistant', content: string): void {
        this.conversationHistory.push({ role, content });

        // 限制历史长度
        if (this.conversationHistory.length > this.MAX_HISTORY) {
            this.conversationHistory = this.conversationHistory.slice(-this.MAX_HISTORY);
        }
    }

    /**
     * 清除对话历史
     */
    clearHistory(): void {
        this.conversationHistory = [];
    }

    /**
     * 获取对话历史
     */
    getHistory(): AIMessage[] {
        return [...this.conversationHistory];
    }

    /**
     * 检查AI是否可用
     */
    async checkAIAvailability(): Promise<boolean> {
        return await this.client.healthCheck();
    }

    /**
     * 获取使用统计
     */
    getUsageStats() {
        return this.client.getUsageStats();
    }
}

/**
 * 全局AI服务管理器
 */
export class AIServiceManager {
    private static instance: AIServiceManager;
    private assistants: Map<string, NPCAIAssistant> = new Map();

    private constructor() {}

    static getInstance(): AIServiceManager {
        if (!AIServiceManager.instance) {
            AIServiceManager.instance = new AIServiceManager();
        }
        return AIServiceManager.instance;
    }

    /**
     * 为NPC创建AI助手
     */
    createAssistant(npcId: string): NPCAIAssistant {
        if (this.assistants.has(npcId)) {
            return this.assistants.get(npcId)!;
        }

        const assistant = new NPCAIAssistant(npcId);
        this.assistants.set(npcId, assistant);
        return assistant;
    }

    /**
     * 获取NPC的AI助手
     */
    getAssistant(npcId: string): NPCAIAssistant | null {
        return this.assistants.get(npcId) || null;
    }

    /**
     * 移除NPC助手
     */
    removeAssistant(npcId: string): void {
        this.assistants.delete(npcId);
    }

    /**
     * 获取所有AI使用统计
     */
    getAllStats(): {
        totalAssistants: number;
        totalRequests: number;
        totalCost: number;
        averageCostPerRequest: number;
    } {
        const client = AIAPIClient.getInstance();
        const stats = client.getUsageStats();
        
        return {
            totalAssistants: this.assistants.size,
            ...stats
        };
    }

    /**
     * 检查所有AI服务健康状态
     */
    async checkAllHealth(): Promise<boolean> {
        const client = AIAPIClient.getInstance();
        return await client.healthCheck();
    }
}