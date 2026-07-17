// apps/api/src/app.ts
// 必須最先載入環境變數，確保後續所有模組讀得到 process.env
import './config/env';

import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser'; // 🔴 1. 引入 cookie-parser

import { buildCorsOptions } from './config/cors';

import { articleRouter } from './routes/article.routes';
import { productRouter } from './routes/product.routes';
import { recommendationRouter } from './routes/recommendation.routes';
import { layoutRouter } from './routes/layout.routes';
import { authRoutes } from './routes/auth.routes';
import { orderRoutes } from './routes/order.routes';
import { globalErrorHandler } from './middlewares/error-handler.middleware';

/**
 * Express 應用程式工廠
 *
 * 設計決策：
 * - 將 app 建立邏輯與 server 啟動邏輯分離，便於測試
 * - 中間件按安全性 → 日誌 → 解析 → 路由 → 錯誤處理的順序掛載
 */
const app: Express = express();

// ─── 安全性中間件 ───
app.use(helmet());
// ⚠️ 溫馨提醒：production 必須透過 CORS_ORIGIN 明確設定允許的前後台網域。
app.use(cors(buildCorsOptions()));

// ─── 日誌中間件 ───
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── 請求解析中間件 ───
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); // 🔴 2. 掛載 cookie 攔截與解析器 (這行是打通身分驗證的關鍵！)

// ─── 健康檢查端點 ───
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
    },
  });
});

// ─── 業務路由 ───
app.use('/api/auth', authRoutes);
app.use('/api/articles', articleRouter);
app.use('/api/products', productRouter);
app.use('/api/articles', recommendationRouter); // 掛載在 /api/articles/:articleId/recommendations
app.use('/api/orders', orderRoutes);
app.use('/api/layouts', layoutRouter);

// ─── 404 處理 ───
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: '請求的 API 端點不存在',
    },
  });
});

// ─── 全域錯誤處理（必須放在所有路由之後） ───
app.use(globalErrorHandler);

export { app };