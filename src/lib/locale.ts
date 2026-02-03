import { cookies, headers } from 'next/headers';

export async function getLocale(): Promise<string> {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get('NEXT_LOCALE');

  if (localeCookie?.value) {
    return localeCookie.value;
  }

  // Fallback to browser language detection
  const headersList = await headers();
  const acceptLanguage = headersList.get('accept-language');

  if (acceptLanguage) {
    const browserLang = acceptLanguage.split(',')[0].split('-')[0];
    if (browserLang === 'zh') {
      return 'zh';
    }
  }

  return 'en'; // Default fallback
}
