export { supplierReviewRoutes } from './routes';
export { en as sprEnTranslations } from './i18n/en';
export { th as sprThTranslations } from './i18n/th';

export const SPR_FEATURE_FLAG = 'VITE_FEATURE_SUPPLIER_REVIEW';

export function isSprEnabled(): boolean {
  try {
    return import.meta.env[SPR_FEATURE_FLAG] === 'true';
  } catch {
    return false;
  }
}
