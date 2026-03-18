# NPC移动系统规范

## 概述

NPC移动系统为AI Agent提供统一的控制接口，使AI可以控制NPC到达指定位置，同时处理碰撞检测和状态管理。

---

## NPC状态

| 状态 | 说明 |
|------|------|
| `IDLE` | 空闲状态，停留在原地 |
| `MOVING` | 移动中，前往目标位置 |
| `TALKING` | 对话中，与玩家交互 |

---

## AI Agent 接口

### 核心方法

```typescript
// 设置目标位置，NPC自动寻路前往
npc.setTarget(x: number, y: number): void

// 停止移动
npc.stop(): void

// 获取当前位置
npc.getPosition(): { x: number, y: number }

// 获取当前状态
npc.getState(): NPCState

// 获取NPC ID
npc.getId(): string

// 获取NPC名称
npc.getName(): string

// 进入对话状态
npc.setTalking(): void

// 进入空闲状态
npc.setIdle(): void
```

### 使用示例

```typescript
// AI Agent 控制 NPC
class NPAAgent {
    private npc: NPC;

    // AI决策循环
    async update() {
        const state = this.npc.getState();

        if (state === NPCState.IDLE) {
            // 空闲时，AI决定去某个地方
            const decision = await this.makeDecision();
            if (decision.type === 'move') {
                this.npc.setTarget(decision.x, decision.y);
            }
        }
    }
}
```

---

## 移动参数

| 参数 | 值 | 说明 |
|------|-----|------|
| 移动速度 | 150 | 物理引擎速度单位 |
| 到达阈值 | 5像素 | 距离目标小于此值视为到达 |
| 巡逻间隔 | 3秒 | 自动巡逻检查间隔 |

---

## 碰撞检测

- **检测方式**: 像素级碰撞检测，基于 `collision_mask.png`
- **白色区域**: 不可通行（碰撞体）
- **黑色区域**: 可通行
- **处理策略**: 遇到障碍物时停止移动（简化处理，后续可优化为绕行）

---

## 后续扩展

### 1. 序列帧动画
- 添加行走、站立动画
- 根据移动方向切换动画序列

### 2. 多NPC管理
- 支持创建多个NPC实例
- NPC之间避免碰撞

### 3. 高级寻路
- A*算法实现绕过障碍物
- 路径平滑处理

### 4. AI决策集成
- 接入LLM进行自主决策
- 基于性格的行为差异