/**
 * 八卦池（全局单例）
 *
 * 张婶从与玩家的对话中收集信息，存入此池。
 * 老刘、老王、大强在巡逻 / 对话时可读取池内内容，
 * 模拟小镇"消息靠张婶传，传着传着就变味儿"的氛围。
 *
 * 筛选策略：非常宽松，只过滤纯寒暄（你好/再见等）。
 * 几乎所有实质内容都会进池，且经张婶"加工"后存储。
 */

export interface GossipNote {
    time: string;       // 记录时的游戏时间
    source: string;     // 来源（固定为"李家妹子"）
    original: string;   // 玩家原话
    gossip: string;     // 张婶添油加醋后的版本（LLM生成，异步填充）
}

// 纯寒暄关键词 —— 命中则不入池
const SKIP_KEYWORDS = ['你好', '再见', '拜拜', '嗯', '哦', '好的', '谢谢', '没事', '没啥'];

export class GossipPool {
    private static instance: GossipPool;
    private notes: GossipNote[] = [];
    private readonly MAX_NOTES = 20;

    static getInstance(): GossipPool {
        if (!GossipPool.instance) {
            GossipPool.instance = new GossipPool();
        }
        return GossipPool.instance;
    }

    /**
     * 写入一条八卦，gossip 字段先用原话占位，异步由张婶 LLM 加工后更新
     */
    addNote(playerMsg: string, gameHour?: number, gossipVersion?: string): void {
        const trimmed = playerMsg.trim();
        if (!trimmed || trimmed.length < 3) return;

        const isSmallTalk = SKIP_KEYWORDS.some(k => trimmed === k || trimmed.startsWith(k));
        if (isSmallTalk) return;

        const time = gameHour !== undefined ? `${gameHour.toString().padStart(2,'0')}:00` : '--:--';
        const original = trimmed.length > 40 ? trimmed.slice(0, 40) + '…' : trimmed;
        const gossip = gossipVersion ?? original; // 没有加工版就先用原文

        this.notes.push({ time, source: '李家妹子', original, gossip });
        if (this.notes.length > this.MAX_NOTES) {
            this.notes.shift();
        }
        console.log(`🛒 八卦池写入 [${time}] 原文：${original} | 加工：${gossip}`);
    }

    /**
     * 更新最后一条记录的 gossip 加工版本（供张婶 LLM 异步回填）
     */
    updateLastGossip(gossipVersion: string): void {
        if (this.notes.length === 0) return;
        const last = this.notes[this.notes.length - 1];
        last.gossip = gossipVersion.trim();
        console.log(`🛒 八卦池加工完成：${last.gossip}`);
    }

    getNotes(): GossipNote[] {
        return [...this.notes];
    }

    hasNotes(): boolean {
        return this.notes.length > 0;
    }

    /** 返回当前条数（供大强检测新消息） */
    count(): number {
        return this.notes.length;
    }

    /** 返回最新一条八卦（供大强生成吃瓜反应） */
    getLatest(): GossipNote | null {
        return this.notes.length > 0 ? this.notes[this.notes.length - 1] : null;
    }

    /**
     * 格式化为 systemPrompt 片段（使用张婶加工版）
     * 注入老刘 / 老王 / 大强的 Prompt
     */
    toPromptString(): string {
        if (this.notes.length === 0) return '';
        const lines = this.notes.map(n => `- [${n.time}] 张婶说：${n.gossip}`);
        return `\n\n【张婶从便利店传来的消息（已经过她加工）】\n${lines.join('\n')}\n这些是张婶告诉你的街坊八卦，可能有夸大成分，聊天时可自然提及或质疑。`;
    }

    /** 每天结束时清空 */
    clear(): void {
        console.log(`🛒 八卦池已清空，共 ${this.notes.length} 条`);
        this.notes = [];
    }
}