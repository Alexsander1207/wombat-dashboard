import type { LoadedBundle } from '../bundle/contract.ts';

/** English presentation only. Never changes verified bundle values. */
export function areaName(bundle: Pick<LoadedBundle, 'aoiId' | 'manifest'>): string {
  if (bundle.aoiId === 'tailandia-01') return 'Central Thailand plain, west of Ayutthaya';
  if (bundle.aoiId === 'piura-demo') return 'Piura demo area';
  return bundle.manifest.aoiName;
}
export function englishDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
  return `${day}, ${time} UTC`;
}
export function englishStatus(status: string): string {
  return ({ review_high: 'Check first', review_medium: 'Check next', review_low: 'Lower priority', insufficient_quality: 'Not enough usable data' } as Record<string, string>)[status] ?? status;
}
export function englishRank(rank: number | null): string { return rank === null ? 'Not ranked' : `#${rank}`; }
export function friendlyError(message: string): string {
  const mismatch = message.match(/(\d+) de (\d+) archivo/);
  if (mismatch) return `File check failed: ${mismatch[1]} of ${mismatch[2]} files do not match. No data is shown.`;
  if (/no verifican/.test(message)) return 'Signature check failed. No data is shown.';
  if (/emisores no autorizados/.test(message)) return 'The signer is not trusted. No data is shown.';
  if (/incompleta|TTL|expired/.test(message)) return 'The data checks did not finish successfully, or the data has expired. No data is shown.';
  if (/No se pudo leer|HTTP/.test(message)) return 'We could not download the data. Please try again.';
  return /^[\u0020-\u007E]*$/.test(message) && /unavailable|failed|error|fetch/i.test(message) ? message : 'We could not check this data. Please try again.';
}
