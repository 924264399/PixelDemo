/**
 * 换班信息池（全局单例）
 *
 * 老刘白班期间收到的重要信息，在 18:00 换班时传递给老王。
 * 换班完成后清空，信息只在当天有效。
 */

export interface HandoffNote {
    time: string;       // 记录时间（游戏时间）
    source: string;     // 信息来源（如"李家妹子"）
    content: string;    // 关键内容（简短，一句话）
}

export class ShiftHandoffPool {
    private static instance: ShiftHandoffPool;
    private notes: HandoffNote[] = [];

    static getInstance(): ShiftHandoffPool {
        if (!ShiftHandoffPool.instance) {
            ShiftHandoffPool.instance = new ShiftHandoffPool();
        }
        return ShiftHandoffPool.instance;
    }

    /** 老刘对话后写入一条交接信息 */
    addNote(source: string, content: string, gameHour?: number): void {
        const time = gameHour !== undefined ? `${gameHour}:00` : '--:--';
        this.notes.push({ time, source, content });
        console.log(`📋 交接池写入 [${time}] ${source}: ${content}`);
    }

    /** 获取所有交接信息（供老王 systemPrompt 注入） */
    getNotes(): HandoffNote[] {
        return [...this.notes];
    }

    /** 是否有待交接信息 */
    hasNotes(): boolean {
        return this.notes.length > 0;
    }

    /**
     * 将交接信息格式化为 systemPrompt 片段
     * 直接追加到老王的 systemPrompt 末尾
     */
    toPromptString(): string {
        if (this.notes.length === 0) return '';
        const lines = this.notes.map(n => `- [${n.time}] ${n.source}反映：${n.content}`);
        return `\n\n【今日老刘交接的信息】\n${lines.join('\n')}\n你已知晓以上情况，巡逻时留意。`;
    }

    /** 换班完成后清空（每天只传一次） */
    clear(): void {
        console.log(`📋 交接池已清空，共 ${this.notes.length} 条信息`);
        this.notes = [];
    }

    /** 调试用 */
    dump(): void {
        console.log('📋 当前交接池:', this.notes);
    }
}
