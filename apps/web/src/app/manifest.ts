import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Personal Desk',
    short_name: 'Desk',
    description: '日々の活動とインフラをひとつの場所に。',
    start_url: '/',
    display: 'standalone',
    background_color: '#101115',
    theme_color: '#101115',
    lang: 'ja',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
