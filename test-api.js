/**
 * API测试脚本 - 验证AI服务配置
 */

// 模拟环境变量加载（实际项目中会自动加载）
const testConfig = {
    endpoint: 'https://api.qnaigc.com/v1/chat/completions',
    apiKey: 'sk-0ff2f555a6f2a42e363bd2817296caafb3b68f4a036d63cee8e2a8bd246940d1',
    model: 'minimax/minimax-m2.1'
};

/**
 * 测试API连接
 */
async function testAPIConnection() {
    console.log('🧪 开始测试API连接...');
    
    try {
        const response = await fetch(testConfig.endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${testConfig.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                stream: false,
                model: testConfig.model,
                messages: [
                    {
                        role: 'system',
                        content: '你是一个友好的AI助手。'
                    },
                    {
                        role: 'user', 
                        content: '你好，请简单介绍一下你自己。'
                    }
                ],
                temperature: 0.7,
                max_tokens: 200
            })
        });

        console.log('📡 API响应状态:', response.status, response.statusText);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ API调用失败:', errorText);
            return false;
        }

        const result = await response.json();
        console.log('✅ API调用成功!');
        console.log('📝 响应数据:', {
            choices: result.choices?.length || 0,
            content: result.choices?.[0]?.message?.content?.substring(0, 100) + '...',
            usage: result.usage
        });

        return true;

    } catch (error) {
        console.error('❌ 网络错误:', error);
        return false;
    }
}

/**
 * 测试老刘的AI人格
 */
async function testPolicePersonality() {
    console.log('👮‍♂️ 测试老刘的AI人格...');

    const policePrompt = `你是老刘，一位48岁的社区民警，从警23年。

【人物背景】
- 当警察的原因：年轻时看到邻居家被盗，发誓要保护无辜的人
- 职业亮点：三年前破获了镇上最大的电信诈骗案，挽回损失50万元
- 工作哲学：真正的警察不是抓多少坏人，而是让多少好人安心生活

【性格特征】
- 警觉性：80% | 同情心：70%
- 威严感：60% | 幽默感：40%
- 耐心：80% | 好奇心：60%

【当前状态】
- 时间：10:00 (上午 - 晨间巡逻时段)
- 心情：较好
- 精力：70%
- 警觉程度：30%

【说话风格】
- 相对正式，说话直接
- 语气温和，偶尔使用警察术语

【行为准则】
1. 对社区安全问题格外关注
2. 对违法行为保持警觉但不过度紧张  
3. 用专业知识帮助居民
4. 体现出经验丰富的警察的智慧和温度

请用老刘的身份和性格回应，保持角色一致性。`;

    try {
        const response = await fetch(testConfig.endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${testConfig.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                stream: false,
                model: testConfig.model,
                messages: [
                    {
                        role: 'system',
                        content: policePrompt
                    },
                    {
                        role: 'user',
                        content: '你好，我是新搬来的居民，想了解一下这个社区的情况。'
                    }
                ],
                temperature: 0.7,
                max_tokens: 400
            })
        });

        if (!response.ok) {
            console.error('❌ 老刘AI测试失败:', response.statusText);
            return false;
        }

        const result = await response.json();
        const reply = result.choices?.[0]?.message?.content || '';
        
        console.log('✅ 老刘AI回复:');
        console.log('💬', reply);
        console.log('📊 使用统计:', result.usage);

        // 估算成本
        const cost = ((result.usage?.prompt_tokens || 0) * 0.0001 + 
                      (result.usage?.completion_tokens || 0) * 0.0002) / 1000;
        console.log(`💰 估算成本: $${cost.toFixed(6)}`);

        return true;

    } catch (error) {
        console.error('❌ 老刘AI测试出错:', error);
        return false;
    }
}

/**
 * 运行所有测试
 */
async function runAllTests() {
    console.log('🚀 开始完整API测试流程...\n');
    
    // 基础连接测试
    const basicTest = await testAPIConnection();
    console.log('\n' + '='.repeat(50) + '\n');
    
    if (basicTest) {
        // 老刘人格测试
        const personalityTest = await testPolicePersonality();
        console.log('\n' + '='.repeat(50) + '\n');
        
        if (personalityTest) {
            console.log('🎉 所有测试通过！老刘已准备好为社区服务！');
            console.log('\n📋 下一步操作：');
            console.log('1. 在MainScene中集成PoliceNPCIntegration');
            console.log('2. 测试游戏内的NPC交互');
            console.log('3. 观察老刘的自主巡逻行为');
        } else {
            console.log('⚠️  AI人格测试失败，请检查提示词配置');
        }
    } else {
        console.log('❌ 基础连接测试失败，请检查：');
        console.log('- API密钥是否正确');
        console.log('- 网络连接是否正常');
        console.log('- API服务是否可用');
    }
}

// 如果在Node.js环境中运行
if (typeof window === 'undefined') {
    runAllTests();
}

// 导出测试函数供浏览器使用
if (typeof window !== 'undefined') {
    window.testAPI = {
        runAllTests,
        testAPIConnection,
        testPolicePersonality,
        config: testConfig
    };
    
    console.log('🌐 浏览器环境检测到');
    console.log('💡 在控制台运行: testAPI.runAllTests()');
}
