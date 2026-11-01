import { resourceCategories, type Resource } from '@personal-desk/core';
import { resourceLabels, t } from '@personal-desk/i18n';
import { DataSection } from '../preview';
import { ExternalLink, Panel } from '../shared';
export function ResourceRows({ resources }: { resources: Resource[] }) {
  return (
    <>
      {resources.map((r) => (
        <div className="resource-row" key={r.id}>
          <ExternalLink href={r.url}>{r.name}</ExternalLink>
          <p>
            {r.provider}
            {r.description ? ` · ${r.description}` : ''}
          </p>
        </div>
      ))}
    </>
  );
}
export function ResourceList({ resources, now }: { resources: Resource[]; now: string }) {
  return (
    <DataSection
      name="resources"
      now={now}
      empty={!resources.length}
      emptyMessage={t('project.noResources')}
    >
      <div className="page-stack">
        {resourceCategories.map((category) => {
          const group = resources
            .filter((r) => r.category === category)
            .sort((a, b) => a.sortOrder - b.sortOrder);
          return group.length ? (
            <Panel title={resourceLabels[category]} key={category}>
              <ResourceRows resources={group} />
            </Panel>
          ) : null;
        })}
      </div>
    </DataSection>
  );
}
