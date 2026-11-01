import { config } from 'dotenv';
import { sql } from 'drizzle-orm';
import { createDatabase } from './index';
import { createReadQueries } from './queries';
config({ path: '../../.env', quiet: true });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const connection = createDatabase(url);
  try {
    // Enforced by PostgreSQL: this command cannot insert fixtures or run migrations.
    const result = await connection.db.transaction(async (tx) => {
      await tx.execute(sql`set transaction read only`);
      const reader = createReadQueries(tx);
      const now = new Date().toISOString();
      const [projects, areas, activity, infrastructure, tasks, milestone, enumRows] =
        await Promise.all([
          reader.getProjects(),
          reader.getAreas(),
          reader.getActivities(),
          reader.getInfrastructure(),
          reader.getTodayTasks(now),
          reader.getNextMilestone(),
          tx.execute(
            sql`select enumlabel from pg_enum join pg_type on pg_enum.enumtypid = pg_type.oid where typname = 'task_status' order by enumsortorder`,
          ),
        ]);
      const project = projects[0] ?? {
        id: '00000000-0000-0000-0000-000000000000',
        slug: 'read-smoke-nonexistent-project',
      };
      const [detail, resources, projectActivity] = await Promise.all([
        reader.getProjectBySlug(project.slug),
        reader.getResources(project.id),
        reader.getActivities({ projectId: project.id }),
      ]);
      return {
        readOnly: true,
        projects: projects.length,
        areas: areas.length,
        activities: activity.items.length,
        systems: infrastructure.systems.length,
        services: infrastructure.services.length,
        backups: infrastructure.backups.length,
        activeAlerts: infrastructure.alerts.length,
        todayTasks: tasks.length,
        hasNextMilestone: !!milestone,
        projectDetailQueryExecuted: true,
        projectFound: !!detail,
        resources: resources.length,
        projectActivities: projectActivity.items.length,
        taskStatuses: enumRows.map((r) => r.enumlabel),
      };
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await connection.close();
  }
}
main().catch(() => {
  console.error(
    'Database read smoke failed. Check connectivity, DATABASE_URL, and pending migrations.',
  );
  process.exitCode = 1;
});
