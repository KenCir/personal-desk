import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getReadContext } from './data';
export const getProject = cache(async (slug: string) => {
  const { source, now } = getReadContext();
  const project = await source.getProjectBySlug(slug);
  if (!project) notFound();
  return { source, now, project };
});
