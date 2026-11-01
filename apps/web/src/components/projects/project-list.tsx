'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import {
  filterProjects,
  projectStatuses,
  type Area,
  type Project,
  type ProjectStatus,
} from '@personal-desk/core';
import { projectLabels, t } from '@personal-desk/i18n';
import { DataSection } from '../preview';
import { RelativeTime, StatusBadge } from '../shared';
import { Button } from '../ui/button';

export function ProjectRow({ project, now }: { project: Project; now: string }) {
  return (
    <Link className="project-row" href={`/projects/${project.slug}`}>
      <div className="min-w-0">
        <h3>{project.name}</h3>
        <p className="project-description truncate">{project.description}</p>
      </div>
      <span className="project-area">{project.areaName ?? t('common.none')}</span>
      <StatusBadge status={project.status} />
      <span className="project-updated">
        <RelativeTime value={project.updatedAt} now={now} />
      </span>
      <ChevronRight className="project-arrow" size={15} aria-hidden="true" />
    </Link>
  );
}
export function ProjectSection({
  status,
  projects,
  now,
  filtered,
}: {
  status: ProjectStatus;
  projects: Project[];
  now: string;
  filtered: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const open = status !== 'done' || filtered || expanded;
  return (
    <section className="project-section" aria-label={projectLabels[status]}>
      {status === 'done' ? (
        <button
          className="done-summary"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={open}
          aria-controls="done-projects"
          disabled={filtered}
        >
          <ChevronRight size={16} />
          {t('projects.done')} <small>{t('common.count', { count: projects.length })}</small>
        </button>
      ) : (
        <h2 className="section-title">
          <StatusBadge status={status} />
          <small>{projects.length}</small>
        </h2>
      )}
      {open && (
        <div className="panel" id={status === 'done' ? 'done-projects' : undefined}>
          {projects.map((project) => (
            <ProjectRow key={project.id} project={project} now={now} />
          ))}
        </div>
      )}
    </section>
  );
}
export function ProjectList({
  projects,
  areas,
  now,
}: {
  projects: Project[];
  areas: Area[];
  now: string;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ProjectStatus | ''>('');
  const [areaId, setAreaId] = useState('');
  const filtered = !!(search.trim() || status || areaId);
  const visible = filterProjects(projects, { search, status, areaId });
  const clear = () => {
    setSearch('');
    setStatus('');
    setAreaId('');
  };
  return (
    <>
      <div className="filters">
        <label className="filter-field search-field">
          <span>{t('common.search')}</span>
          <div className="search-wrap">
            <Search size={16} aria-hidden="true" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('projects.search')}
            />
          </div>
        </label>
        <label className="filter-field">
          <span>{t('projects.status')}</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus | '')}>
            <option value="">{t('common.all')}</option>
            {projectStatuses.map((s) => (
              <option key={s} value={s}>
                {projectLabels[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>{t('projects.area')}</span>
          <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
            <option value="">{t('projects.allAreas')}</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        {filtered && (
          <Button variant="ghost" onClick={clear}>
            {t('common.clear')}
          </Button>
        )}
      </div>
      <p className="result-count" role="status">
        {t('common.results', { count: visible.length })}
      </p>
      <DataSection
        name="projects"
        now={now}
        empty={!visible.length}
        emptyMessage={t(filtered ? 'projects.noMatch' : 'projects.empty')}
      >
        {projectStatuses.map((s) => {
          const group = visible.filter((p) => p.status === s);
          return group.length ? (
            <ProjectSection
              key={`${s}-${filtered}`}
              status={s}
              projects={group}
              now={now}
              filtered={filtered}
            />
          ) : null;
        })}
      </DataSection>
    </>
  );
}
