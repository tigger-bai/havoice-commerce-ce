import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem } from '@/types';

/**
 * useCartStore - Zustand 購物車狀態管理
 *
 * 設計決策：
 * - 使用 `persist` 中間件將購物車資料持久化至 localStorage
 * - 提供完整的 CRUD 操作：加入、更新數量、移除、清空
 * - 計算衍生狀態：總金額、總數量
 * - 管理 Drawer 的開關狀態
 */

interface CartState {
  items: CartItem[];
  isDrawerOpen: boolean;

  // Actions
  addItem: (item: Omit<CartItem, 'quantity'>) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  toggleDrawer: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;

  // Computed
  getTotalPrice: () => number;
  getTotalItems: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      isDrawerOpen: false,

      addItem: (newItem) => {
        const { items } = get();
        const existingItem = items.find(
          (item) => item.productId === newItem.productId
        );

        if (existingItem) {
          // 商品已存在：增加數量
          set({
            items: items.map((item) =>
              item.productId === newItem.productId
                ? { ...item, quantity: item.quantity + 1 }
                : item
            ),
          });
        } else {
          // 新商品：加入購物車
          set({ items: [...items, { ...newItem, quantity: 1 }] });
        }

        // 加入後自動開啟 Drawer
        set({ isDrawerOpen: true });
      },

      removeItem: (productId) => {
        set({
          items: get().items.filter((item) => item.productId !== productId),
        });
      },

      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          // 數量為 0 時自動移除
          get().removeItem(productId);
          return;
        }

        set({
          items: get().items.map((item) =>
            item.productId === productId ? { ...item, quantity } : item
          ),
        });
      },

      clearCart: () => {
        set({ items: [] });
      },

      toggleDrawer: () => {
        set({ isDrawerOpen: !get().isDrawerOpen });
      },

      openDrawer: () => {
        set({ isDrawerOpen: true });
      },

      closeDrawer: () => {
        set({ isDrawerOpen: false });
      },

      getTotalPrice: () => {
        return get().items.reduce(
          (total, item) => total + item.price * item.quantity,
          0
        );
      },

      getTotalItems: () => {
        return get().items.reduce((total, item) => total + item.quantity, 0);
      },
    }),
    {
      name: 'havoice-cart',
      // 僅持久化 items，不持久化 Drawer 狀態
      partialize: (state) => ({ items: state.items }),
    }
  )
);
