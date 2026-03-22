/**
 * 八卦池（全局单例）
 *
 * 张婶从与玩家的对话中收集信息，存入此池。
 * 老刘、老王在巡逻 / 换班时可读取池内内容，
 * 模拟小镇"消息靠张婶传"的氛围。
 *
 * 筛选策略：非常宽松，只过滤纯寒暄（你好/再见等）。
 * 几乎所有实质内容都会进池。
 */

export interface GossipNote {
    time: string;       // 记录时的游戏时间
    source: string;     // 来源（固定为"李家妹子"）
    content: string;    // 玩家说的话（截短处理）
}

// 纯寒暄关键词 —— 命中则不入池
const SKIP_KEYWORDS = ['你好', '再见', '拜拜', '嗯', '哦', '好的', '谢谢', '没事', '没啥'];

export class GossipPool {
    private static instance: GossipPool;
    private notes: GossipNote[] = [];
    private readonly MAX_NOTES = 20; // 最多保留20条，防止无限增长

    static getInstance(): GossipPool {
        if (!GossipPool.instance) {
            GossipPool.instance = new GossipPool();
        }
        return GossipPool.instance;
    }

    /**
     * 张婶对话后写入
     * @param playerMsg 玩家原话
     * @param gameHour  当前游戏小时
     */
    addNote(playerMsg: string, gameHour?: number): void {
        const trimmed = playerMsg.trim();
        if (!trimmed || trimmed.length < 3) return;

        // 过滤纯寒暄
        const isSmallTalk = SKIP_KEYWORDS.some(k => trimmed === k || trimmed.startsWith(k));
        if (isSmallTalk) return;

        const time = gameHour !== undefined ? `${gameHour.toString().padStart(2,'0')}:00` : '--:--';
        const content = trimmed.length > 30 ? trimmed.slice(0, 30) + '…' : trimmed;

        this.notes.push({ time, source: '李家妹子', content });
        if (this.notes.length > this.MAX_NOTES) {
            this.notes.shift(); // 丢弃最早的一条
        }
        console.log(`🛒 八卦池写入 [${time}] ${content}`);
    }

    getNotes(): GossipNote[] {
        return [...this.notes];
    }

    hasNotes(): boolean {
        return this.notes.length > 0;
    }

    /**
     * 格式化为 systemPrompt 片段，注入老刘 / 老王的 Prompt
     */
    toPromptString(): string {
        if (this.notes.length === 0) return '';
        const lines = this.notes.map(n => `- [${n.time}] ${n.source}在便利店说：${n.content}`);
        return `\n\n【张婶从便利店传来的消息】\n${lines.join('\n')}\n这些是张婶告诉你的街坊动态，你已知晓，聊天时可自然提及。`;
    }

    /** 每天结束时清空（如有需要） */
    clear(): void {
        console.log(`🛒 八卦池已清空，共 ${this.notes.length} 条`);
        this.notes = [];
    }
}
