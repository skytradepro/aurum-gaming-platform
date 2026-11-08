import type { MetadataRoute } from 'next';

/** The HANNIBAL app: the website installed on the phone's home screen (iPhone and Samsung / Android). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'HANNIBAL',
    short_name: 'HANNIBAL',
    description: 'HANNIBAL — casino and sports betting',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0b0806',
    theme_color: '#0b0806',
    icons: [
      { src: '/media/app/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/media/app/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/media/app/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/media/app/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
