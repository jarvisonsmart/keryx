/**
 * The out-of-spec PWA deep link (`?domain=&p=`): read it once and drop the
 * params, so a reload does not re-trigger pairing. The apps have none.
 */
import { joinUrlFromDeepLink } from './payload';

export function takeDeepLink(): string | null {
  if (typeof window === 'undefined' || !window.location?.search) return null;
  const params = new URLSearchParams(window.location.search);
  const domain = params.get('domain');
  if (!domain) return null;
  const url = joinUrlFromDeepLink(domain, params.get('p'));
  if (url) history.replaceState(null, '', window.location.pathname + window.location.hash);
  return url;
}
