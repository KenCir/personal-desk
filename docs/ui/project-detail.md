# `docs/ui/project-detail.md`

## 1. 目的

1つのProjectについて、現在の状態、次のMilestone、関連Resource、Activityをまとめて確認する。

## 2. Routes

```text
/projects/[slug]
/projects/[slug]/activity
/projects/[slug]/resources
```

## 3. Header

表示:

- Project name
- Description
- Status
- Area
- Updated

Back:

`/projects`

v0.1はread-only。

## 4. Tabs

- 概要
- アクティビティ
- リソース

Default:

`概要`

## 5. Overview

Section:

1. Summary
2. Next Milestone
3. Linked Resources
4. Recent Activity

### Summary

表示:

- Status
- Area
- Updated

### Next Milestone

最も近い未完了Milestoneを1件。

### Linked Resources

Overviewでは4〜6件程度。

重要Resourceのみ表示。

### Recent Activity

最大5件。

importance >= normal。

`すべて見る`でActivity tabへ。

## 6. Activity Tab

Projectに紐づくActivityをすべて表示。

対象importance:

- low
- normal
- high
- critical

新しい順。

Category Filter:

- All
- Source Control
- Project
- Infrastructure
- Deployment
- Other

`Load more`方式を初期案とする。

## 7. Resources Tab

ResourceをProviderではなく用途別に分類。

Category:

- Development
- Documentation
- Deployment
- Monitoring
- Other

クリック時は対応する外部URLへ遷移。

v0.1ではResource編集なし。

## 8. Project-specific Infrastructure

専用Sectionは作らない。

Deployment / Monitoring Resourceとして表現する。

## 9. Tasks

v0.1ではTasks tabを作らない。

## 10. 404

存在しないProject:

`プロジェクトが見つかりません`

`プロジェクト一覧へ戻る`

## 11. v0.1受け入れ条件

- Overview / Activity / Resources
- Stable sub-route
- Recent Activity最大5件
- Overview Resource最大4〜6件
- Activity tabではlowも表示
- read-only
- Tasks tabなし
- Provider障害と404を区別