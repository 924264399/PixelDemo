import { Vector2 } from './NPC';

/**
 * 路径规划工具类
 * 基于小镇道路网络（十字路口）计算智能路径
 */
export class PathUtils {
    // 道路网络坐标（十字路口）
    private static readonly HORIZONTAL_ROAD_Y = 505; // 横向主路Y坐标 (487-523的中间值)
    private static readonly VERTICAL_ROAD_X = 507;   // 纵向主路X坐标 (485-529的中间值)

    /**
     * 计算从起点到终点的智能路径
     * @param startX 起点X坐标
     * @param startY 起点Y坐标
     * @param endX 终点X坐标
     * @param endY 终点Y坐标
     * @returns 路径点数组，按顺序执行
     */
    static calculatePath(startX: number, startY: number, endX: number, endY: number): Vector2[] {
        const path: Vector2[] = [];

        // 如果起点和终点很接近，直接移动
        const distance = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);
        if (distance < 100) {
            path.push({ x: endX, y: endY });
            return path;
        }

        // 判断是否需要使用主路
        const startOnHorizontalRoad = Math.abs(startY - this.HORIZONTAL_ROAD_Y) < 50;
        const startOnVerticalRoad = Math.abs(startX - this.VERTICAL_ROAD_X) < 50;
        const endOnHorizontalRoad = Math.abs(endY - this.HORIZONTAL_ROAD_Y) < 50;
        const endOnVerticalRoad = Math.abs(endX - this.VERTICAL_ROAD_X) < 50;

        // 如果起点或终点在主路上，简化路径
        if (startOnHorizontalRoad || endOnHorizontalRoad) {
            // 直接沿横向主路移动
            if (!startOnHorizontalRoad) {
                // 先到横向主路
                path.push({ x: startX, y: this.HORIZONTAL_ROAD_Y });
            }
            path.push({ x: endX, y: endY });
            return path;
        }

        if (startOnVerticalRoad || endOnVerticalRoad) {
            // 直接沿纵向主路移动
            if (!startOnVerticalRoad) {
                // 先到纵向主路
                path.push({ x: this.VERTICAL_ROAD_X, y: startY });
            }
            path.push({ x: endX, y: endY });
            return path;
        }

        // 复杂情况：需要经过十字路口
        // 1. 从起点到最近的主路
        const toHorizontalRoad = { x: startX, y: this.HORIZONTAL_ROAD_Y };
        const toVerticalRoad = { x: this.VERTICAL_ROAD_X, y: startY };

        // 选择更近的主路
        const distToHorizontal = Math.abs(startY - this.HORIZONTAL_ROAD_Y);
        const distToVertical = Math.abs(startX - this.VERTICAL_ROAD_X);

        if (distToHorizontal <= distToVertical) {
            // 先到横向主路
            path.push(toHorizontalRoad);
            // 再到十字路口（如果需要）
            if (Math.abs(endX - this.VERTICAL_ROAD_X) > 100) {
                path.push({ x: this.VERTICAL_ROAD_X, y: this.HORIZONTAL_ROAD_Y });
            }
        } else {
            // 先到纵向主路
            path.push(toVerticalRoad);
            // 再到十字路口（如果需要）
            if (Math.abs(endY - this.HORIZONTAL_ROAD_Y) > 100) {
                path.push({ x: this.VERTICAL_ROAD_X, y: this.HORIZONTAL_ROAD_Y });
            }
        }

        // 最后到终点
        path.push({ x: endX, y: endY });

        return path;
    }
}