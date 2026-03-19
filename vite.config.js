import { defineConfig, loadEnv } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 加载环境变量
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    // 定义全局变量，将环境变量注入到浏览器
    define: {
      'process.env.AI_API_ENDPOINT': JSON.stringify(env.AI_API_ENDPOINT || 'https://api.qnaigc.com/v1/chat/completions'),
      'process.env.AI_API_KEY': JSON.stringify(env.AI_API_KEY || ''),
      'process.env.AI_MODEL': JSON.stringify(env.AI_MODEL || 'minimax/minimax-m2.1'),
    },
    server: {
      port: 3000,
      open: true,
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  };
});
