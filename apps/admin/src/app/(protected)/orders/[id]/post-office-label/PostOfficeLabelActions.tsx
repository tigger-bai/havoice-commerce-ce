'use client';

import Link from 'next/link';

export function PostOfficeLabelActions({ orderId }: { orderId: string }) {
  return (
    <div className="no-print mx-auto mb-4 flex w-[210mm] max-w-full items-center justify-between px-2">
      <Link href={`/orders/${orderId}`} className="text-sm text-gray-500 hover:text-gray-800">
        ← 返回訂單
      </Link>

      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-800"
      >
        列印
      </button>
    </div>
  );
}
