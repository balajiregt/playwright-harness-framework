// Only emit fixed diagnostic codes, never provider messages, headers or keys.
export function gatewayErrorCode(error: unknown): string {
  const item = error as { message?: unknown; statusCode?: unknown };
  const message = typeof item?.message === 'string' ? item.message : '';
  if (/valid credit card on file/i.test(message)) return 'billing_verification_required';
  if (typeof item?.statusCode === 'number') return `http_${item.statusCode}`;
  return 'request_failed';
}
