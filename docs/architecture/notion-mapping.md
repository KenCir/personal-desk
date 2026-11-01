# Notion Mapping

## 1. 目的

このドキュメントでは、既存のNotion DatabaseとPersonal Desk Domain / Database間のMappingを定義する。

Notionは以下のSource of Truthとして扱う。

- Area
- Project
- Task
- Milestone相当情報

Personal DeskはNotion上のDataを取得し、内部DomainへNormalizeして利用する。

---

# 2. 対象Database

v0.1では以下を対象とする。

- Areas
- Projects
- Tasks

以下はPersonal Desk v0.1の主要Domain同期対象には含めない。

- Knowledge
- Inbox

必要になった時点で別途Integrationを追加する。

---

# 3. Areas Mapping

## Notion Database

`Areas`

## Personal Desk

`areas`

## Mapping

| Notion | Personal Desk | 必須 |
|---|---|---|
| Page ID | `external_id` | Yes |
| Name | `name` | Yes |
| Nameから生成したSlug | `slug` | Yes |
| Last edited time | `source_updated_at` | Yes |

## Slug

Slugは初回Import時に生成する。

例:

```text id="92fb6c"
Development
→ development

University
→ university

例大祭
→ reitaisai
```

一度生成されたSlugは、Area名変更時に自動変更しない。

---

# 4. Projects Mapping

## Notion Database

`Projects`

## Personal Desk

`projects`

## Existing Notion Properties

- Name
- Status
- Area
- Priority
- Deadline
- GitHub
- Tasks
- Notes

## Mapping

| Notion | Personal Desk | 備考 |
|---|---|---|
| Page ID | `external_id` | Notion Page ID |
| Name | `name` | Project名 |
| Status | `status` | Status Mappingを使用 |
| Area | `area_id` | Areas Relationから解決 |
| Deadline | Milestone | Project-level deadlineとして扱う |
| GitHub | Resource | GitHub Repository Resourceとして扱う |
| Priority | 未使用 | v0.1ではProject Priorityを使用しない |
| Tasks | Relation | Task同期に使用 |
| Notes | 未使用 | v0.1ではProject Detailに直接表示しない |
| Created time | `source_created_at` | 利用可能な場合 |
| Last edited time | `source_updated_at` | Provider上の更新時刻 |

---

# 5. Project Status Mapping

既存Notion Status:

```text id="wkze9p"
Planning
Active
Waiting
Paused
Done
```

Personal Desk:

```text id="m9kxoh"
planning
active
waiting
blocked
done
```

Mapping:

| Notion | Personal Desk |
|---|---|
| Planning | `planning` |
| Active | `active` |
| Waiting | `waiting` |
| Paused | `blocked` |
| Done | `done` |

`Paused`はv0.1では`blocked`へNormalizeする。

将来的に`paused`を独立Statusとして扱う必要が出た場合はDomain Specificationを再検討する。

---

# 6. Project Priority

NotionにはProject Priorityが存在するが、Personal Desk v0.1ではProject並び順に使用しない。

Personal Desk側では以下を優先する。

```text id="v6xrzw"
blocked
active
planning
waiting
```

同一Statusでは:

`meaningful_updated_at DESC`

Notion Priorityは将来利用する可能性があるため、Integration側で取得してもよいが、v0.1 Domain Fieldとして必須にはしない。

---

# 7. Project Description

Notion Projectsに専用Description Propertyが存在しない場合、v0.1ではProject Descriptionを空にしてよい。

Notion Page BodyをDescriptionとして自動利用しない。

理由:

- Page Bodyは長文・自由形式になり得る
- UI一覧向けの短いSummaryとは用途が異なる

必要になった場合はProjects Databaseに専用Summary / Description Propertyを追加する。

---

# 8. Project Deadline → Milestone

Projectsの`Deadline` PropertyはPersonal DeskではProject-level Milestoneとして扱う。

例:

```text id="pw8hkh"
Project:
大学出願・受験

Deadline:
2026/09/30
```

Normalize:

```text id="936wz1"
Milestone:
title = "Project deadline"
due_at = 2026/09/30
project = 大学出願・受験
```

## Initial Rule

ProjectにDeadlineが存在する場合、Synthetic Milestoneを1件生成する。

### Deduplication Key

例:

```text id="rt2mi6"
notion:project:<project-id>:deadline
```

## Future

複数Milestoneが必要になった場合、Notion側にMilestones Databaseを追加し、現在のSynthetic Milestone方式から移行可能とする。

---

# 9. Project GitHub → Resource

Projectsの`GitHub` PropertyはResourceへNormalizeする。

例:

```text id="en5e4p"
GitHub:
https://github.com/example/personal-desk
```

Normalize:

```text id="pzwtiu"
type = repository
category = development
provider = github
name = repository name
url = GitHub URL
is_primary = true
```

このResourceをGitHub Integrationの監視対象判定にも利用する。

---

# 10. Tasks Mapping

## Notion Database

`Tasks`

## Personal Desk

`tasks`

## Existing Properties

- Task
- Status
- Project
- Due
- Priority
- Type

## Mapping

| Notion | Personal Desk | 必須 |
|---|---|---|
| Page ID | `external_id` | Yes |
| Task | `title` | Yes |
| Status | `status` | Yes |
| Project | `project_id` | No |
| Due | `due_at` | No |
| Priority | `priority` | No |
| Type | Metadata / future use | No |
| Last edited time | `source_updated_at` | Yes |

---

# 11. Task Status Mapping

Existing Notion values:

```text id="d50f5f"
Todo
Doing
Waiting
Done
```

Personal Desk:

```text id="lcaxnt"
todo
in_progress
waiting
done
```

Database側Task Statusを以下へ調整することを推奨する。

```text id="7rfibv"
todo
in_progress
waiting
done
cancelled
```

Mapping:

| Notion | Personal Desk |
|---|---|
| Todo | `todo` |
| Doing | `in_progress` |
| Waiting | `waiting` |
| Done | `done` |

`cancelled`は将来用として保持できるが、現在のNotion StatusにはMappingしない。

---

# 12. Task Priority Mapping

Notion PriorityをPersonal DeskへそのままNormalizeする。

実際のNotion値に応じてMappingを定義する。

初期想定:

```text id="o0aq06"
Low
Medium
High
Urgent
```

Personal Desk:

```text id="31a3xx"
low
medium
high
urgent
```

存在しない場合はNULL。

---

# 13. Task Type

`Type`はv0.1のUIでは使用しない。

ただし将来利用できるよう、

- Provider-specific metadata
- または将来のDomain Field

として保持可能。

v0.1ではActivityやTodayの優先順位に使用しない。

---

# 14. Today Task Selection

Dashboard Todayでは同期されたTaskから以下を対象とする。

対象:

- 未完了
- 今日対象
- Overdue

優先順:

1. Overdue
2. Due today
3. Priority
4. Due date

`Waiting` TaskをTop Task候補に含めるかは実装時に再検討する。

初期方針では、Waitingは「現在着手できないTask」であるためTop Task候補から除外する。

---

# 15. Relations

## Project → Area

Notion Projects.Area Relationを解決し:

```text id="lz00a6"
projects.area_id
```

へ保存する。

Relation先Areaが未同期の場合、先にAreaを同期するか、後続処理でRelationを解決する。

---

## Task → Project

Notion Tasks.Project Relationを:

```text id="qgb2i5"
tasks.project_id
```

へNormalizeする。

ProjectなしTaskも許可するためNullableとする。

---

# 16. Knowledge

Notion `Knowledge` Databaseはv0.1ではPersonal Desk Domainへ同期しない。

Project DetailのResourcesやActivityとは別物として扱う。

将来的な用途候補:

- Project Notes
- Search
- Knowledge Base
- AI Context

必要になった時点でSpecificationを追加する。

---

# 17. Inbox

Notion `Inbox` Databaseはv0.1では同期対象外。

将来Personal Desk Inbox機能を実装する際にMappingを定義する。

現在のActivityとは別Domainとして扱う。

---

# 18. Meaningful Project Change

Notion Projectsの以下の変更をMeaningful Changeとする。

- Status変更
- Area変更
- Deadline変更
- Doneへの変更
- Doneからの復帰

これらが発生した場合:

- `meaningful_updated_at`更新
- 必要に応じてActivity生成

以下は原則Meaningful Changeにしない。

- Last edited timeのみ変化
- Notes Relation変更
- Page Body編集
- Formatting変更
- GitHub URLの形式調整のみ

---

# 19. Activity Generation

## Project

生成候補:

- Project created
- Project status changed
- Project completed
- Project reopened
- Important deadline changed

## Task

生成候補:

- Important Task completed

Routine Task updateはActivityにしない。

Important Taskの判定は将来拡張可能とする。

v0.1では高Priority TaskのDoneをActivity対象にするなど、限定Ruleを利用可能。

---

# 20. Deleted / Archived

Notion Pageが明示的にArchived / Deletedとなった場合、対応Normalized Entityへ:

```text id="4w4zj1"
deleted_at
```

を設定する。

単純なAPI取得失敗によってSoft Deleteしない。

---

# 21. Initial Sync Order

Notion Initial Syncは以下の順序を推奨する。

```text id="e1tbmh"
1. Areas
2. Projects
3. Tasks
4. Synthetic Milestones
5. GitHub Resources
```

理由:

ProjectがAreaへ依存し、Task / Resource / MilestoneがProjectへ依存するため。

---

# 22. Validation

同期時に以下を検証する。

## Project

Required:

- Page ID
- Name
- Status

Status Mapping不能の場合:

- Integration Errorとして記録
- Existing Dataがあれば保持
- Entityを削除しない

## Task

Required:

- Page ID
- Task title
- Status

Project Relation不明は許可する。

---

# 23. Configuration

Notion Database IDやProperty名をApplication Codeへ無秩序にハードコードしない。

Configurationとして管理する。

Conceptual example:

```text id="deoi78"
Areas database
Projects database
Tasks database

Projects:
  name property
  status property
  area property
  deadline property
  github property

Tasks:
  title property
  status property
  project property
  due property
  priority property
  type property
```

具体的なConfiguration形式は実装時に決定する。

---

# 24. v0.1 Mapping Summary

```text id="q6al8q"
Notion Areas
    ↓
areas

Notion Projects
    ├── project fields
    │      ↓
    │   projects
    │
    ├── Deadline
    │      ↓
    │   synthetic milestone
    │
    └── GitHub
           ↓
        resource

Notion Tasks
    ↓
tasks
```

---

# 25. 将来のMilestones Database

v0.1ではProjects DeadlineからSynthetic Milestoneを生成する。

ただし将来的に、

```text id="m0z9ti"
Milestones Database
```

をNotionへ追加できる。

その場合:

```text id="k8xwfa"
Projects Deadline
```

はProjectの主要期限として残すか、Milestonesへ完全移行するかを別途決定する。

Personal Desk側の`milestones` Domainはそのまま維持できるため、UIへの影響を最小化できる。

---

# 26. v0.1で同期しないもの

- Knowledge
- Inbox
- Project Notes本文
- Notion Page全文
- Notion Comments
- Notion Files
- View設定
- Page Icon
- Page Cover
- Formula結果の無差別同期
- Rollup結果の無差別同期

必要なDataだけを同期する。

---

# 27. 設計原則

1. Notion PropertyをそのままUIへ露出しない。
2. Notion StatusをPersonal Desk DomainへNormalizeする。
3. External IDをInternal IDと分離する。
4. RelationはInternal IDへ解決する。
5. Notion PriorityとPersonal Desk独自Priorityを混同しない。
6. Project Deadlineをv0.1ではSynthetic Milestoneとして扱う。
7. GitHub PropertyをResourceとして扱う。
8. Minor Notion editでProjectのMeaningful Updateを動かさない。
9. API FailureでEntityを削除しない。
10. Knowledge / Inboxは必要になるまで同期しない。