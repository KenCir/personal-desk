# `docs/ui/dashboard.md`

## 1. 目的

Personal Deskを開いたときに、現在の予定、タスク、直近の期限、進行中のプロジェクト、最近のActivity、Infrastructureの状態を10秒程度で把握できる画面とする。

Dashboardは詳細情報を網羅する場所ではなく、現在の状況を把握し、必要な詳細画面へ移動するための入口とする。

## 2. Route

`/`

## 3. レイアウト

- Desktop first
- 基準幅: `1440px`
- Content max-width: `1600px`
- Sidebar: `240px`
- Main padding: `24px`
- Grid gap: `16px`

```text
┌──────────────┬─────────────────────────────────────────────┐
│ Sidebar      │ ダッシュボード                             │
│              │                                             │
│              │ ┌────────────────────┬───────────────────┐ │
│              │ │ Today              │ Infrastructure    │ │
│              │ │ 7 / 12             │ 5 / 12            │ │
│              │ └────────────────────┴───────────────────┘ │
│              │                                             │
│              │ ┌─────────────────────────────────────────┐ │
│              │ │ Active Projects                         │ │
│              │ └─────────────────────────────────────────┘ │
│              │                                             │
│              │ ┌─────────────────────────────────────────┐ │
│              │ │ Recent Activity                         │ │
│              │ └─────────────────────────────────────────┘ │
└──────────────┴─────────────────────────────────────────────┘
```

## 4. Responsive

### 1440px以上

- Sidebar展開
- Today / Infrastructureを7:5で横並び

### 1280px〜1439px

- Sidebar展開
- レイアウトは基本維持
- 必要に応じて内部paddingを縮小

### 1280px未満

- Sidebarを自動collapse
- Today / Infrastructureは必要なら縦積み
- ページ全体の横スクロールは発生させない

モバイル専用UIはv0.1対象外。

## 5. Sidebar

表示項目:

- Dashboard
- Projects
- Activity
- Infrastructure
- Settings

将来追加:

- Inbox
- Calendar
- Search

現在Routeを明確に表示する。

## 6. Theme

対応:

- Dark
- Light
- System

Default:

`Dark`

色だけで状態を表現しない。

## 7. Today

Todayは以下の3ブロックで構成する。

### Next Event

今日の現在時刻以降で、最も開始時刻が近いEventを1件表示する。

表示:

- Event名
- 開始時刻
- 開始までの相対時間

空の場合:

`今日はこのあとの予定はありません。`

### Tasks

表示:

- 今日対象の未完了Task数
- 次に着手するTask 1件

Top Taskの優先順:

1. 期限超過
2. 今日締切
3. Task側にPriorityがあればそのPriority
4. 締切が近いもの

AIによる優先順位付けはv0.1では使用しない。

### Deadline

最も近いProject-level milestoneを1件表示する。

例:

- 出願締切
- リリース日
- イベント開催日
- 提出期限

表示:

- Project
- Milestone名
- 日付
- 残り日数

Project名クリック時:

`/projects/[slug]`

## 8. Infrastructure

表示対象例:

- VPS
- Raspberry Pi
- Immich
- Nextcloud
- Backup

表示状態:

- 正常
- 警告
- 停止
- 不明
- Stale
- Fetch Error

Statusはアイコン + 色 + 文字で表示する。

### Stale

最後の正常な更新から5分以上経過した場合、Staleとする。

StaleはDownとは区別する。

### Backup

表示する:

- 最終成功時刻
- Failure
- Recovery

CPU/RAMの詳細グラフはDashboardには表示しない。

## 9. Active Projects

最大:

`5件`

対象Status:

- blocked
- active
- planning
- waiting

`done` は除外する。

並び順:

1. blocked
2. active
3. planning
4. waiting

同一Status内:

`updatedAt DESC`

表示:

- Project名
- Description 1行
- Area
- Status
- 最終更新

`すべて見る` → `/projects`

## 10. Recent Activity

最大:

`5件`

対象:

- importance >= normal
- 7日以内

並び:

`occurredAt DESC`

Routine eventで埋めない。

表示階層:

1. 何が起きたか
2. 関連Project/System
3. 時刻
4. Provider

## 11. Loading / Empty / Error

各Sectionは独立して状態を持つ。

Providerの一部が失敗してもDashboard全体をErrorにしない。

Fetch FailureとEmptyを必ず区別する。

## 12. Accessibility

- Keyboard navigation対応
- Visible focus
- 状態を色だけで表現しない
- `prefers-reduced-motion` 対応

## 13. v0.1受け入れ条件

- 1440pxで快適に利用できる
- 13-inch MacBook Airで利用できる
- 1280px未満でSidebarが自動collapseする
- Dark / Light / System対応
- TodayにEvent / Task / Deadlineが表示できる
- Infrastructure stale 5分判定がある
- Project最大5件
- Activity最大5件、7日以内、normal以上
- Provider部分障害時も他Sectionが利用可能


# ドキュメント間の責務

## `docs/ui`

答える質問:

> ユーザーにはどう見え、どう操作できるか？

実装技術を書かない。

## `docs/specifications`

答える質問:

> Personal DeskにおいてProject / Activity / Resource等は何を意味するか？

複数画面で共有するDomain Ruleを置く。

## `docs/architecture`

答える質問:

> それを技術的にどう実現するか？

Framework、DB、Integration、i18nなどを置く。

## 参照関係

```text
UI Specification
       │
       ▼
Domain Specifications
       │
       ▼
Architecture
```

画面固有ルールはUIへ、複数画面で共有する概念はSpecificationsへ、コードやInfrastructureに関する決定はArchitectureへ置く。