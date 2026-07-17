'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

/**
 * Toast 全域通知系統
 *
 * 設計決策：
 * - 使用 React Context 提供全域 toast() 方法，任何 Client Component 皆可呼叫
 * - 支援 success / error / info / warning 四種類型
 * - 自動於指定時間後消失，亦可手動關閉
 * - 右上角堆疊顯示，附帶進入動畫
 *
 * 使用方式：
 *   const { toast } = useToast();
 *   toast.success('儲存成功');
 *   toast.error('更新失敗，請稍後再試');
 */

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

interface ToastContextValue {
  toast: ToastApi;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION = 4000;

const TYPE_CONFIG: Record<
  ToastType,
  { bg: string; icon: ReactNode; bar: string }
> = {
  success: {
    bg: 'bg-white border-l-4 border-green-500',
    bar: 'bg-green-500',
    icon: (
      <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
      </svg>
    ),
  },
  error: {
    bg: 'bg-white border-l-4 border-red-500',
    bar: 'bg-red-500',
    icon: (
      <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
      </svg>
    ),
  },
  info: {
    bg: 'bg-white border-l-4 border-blue-500',
    bar: 'bg-blue-500',
    icon: (
      <svg className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
      </svg>
    ),
  },
  warning: {
    bg: 'bg-white border-l-4 border-amber-500',
    bar: 'bg-amber-500',
    icon: (
      <svg className="h-5 w-5 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
      </svg>
    ),
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((type: ToastType, message: string) => {
    // 防禦：避免空訊息造成空白通知
    const safeMessage = (message ?? '').toString().trim() || '操作已完成';
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, type, message: safeMessage }]);
  }, []);

  const toast: ToastApi = {
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
    warning: (m) => push('warning', m),
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast 容器 */}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-3">
        {toasts.map((t) => (
          <ToastCard key={t.id} item={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const config = TYPE_CONFIG[item.type];

  useEffect(() => {
    const timer = setTimeout(onClose, TOAST_DURATION);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 overflow-hidden rounded-xl ${config.bg} p-4 shadow-lg ring-1 ring-black/5 animate-[slideIn_0.25s_ease-out]`}
      role="alert"
    >
      <span className="mt-0.5 shrink-0">{config.icon}</span>
      <p className="flex-1 text-sm font-medium text-gray-800">{item.message}</p>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 text-gray-400 transition-colors hover:text-gray-600"
        aria-label="關閉通知"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // 防禦性 fallback：即使忘記包 Provider 也不會 crash，僅退化為 console
    return {
      toast: {
        success: (m) => console.log('[toast.success]', m),
        error: (m) => console.error('[toast.error]', m),
        info: (m) => console.info('[toast.info]', m),
        warning: (m) => console.warn('[toast.warning]', m),
      },
    };
  }
  return ctx;
}
