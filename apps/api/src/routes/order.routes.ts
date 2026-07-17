// apps/api/src/routes/order.routes.ts
import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import { OrderController } from '../controllers/order.controller';
import { jwtMiddleware, requireAdmin } from '../middlewares/auth.middleware'; // 🔴 修正：匯入正確的名稱

const router: ExpressRouter = Router();

// 🔴 套用正確的攔截器，防止 500 錯誤再次發生
router.post('/', jwtMiddleware, OrderController.create);

// Webhook 維持公開，不加攔截器
router.post('/ecpay-webhook', OrderController.ecpayWebhook);

// 綠界電子地圖：產生選店表單（GET）與接住門市回拋（POST），皆為公開端點
router.get('/cvs-map', OrderController.cvsMap);
router.post('/cvs-callback', OrderController.cvsCallback);

// 綠界物流（C2C 交貨便）狀態背景通知：公開端點。
// 必須置於 /:id 系列之前，避免被動態路由攜截。
router.post('/logistics-webhook', OrderController.logisticsWebhook);

router.post('/:id/repay', jwtMiddleware, OrderController.repay);

// 後台一鍵拋單：產生綠界超商 C2C 寄件代碼（需 Admin 權限）。
router.post('/:id/logistics/create', ...requireAdmin, OrderController.createLogistics);

router.get('/my', jwtMiddleware, OrderController.findMyOrders);
router.get('/:id', jwtMiddleware, OrderController.findById);
router.get('/', ...requireAdmin, OrderController.findAll);

export { router as orderRoutes };
