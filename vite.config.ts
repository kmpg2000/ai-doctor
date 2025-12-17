import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    // APIキーの取得順序: Vercel標準のAPI_KEY -> ローカル設定のGEMINI_API_KEY -> 空文字
    // JSON.stringifyにundefinedを渡すと置換がスキップされ、ブラウザでクラッシュするため、必ず文字列を渡す
    const apiKey = env.API_KEY || env.GEMINI_API_KEY || '';

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(apiKey),
        'process.env.GEMINI_API_KEY': JSON.stringify(apiKey)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});