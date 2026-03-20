/**
 * LPC（Liberated Pixel Cup）标准精灵动画工具
 *
 * 标准 LPC 精灵表布局（每格 64×64，共 13 列）：
 *
 *  Row  0- 3  施法 cast   (7  帧 / 方向)  → up, left, down, right
 *  Row  4- 7  刺击 thrust (8  帧 / 方向)
 *  Row  8-11  行走 walk   (9  帧 / 方向)
 *  Row 12-15  斩击 slash  (6  帧 / 方向)
 *  Row 16-19  射击 shoot  (13 帧 / 方向)
 *  Row 20-20  受伤 hurt   (6  帧，仅单方向)
 *
 *  方向偏移：+0=up, +1=left, +2=down, +3=right
 */

export type LPCDirection = 'up' | 'left' | 'down' | 'right';

/** 每行的列数（精灵表宽度 832 / 帧宽 64 = 13） */
const SHEET_COLS = 13;

/** 方向在动画块内的行偏移 */
const DIR_ROW_OFFSET: Record<LPCDirection, number> = {
  up:    0,
  left:  1,
  down:  2,
  right: 3,
};

/** 标准 LPC 动画定义 */
export const LPC_ANIM_DEFS: Record<string, { startRow: number; frames: number }> = {
  cast:   { startRow: 0,  frames: 7  },
  thrust: { startRow: 4,  frames: 8  },
  walk:   { startRow: 8,  frames: 9  },
  slash:  { startRow: 12, frames: 6  },
  shoot:  { startRow: 16, frames: 13 },
  hurt:   { startRow: 20, frames: 6  },
};

/**
 * 注册 LPC 动画到 Phaser 动画管理器。
 *
 * @param scene     Phaser 场景
 * @param key       spritesheet 纹理 key
 * @param animNames 要注册的动画名，如 ['walk']、['walk','slash']
 * @param frameRate 帧率（默认 8）
 */
export function registerLPCAnims(
  scene: Phaser.Scene,
  key: string,
  animNames: string[],
  _framesPerAnim?: number, // 保留参数兼容旧调用，LPC 格式不使用此值
  frameRate = 8,
): void {
  const dirs: LPCDirection[] = ['up', 'left', 'down', 'right'];

  for (const animName of animNames) {
    const def = LPC_ANIM_DEFS[animName];
    if (!def) {
      console.warn(`[LPCSprite] 未知动画名: "${animName}"，可用：${Object.keys(LPC_ANIM_DEFS).join(', ')}`);
      continue;
    }

    for (const dir of dirs) {
      const animKey = `${key}-${animName}-${dir}`;
      if (scene.anims.exists(animKey)) continue;

      const row        = def.startRow + DIR_ROW_OFFSET[dir];
      const startFrame = row * SHEET_COLS;
      const endFrame   = startFrame + def.frames - 1;

      scene.anims.create({
        key:       animKey,
        frames:    scene.anims.generateFrameNumbers(key, { start: startFrame, end: endFrame }),
        frameRate,
        repeat:    -1,
      });
    }
  }
}

/**
 * 播放 LPC 动画（同 key+方向 不会重复触发，防止动画重置）。
 */
export function playLPCAnim(
  sprite: Phaser.GameObjects.Sprite | Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
  key: string,
  animName: string,
  dir: LPCDirection,
): void {
  const animKey = `${key}-${animName}-${dir}`;
  if (sprite.anims.currentAnim?.key !== animKey) {
    sprite.play(animKey, true);
  }
}

/**
 * 根据速度向量返回面朝方向。
 * 水平/垂直速度相同时优先水平。
 */
export function velocityToDirection(vx: number, vy: number): LPCDirection {
  if (Math.abs(vx) >= Math.abs(vy)) {
    return vx >= 0 ? 'right' : 'left';
  }
  return vy > 0 ? 'down' : 'up';
}

/**
 * 返回指定动画、指定方向的静止帧编号。
 * 默认取 walk 动画第 0 帧（LPC walk 首帧即自然站立姿势）。
 *
 * @param dir       方向
 * @param animName  动画名，默认 'walk'
 */
export function getIdleFrame(
  dir: LPCDirection,
  _framesPerAnim?: number, // 兼容旧调用，LPC 不使用
  animName = 'walk',
): number {
  const def = LPC_ANIM_DEFS[animName] ?? LPC_ANIM_DEFS.walk;
  const row = def.startRow + DIR_ROW_OFFSET[dir];
  return row * SHEET_COLS; // 该行第 0 列（站立帧）
}