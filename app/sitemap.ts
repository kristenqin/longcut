import { MetadataRoute } from 'next';
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: 'https://longcut.ai',
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0
    },
    {
      url: 'https://longcut.ai/settings',
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6
    },
    {
      url: 'https://longcut.ai/privacy',
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3
    },
    {
      url: 'https://longcut.ai/terms',
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3
    }
  ];

  return staticPages;
}

// Revalidate sitemap every hour
export const revalidate = 3600;
