import { NextRequest } from 'next/server';
import { v2 as cloudinary } from 'cloudinary';

import { requireAdminSession } from '@/lib/auth/api-guard';
import { jsonOk, jsonError } from '@/lib/api-helpers';

/**
 * POST /api/upload
 *
 * 接收 multipart/form-data 的圖片檔，上傳至 Cloudinary 後回傳 secure_url。
 *
 * 設計決策：
 * - 安全：requireAdminSession 驗證，僅允許 ADMIN / EDITOR
 * - 防禦：server-side 再次驗證檔案存在、MIME 類型與大小（與前端一致），避免繞過前端限制
 * - 穩定性：將 Buffer 轉為 Base64 Data URI 後以 cloudinary.uploader.upload 上傳，
 *   避免 upload_stream 串流在 Next.js 14 下觸發 60 秒 Timeout (499 / 502)
 * - 所有環境變數於請求時讀取並檢查，缺漏時回傳明確錯誤而非崩潰
 */

// Cloudinary SDK 需 Node.js Runtime（使用 Buffer）
export const runtime = 'nodejs';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
  width?: number;
  height?: number;
  format?: string;
}

export async function POST(req: NextRequest) {
  // 身分與權限驗證
  const guard = await requireAdminSession();
  if (!guard.ok) {
    return jsonError(guard.status, guard.code, guard.message);
  }

  // 檢查 Cloudinary 環境變數
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    console.error('[POST /api/upload] 缺少 Cloudinary 環境變數設定');
    return jsonError(
      500,
      'CLOUDINARY_NOT_CONFIGURED',
      '圖片上傳服務尚未完成設定，請聯絡系統管理員'
    );
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  try {
    // 解析 multipart/form-data
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return jsonError(400, 'INVALID_FORM_DATA', '請求格式錯誤，請改用檔案上傳');
    }

    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return jsonError(400, 'NO_FILE', '請選擇要上傳的圖片檔案');
    }

    // server-side 防呆：MIME 類型
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return jsonError(
        400,
        'INVALID_FILE_TYPE',
        '僅支援 JPG、PNG、WebP、GIF 格式的圖片'
      );
    }

    // server-side 防呆：檔案大小
    if (file.size > MAX_FILE_SIZE) {
      return jsonError(400, 'FILE_TOO_LARGE', '圖片大小不可超過 5MB');
    }

    if (file.size === 0) {
      return jsonError(400, 'EMPTY_FILE', '檔案內容為空，請重新選擇圖片');
    }

    // 轉為 Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 組合 Base64 Data URI，改用最穩定的 uploader.upload（避免 upload_stream 串流在 Next.js 14 下觸發 Timeout）
    const fileUri = `data:${file.type};base64,${buffer.toString('base64')}`;

    const result = (await cloudinary.uploader.upload(fileUri, {
      folder: 'havoice/products',
      resource_type: 'image',
    })) as CloudinaryUploadResult;

    return jsonOk({
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width ?? null,
      height: result.height ?? null,
      format: result.format ?? null,
    });
  } catch (err) {
    console.error('[POST /api/upload] error:', err);
    return jsonError(500, 'UPLOAD_FAILED', '圖片上傳失敗，請稍後再試');
  }
}
