//packages/shared/src/index.ts
// ==========================================
// Schemas (Zod 驗證 Schema 與推導型別)
// ==========================================
export {
  PaginationQuerySchema,
  type PaginationQueryDTO,
  type PaginatedResponse,
} from './schemas/pagination.schema';

export {
  PublishStatusEnum,
  type PublishStatus,
  CreateArticleSchema,
  type CreateArticleDTO,
  UpdateArticleSchema,
  type UpdateArticleDTO,
  ArticleQuerySchema,
  type ArticleQueryDTO,
} from './schemas/article.schema';

export {
  CreateProductSchema,
  type CreateProductDTO,
  UpdateProductSchema,
  type UpdateProductDTO,
  ProductQuerySchema,
  type ProductQueryDTO,
} from './schemas/product.schema';

export {
  RecommendationItemSchema,
  type RecommendationItemDTO,
  SetRecommendationsSchema,
  type SetRecommendationsDTO,
} from './schemas/recommendation.schema';

export {
  RegisterSchema,
  type RegisterDTO,
  LoginSchema,
  type LoginDTO,
  type AuthTokenPayload,
  type AuthResponse,
} from './schemas/auth.schema';

export {
  ECOMMERCE_SECTION_TYPES,
  LEGACY_SECTION_TYPES,
  LAYOUT_SECTION_TYPES,
  LayoutSectionTypeEnum,
  type LayoutSectionType,
  PAGE_ROUTES,
  PageRouteEnum,
  type PageRoute,
  PAGE_ROUTE_LABELS,
  CreateLayoutSectionSchema,
  type CreateLayoutSectionDTO,
  UpdateLayoutSectionSchema,
  type UpdateLayoutSectionDTO,
  PatchLayoutSectionSchema,
  type PatchLayoutSectionDTO,
  CreateLayoutItemSchema,
  type CreateLayoutItemDTO,
  UpdateLayoutItemSchema,
  type UpdateLayoutItemDTO,
  ReorderLayoutSectionsSchema,
  type ReorderLayoutSectionsDTO,
  type CreateLayoutSectionInput,
  type CreateLayoutItemInput,
} from './schemas/layout.schema';

export {
  OrderItemInputSchema,
  type OrderItemInputDTO,
  ShippingMethodEnum,
  type ShippingMethod,
  PaymentMethodEnum,
  type PaymentMethod,
  CreateOrderSchema,
  type CreateOrderDTO,
  OrderQuerySchema,
  type OrderQueryDTO,
} from './schemas/order.schema';

// ==========================================
// Types (共用型別介面)
// ==========================================
export type {
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiResponse,
  ValidationErrorDetail,
} from './types/api-response.types';

// ==========================================
// Email 模板（共用，純函式；不含寄送邏輯與 Node 依賴）
// ==========================================
export {
  renderOrderCreatedEmail,
  renderPaymentConfirmedEmail,
  renderOrderShippedEmail,
  type OrderEmailItem,
  type OrderEmailData,
  type RenderedEmail,
} from './email/templates';

// ==========================================
// 綠界 ECPay 結帳工具（共用純函式；CheckMacValue 簽章與 payload 組裝）
// ==========================================
export {
  generateCheckMacValue,
  buildEcpayPayload,
  buildRepayMerchantTradeNo,
  parseOriginalOrderNumber,
  type EcpayItem,
  type BuildEcpayPayloadParams,
} from './ecpay/checkout';

// ==========================================
// 綠界物流工具（物流 API 使用 MD5 CheckMacValue，不能沿用金流 SHA256）
// ==========================================
export {
  buildLogisticsCheckMacEncodedSource,
  decryptLogisticsV2Data,
  encryptLogisticsV2Data,
  generateLogisticsCheckMacValue,
  runLogisticsCheckMacOfficialSelfTest,
  verifyLogisticsCheckMacValue,
  type LogisticsV2EncryptPayload,
  type LogisticsCheckMacSelfTestResult,
} from './ecpay/logistics';

// ==========================================
// 台灣地址工具
// ==========================================
export {
  TAIWAN_POSTAL_CODES,
  resolveTaiwanPostalCode,
  resolveTaiwanPostalCodeFromAddress,
} from './taiwan/postal-codes';

export {
  TAIWAN_ADDRESS_POSTAL_CODES,
  TAIWAN_ADDRESS_OPTIONS,
  getDistrictsByCity,
  getPostalCodeByDistrict,
  getTaiwanCities,
  parseTaiwanAddress,
  type ParsedTaiwanAddress,
  type TaiwanDistrictOption,
} from './taiwan-address';
