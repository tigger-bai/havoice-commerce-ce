// apps/api/src/server.ts
// 於最早期載入環境變數
import './config/env';
import { app } from './app';

const PORT = process.env.API_PORT || 4000;

/**
 * 伺服器啟動入口
 *
 * 設計決策：
 * - 與 app.ts 分離，確保測試時可直接 import app 而無需啟動監聽
 * - 註冊 unhandledRejection 與 uncaughtException 處理器，避免靜默崩潰
 */
const server = app.listen(PORT, () => {
  console.log(`🚀 [API] Server is running on http://localhost:${PORT}`);
  console.log(`📋 [API] Health check: http://localhost:${PORT}/api/health`);
  console.log(`🌍 [API] Environment: ${process.env.NODE_ENV || 'development'}`);
});

// ─── 優雅關閉 (Graceful Shutdown) ───
process.on('SIGTERM', () => {
  console.log('🛑 [API] SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('✅ [API] Server closed.');
    process.exit(0);
  });
});

process.on('unhandledRejection', (reason: unknown) => {
  console.error('❌ [API] Unhandled Rejection:', reason);
  server.close(() => process.exit(1));
});

process.on('uncaughtException', (error: Error) => {
  console.error('❌ [API] Uncaught Exception:', error);
  server.close(() => process.exit(1));
});
