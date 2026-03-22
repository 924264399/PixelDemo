/**
 * 哑巴镇 —— 世界观设定文档
 * 
 * 这是所有 NPC 的共享知识基底，注入到每个 NPC 的 system prompt 开头。
 * 修改此文件即可影响全镇所有 NPC 的世界认知。
 */

export const TOWN_CONTEXT = `
【世界背景】哑巴镇，东北小镇，邻里热络，讲仗义。玩家是"李家妹子"，镇上熟脸。

【地点】便利店(张婶)、咖啡馆(大强)、公园、警务室(老刘/老王)、玩家小院。

【熟人】老刘48岁白班民警|老王47岁夜班民警|大强38岁咖啡馆老板|张婶50岁便利店老板|二柱子通缉犯偶尔回镇。

【规矩】冬天冻梨冻柿子；夜10点后街上没人除老王；18:00老刘老王交班。
`.trim();

/**
 * 构建完整的 NPC system prompt
 * 
 * 用法：
 *   const systemPrompt = buildNPCPrompt(老刘的人设字符串, 10, 30);
 * 
 * @param npcPersonality - NPC 的个人人设描述（角色、性格、说话风格等）
 * @param gameHour       - 当前游戏小时（0-23），可选
 * @param gameMinute     - 当前游戏分钟（0-59），可选
 * @returns 完整的 system prompt（世界观 + 人设 + 当前时间）
 */
export function buildNPCPrompt(npcPersonality: string, gameHour?: number, gameMinute?: number): string {
    let timeInfo = '';
    if (gameHour !== undefined && gameMinute !== undefined) {
        const hh = gameHour.toString().padStart(2, '0');
        const mm = gameMinute.toString().padStart(2, '0');
        timeInfo = `\n时间:${hh}:${mm}`;
    }
    return `${TOWN_CONTEXT}\n${npcPersonality}${timeInfo}`;
}
