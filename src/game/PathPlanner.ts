/**
 * 智能路径规划系统
 * 为AI Agent提供灵活的路径规划能力，支持多NPC避免冲突
 */

export interface Waypoint {
    x: number;
    y: number;
    name?: string;
    type?: 'building' | 'road' | 'park' | 'intersection';
}

export interface PathRequest {
    from: Waypoint;
    to: Waypoint;
    npcId?: string;
    avoidNPCs?: boolean;
    randomization?: number; // 0-1，路径随机化程度
}

export class PathPlanner {
    // 基于地图坐标文档的关键路点
    private static readonly WAYPOINTS: Map<string, Waypoint> = new Map([
        // 交通枢纽
        ['crossroads', { x: 1019, y: 1022, name: '十字路口', type: 'intersection' }],
        
        // 建筑物
        ['cafe_door', { x: 992, y: 820, name: '咖啡馆门口', type: 'building' }],
        ['cafe_work', { x: 911, y: 455, name: '咖啡馆工位', type: 'building' }],
        ['store_door', { x: 1601, y: 845, name: '便利店门口', type: 'building' }],
        ['store_work', { x: 1688, y: 620, name: '便利店工位', type: 'building' }],
        ['player_home', { x: 323, y: 1451, name: '玩家家', type: 'building' }],
        
        // 公园区域
        ['park_north', { x: 1601, y: 1103, name: '公园北入口', type: 'park' }],
        ['park_south', { x: 1142, y: 1610, name: '公园南入口', type: 'park' }],
        ['park_core', { x: 1481, y: 1601, name: '公园核心', type: 'park' }],
        
        // 道路网络（扩展的路点，支持多路径）
        ['road_cafe_h', { x: 1019, y: 820, name: '咖啡馆水平路', type: 'road' }],
        ['road_store_h', { x: 1601, y: 1022, name: '便利店水平路', type: 'road' }],
        ['road_park_v', { x: 1601, y: 1022, name: '公园垂直路', type: 'road' }],
    ]);

    // 路径网络图（邻接关系）
    private static readonly PATH_NETWORK: Map<string, string[]> = new Map([
        ['cafe_door', ['road_cafe_h']],
        ['road_cafe_h', ['cafe_door', 'crossroads']],
        ['crossroads', ['road_cafe_h', 'road_store_h', 'road_park_v']],
        ['road_store_h', ['crossroads', 'store_door', 'road_park_v']],
        ['road_park_v', ['crossroads', 'road_store_h', 'park_north']],
        ['store_door', ['road_store_h']],
        ['park_north', ['road_park_v', 'park_core', 'park_south']],
        ['park_core', ['park_north', 'park_south']],
        ['park_south', ['park_north', 'park_core']],
    ]);

    /**
     * AI Agent调用接口：规划从起点到终点的路径
     * @param request 路径请求，包含起终点和配置
     * @returns 路径点数组
     */
    static planPath(request: PathRequest): Waypoint[] {
        const { from, to, randomization = 0.3, npcId } = request;
        
        // 1. 找到最近的路网节点
        const startNode = this.findNearestWaypoint(from);
        const endNode = this.findNearestWaypoint(to);
        
        if (!startNode || !endNode) {
            return [from, to]; // 降级：直线路径
        }

        // 2. 使用A*算法找路径
        const nodePath = this.findPathAStar(startNode, endNode);
        
        // 3. 转换为具体坐标并添加随机化
        const path = this.convertToCoordinates(nodePath, randomization, npcId);
        
        // 4. 添加起点和终点
        return [from, ...path, to];
    }

    /**
     * AI Agent调用接口：获取预设的兴趣点
     */
    static getPointOfInterest(type?: string): Waypoint[] {
        const results: Waypoint[] = [];
        for (const waypoint of this.WAYPOINTS.values()) {
            if (!type || waypoint.type === type) {
                results.push(waypoint);
            }
        }
        return results;
    }

    /**
     * AI Agent调用接口：获取从某点可达的所有位置
     */
    static getAccessibleLocations(from: Waypoint): Waypoint[] {
        const nearestNode = this.findNearestWaypoint(from);
        if (!nearestNode) return [];

        const accessible: Waypoint[] = [];
        for (const [nodeId, waypoint] of this.WAYPOINTS.entries()) {
            if (nodeId !== nearestNode) {
                const path = this.findPathAStar(nearestNode, nodeId);
                if (path.length > 0) {
                    accessible.push(waypoint);
                }
            }
        }
        return accessible;
    }

    // ========== 内部实现方法 ==========

    private static findNearestWaypoint(point: Waypoint): string | null {
        let nearestNode: string | null = null;
        let minDistance = Infinity;

        for (const [nodeId, waypoint] of this.WAYPOINTS.entries()) {
            const distance = Math.sqrt(
                Math.pow(point.x - waypoint.x, 2) + Math.pow(point.y - waypoint.y, 2)
            );
            if (distance < minDistance) {
                minDistance = distance;
                nearestNode = nodeId;
            }
        }

        return nearestNode;
    }

    private static findPathAStar(startNode: string, endNode: string): string[] {
        // 简化的A*实现，使用广度优先搜索
        const queue: string[][] = [[startNode]];
        const visited = new Set<string>();

        while (queue.length > 0) {
            const path = queue.shift()!;
            const current = path[path.length - 1];

            if (current === endNode) {
                return path;
            }

            if (visited.has(current)) continue;
            visited.add(current);

            const neighbors = this.PATH_NETWORK.get(current) || [];
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor)) {
                    queue.push([...path, neighbor]);
                }
            }
        }

        return []; // 无路径
    }

    private static convertToCoordinates(
        nodePath: string[], 
        randomization: number, 
        npcId?: string
    ): Waypoint[] {
        const coordinates: Waypoint[] = [];
        
        for (let i = 0; i < nodePath.length; i++) {
            const nodeId = nodePath[i];
            const waypoint = this.WAYPOINTS.get(nodeId);
            
            if (waypoint) {
                // 添加随机偏移，避免多个NPC走完全相同的路径
                const offset = this.calculateRandomOffset(randomization, npcId, i);
                coordinates.push({
                    x: waypoint.x + offset.x,
                    y: waypoint.y + offset.y,
                    name: waypoint.name,
                    type: waypoint.type
                });
            }
        }

        return coordinates;
    }

    private static calculateRandomOffset(
        randomization: number, 
        npcId?: string, 
        pathIndex: number = 0
    ): { x: number, y: number } {
        if (randomization === 0) return { x: 0, y: 0 };

        // 基于NPC ID和路径索引生成一致的随机偏移
        const seed = this.hashString((npcId || '') + pathIndex.toString());
        const maxOffset = 30 * randomization; // 最大偏移30像素

        return {
            x: (this.seededRandom(seed) - 0.5) * maxOffset,
            y: (this.seededRandom(seed + 1) - 0.5) * maxOffset
        };
    }

    private static hashString(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 32位整数
        }
        return Math.abs(hash);
    }

    private static seededRandom(seed: number): number {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    }
}