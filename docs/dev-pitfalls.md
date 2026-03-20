
# 哑巴镇开发坑点备忘

> 只记非显而易见的坑，显而易见的不写。

---

## 1. PathPlanner 是唯一路径规划入口

**所有 NPC 的移动必须通过 `PathPlanner.planPath()` 规划，不允许手写中继点逻辑。**

- 门禁约束（公园必须过大门）、路网约束都在 `PathPlanner` 里统一处理
- 加了新区域/新规则只改 `PathPlanner.ts` 一处，所有 NPC 自动生效
- 不要像早期 `buildPath()`/`buildWangPath()` 那样在 NPC 文件里手写路网逻辑

```
正确调用方式：
PathPlanner.planPath({ from, to, npcId, randomization: 0.2 })
返回值第一个点是 from 本身，用 planned.slice(1) 跳过
```

---

## 2. 公园门禁约束（Zone Gateway）

**文件：`src/game/PathPlanner.ts` → `ZONES` 数组**

公园区域包围盒：`x: 1100~1850, y: 1100~1850`，唯一网关：`park_north(1601, 1103)`

### 关键坑：`park_north` 自身在区域包围盒内

`park_north` 的 y=1103 ≥ 区域下界 1100，会被 `getZoneForPoint` 判定为"在公园内"。  
若不排除，规划"→ park_north"时会无限递归崩溃。

**修复机制**（已实现，不要删）：
```typescript
const isToGateway = toZone
    ? (gw.x === to.x && gw.y === to.y)  // 终点本身就是网关 → 跳过约束
    : false;
```

### 巡逻目标只写终点，不要手动插入 `park_north`

```typescript
// ✅ 正确：只写 PARK_CORE，PathPlanner 自动插入大门
const PATROL_DESTINATIONS = [WAYPOINTS.PARK_CORE, ...];

// ❌ 错误：手动列 PARK_NORTH + PARK_CORE，随机抽到 PARK_NORTH 会停在门口
const PATROL_DESTINATIONS = [WAYPOINTS.PARK_NORTH, WAYPOINTS.PARK_CORE, ...];
```

---

## 3. NPC 停在路口不动——必查 waypointQueue 逻辑

症状：NPC 走到某个中间节点后停住，不继续巡逻也不出警。

**常见原因**：
- `PathPlanner.planPath()` 内部递归崩溃（返回空数组或抛异常），`waypointQueue` 为空
- `advanceQueue()` 在 NPC 不是 `IDLE` 状态时直接 return，漏掉推进时机

**排查方式**：浏览器控制台搜 `Maximum call stack` 或 `planPath` 相关报错。

---

## 4. LPC 精灵动画规范

**文件：`src/game/LPCSprite.ts`**

| 参数 | 值 |
|---|---|
| 精灵表列数 | 13 列（每行 832px） |
| walk 动画起始行 | Row 8（不是 Row 0）|
| walk 帧数 | 9 帧/方向 |
| 方向顺序 | Row 8=Up, 9=Left, 10=Down, 11=Right |
| 角色缩放 | 1.5x（统一，不要单独改某个 NPC）|

---

## 5. NPC 碰撞系统

**文件：`src/game/NPC.ts`**

- 使用**4 点脚部包围盒**检测，不是单点
- 卡住检测用**距离进度**（`distanceToTarget` 变化 < 2px 超过 90 帧触发脱困），不用坐标偏移
- 转角滑动：被挡时在垂直轴尝试 [4, 8, 12]px 微调（Corner Correction）

---

## 6. NPC 对话与状态机冻结

**文件：`src/agents/SimplePoliceNPC.ts` / `NightPoliceNPC.ts`**

- 对话期间必须调 `pausePatrol()` 冻结状态机，否则 `update()` 会在对话中途乱改状态
- 对话结束必须调 `resumePatrol()`，它负责处理 `pendingDispatch`（对话中触发的出警）
- `NPC.stop()` 与 Phaser `Sprite.stop()` 冲突，已重命名为 `stopMoving()`

---

## 7. 老刘 vs 老王分工

| | 老刘 `SimplePoliceNPC.ts` | 老王 `NightPoliceNPC.ts` |
|---|---|---|
| 上班时间 | 10:00-22:00 | 22:00-10:00 |
| 入镇方向 | 镇西（x < 650） | 镇东（x > 1750） |
| 交接信息 | 写入 `ShiftHandoffPool` | 从 `ShiftHandoffPool` 读取 |
| 路径规划 | `buildPath()` → `PathPlanner` | `buildWangPath()` → `PathPlanner` |

**两人路径逻辑必须保持一致**——改了一个记得同步另一个。  
（长期方案：合并成同一个基类，消除重复代码）

---

## 8. 屋顶遮罩采样

- 室内/室外遮罩是独立的 `Canvas ImageData`，按**每栋建筑独立采样**
- 遮罩图和地图层叠关系：屋顶层默认显示，进入建筑像素范围后隐藏对应建筑屋顶
- 不要用全局单一遮罩，会导致所有建筑同时显隐

---

## 9. 路网节点说明

```
crossroads(1019, 1022)      十字路口，核心中转
road_cafe_h(1019, 820)      咖啡馆水平路
road_store_h / road_park_v  同一坐标(1601,1022)，连接便利店和公园
cafe_door(992, 820)         咖啡馆门口
store_door(1601, 845)       便利店门口
park_north(1601, 1103)      公园大门（其中一个进出口）
park_core(1481, 1601)       公园核心（喷泉）
park_south(1142, 1610)      公园南侧

孤立节点（不在路网邻接表）：player_home, cafe_work, store_work
→ findNearestWaypoint 会自动跳过这些节点
```
