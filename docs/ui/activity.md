# Activity

## 1. 目的

Personal Desk全体で最近何が起きたかを、ProjectやCategoryを横断して時系列で確認できる画面とする。

DashboardのRecent Activityより詳細で、Project DetailのActivityより広い範囲を扱う。

この画面ではRoutineなActivityを含め、Personal Deskに記録されているActivityを必要に応じて検索・絞り込みできるようにする。

---

## 2. Route

`/activity`

---

## 3. 基本レイアウト

Activityは時系列を追いやすい1列のTimeline形式で表示する。

```text
┌──────────────┬───────────────────────────────────────────────────────┐
│              │ アクティビティ                                      │
│              │                                                       │
│              │ [ Search... ] [ Category ▼ ] [ Importance ▼ ]       │
│ Sidebar      │               [ Project ▼ ]                           │
│              │                                                       │
│              │ 今日                                                  │
│              │ ───────────────────────────────────────────────────   │
│              │ 09:42                                                 │
│              │ CI failed                                             │
│              │ Build #124 failed on main                             │
│              │ Personal Desk         GitHub      High               │
│              │                                                       │
│              │ 08:15                                                 │
│              │ Project status changed                                │
│              │ Planning → Active                                     │
│              │ Personal Desk         Project     Normal             │
│              │                                                       │
│              │ 昨日                                                  │
│              │ ───────────────────────────────────────────────────   │
│              │ ...                                                   │
│              │                                                       │
│              │                  [ さらに読み込む ]                   │
└──────────────┴───────────────────────────────────────────────────────┘
```

### レイアウト方針

- Desktop first
- 1列Timeline
- Content max-widthはGlobal UI specificationに従う
- SidebarはGlobal UI specificationに従う
- Filterは画面幅に応じて折り返し可能
- Activity自体はカードGridにしない

---

## 4. 表示対象

Activity画面では、すべてのImportanceを表示対象とする。

対象:

- low
- normal
- high
- critical

Dashboardでは`normal`以上のみ表示するが、Activity画面ではRoutineなActivityも確認できる。

具体的なActivityの分類・Importance定義は`docs/specifications/activity.md`に従う。

---

## 5. Search

### 目的

Activityの内容や関連Projectから目的の履歴を探せるようにする。

### 検索対象

- Activity title
- Activity description
- Project name

### 動作

Searchはリアルタイムで結果を更新する。

空文字の場合は通常のActivity一覧に戻す。

Searchは以下のFilterとAND条件で組み合わせる。

- Category
- Importance
- Project

### Example

```text
Search: CI
Category: Source Control
Importance: High
Project: Personal Desk
```

すべての条件を満たすActivityのみ表示する。

---

## 6. Category Filter

### 選択肢

```text
すべて
Source Control
Project
Infrastructure
Deployment
Other
```

### Internal Category

具体的なCategory定義は`docs/specifications/activity.md`に従う。

UIでは技術的なProviderそのものより、Activityの用途・意味によるCategoryを優先する。

### Default

`すべて`

### 選択方法

v0.1では単一選択とする。

複数Category同時選択は不要。

---

## 7. Importance Filter

### 選択肢

```text
すべて
Critical
High
Normal
Low
```

### Default

`すべて`

### 動作

選択したImportanceのActivityだけを表示する。

v0.1では単一選択とする。

### 表示

ImportanceはBadge等で表示してよいが、色だけに依存しない。

必ず文字でも表示する。

例:

```text
Critical
High
Normal
Low
```

---

## 8. Project Filter

### 目的

特定Projectに関連するActivityだけを横断Activity画面から確認する。

### 選択肢

```text
すべてのプロジェクト
<available Projects...>
```

### Default

`すべてのプロジェクト`

### 動作

1つのProjectを選択する。

Area単位でのFilterはv0.1では実装しない。

---

## 9. Provider Filter

Provider Filterはv0.1では実装しない。

理由:

Personal DeskではGitHub、Notion、Prometheus等のサービス名そのものより、

- Source Control
- Project
- Infrastructure
- Deployment

といったCategoryでActivityを扱うことを優先するため。

ProviderはActivity Row内の補助情報として表示する。

---

## 10. Date Grouping

Activityは日付単位でGroup化する。

### 表示ルール

当日:

`今日`

前日:

`昨日`

それ以前:

`YYYY/MM/DD`

例:

```text
今日

昨日

2026/09/15

2026/09/14
```

### Ordering

Group:

新しい日付順。

Group内:

`occurredAt DESC`

---

## 11. Activity Row

### 目的

1件のActivityについて、

- 何が起きたか
- どこに関係するか
- いつ起きたか
- どのSourceから来たか
- 重要度

を短時間で把握できるようにする。

### Example

```text
09:42

CI failed
Build #124 failed on main

Personal Desk
GitHub                          High
```

### 表示内容

- Time
- Title
- Description
- Related Project または System
- Provider
- Importance

### 表示優先順位

1. Title
2. Description
3. Related Project / System
4. Timestamp
5. Provider
6. Importance

Providerは主情報ではなく補助情報として扱う。

---

## 12. Description

Descriptionは任意。

### 表示方針

- 1〜2行程度
- 長すぎる内容は省略
- Activity一覧上で全文を表示しない
- 詳細情報が外部Sourceにある場合は遷移先で確認する

Descriptionがない場合は余白を残さない。

---

## 13. Timestamp

各Activity Rowでは時刻を表示する。

例:

```text
09:42
```

日付はGroup Headerで表現する。

必要に応じてHover等で絶対日時を表示してよい。

例:

```text
2026/09/17 09:42:18
```

日時表示ルールは`docs/specifications/datetime.md`に従う。

---

## 14. Activity Interaction

Activityがクリック可能な場合、次の優先順位で遷移する。

### 1. Personal Desk内部の関連ページ

例:

Project関連:

`/projects/[slug]`

Infrastructure関連:

`/infrastructure`

### 2. External URL

Personal Desk内部に適切なDestinationがない場合、Source側のURLへ遷移する。

例:

- GitHub PR
- GitHub Issue
- CI run

### Non-interactive Activity

関連DestinationがないActivityはクリック不可でもよい。

クリック可能かどうかが視覚的に分かるようにする。

---

## 15. Initial Load

初期表示件数:

`30件`

現在のFilter/Search条件を適用した結果から新しい順に30件取得する。

---

## 16. Load More

v0.1ではPaginationやInfinite Scrollではなく、

`さらに読み込む`

を使用する。

### Behavior

クリックすると次のActivityを追加表示する。

初期案:

`30件ずつ`

### End

追加Activityがない場合、Buttonは表示しない。

または非活性状態にする。

---

## 17. Infinite Scroll

Infinite Scrollはv0.1では使用しない。

理由:

- ユーザーが現在位置を把握しやすい
- 意図せず大量のActivityを読み込まない
- Keyboard navigationを単純に保てる

---

## 18. Filter変更時

FilterまたはSearch条件が変更された場合:

- Activity一覧を新しい条件で更新する
- 表示位置は一覧上部へ戻してよい
- Load More状態はリセットする
- 初期30件から再表示する

---

## 19. Filter Clear

複数のFilter/Searchが適用されている場合、まとめて解除できるActionを提供してよい。

例:

`フィルタをクリア`

Clear後:

- Search = empty
- Category = All
- Importance = All
- Project = All Projects

---

## 20. Loading State

### Initial Loading

Activity Rowと同程度の高さを持つSkeletonを表示する。

Timeline全体の大きなLayout Shiftを避ける。

### Load More

既存Activityはそのまま表示し、

一覧末尾で追加Loading状態を表示する。

画面全体をSkeletonへ戻さない。

### Filter変更

既存データを残しながら更新するか、一覧部分のみLoading状態にする。

Page HeaderやFilter UIまで消さない。

---

## 21. Empty State

### Activityが存在しない場合

```text
アクティビティはまだありません。
```

### Filter/Search結果が0件の場合

```text
条件に一致するアクティビティがありません。

[ フィルタをクリア ]
```

EmptyとFetch Errorを明確に区別する。

---

## 22. Error State

Activityを取得できない場合:

```text
アクティビティを取得できませんでした。

[ 再試行 ]
```

### Cached Data

利用可能なCached Activityがある場合:

- Cached Activityを表示し続ける
- 最新データを取得できないことを警告する
- 最終正常更新時刻を表示してよい

例:

```text
最新のアクティビティを取得できませんでした。
最終更新: 09:42
```

Fetch FailureをActivity 0件として扱わない。

---

## 23. Partial Provider Failure

特定Providerから最新Activityを取得できない場合でも、取得可能なActivityは表示する。

例:

GitHub取得失敗時でも、

- Project Activity
- Infrastructure Activity

などが取得可能なら表示する。

必要に応じて非破壊的な警告を表示する。

Activity画面全体をErrorにしない。

---

## 24. Responsive Behavior

### 1440px以上

- Sidebar展開
- Search / Category / Importance / Projectを1行で表示可能
- Timelineは1列

### 1280px〜1439px

- Sidebar展開
- Filterは可能な限り1行を維持
- Timelineは1列

### 1280px未満

- Sidebar自動collapse
- Filterは複数行へwrap可能
- Search fieldは十分な幅を確保する
- Timelineは1列を維持する

### Mobile

モバイル専用UXはv0.1対象外。

---

## 25. Theme

Global Theme specificationに従う。

対応:

- Dark
- Light
- System

Default:

`Dark`

以下がすべてのThemeで明確に判別できること。

- Group Header
- Activity Row
- Importance
- Interactive / non-interactive Activity
- Focus state
- Filter state

---

## 26. Accessibility

### Keyboard

以下はKeyboard操作可能とする。

- Search
- Category Filter
- Importance Filter
- Project Filter
- Activity link
- Load More
- Retry
- Clear Filter

### Focus

すべてのInteractive elementにVisible Focusを表示する。

### Importance

色だけでImportanceを表現しない。

必ず文字Labelを表示する。

### Timeline

Screen Reader利用時にもActivityの順序と内容が理解できる構造にする。

### Reduced Motion

不要なAnimationを避ける。

Animationを使用する場合は`prefers-reduced-motion`を尊重する。

---

## 27. Navigation

### Incoming

Activity画面へは以下から遷移できる。

- Sidebar
- Dashboard Recent Activity の `すべて見る`
- 将来のSearch / Command Palette

### Outgoing

Activity内容に応じて:

- `/projects/[slug]`
- `/infrastructure`
- External Provider URL

へ遷移する。

---

## 28. Out of Scope for v0.1

Activity画面では以下を実装しない。

- Provider専用Filter
- Area Filter
- 複数Category同時選択
- 複数Importance同時選択
- Saved Filter
- Custom Filter Preset
- Activity editing
- Activity deletion
- Manual Activity creation
- Activity importance editing
- Activity grouping/deduplication UI
- Infinite Scroll
- Full Activity detail page
- AI summary
- AI anomaly detection
- Export
- Mobile-specific UX

---

## 29. v0.1 Acceptance Criteria

Activity v0.1は以下を満たした場合に完成とする。

1. `/activity`でPersonal Desk全体のActivityを表示できる。
2. `low`、`normal`、`high`、`critical`をすべて表示できる。
3. Activityは`occurredAt DESC`で表示される。
4. Activityは日付単位でGroup化される。
5. 当日は`今日`と表示される。
6. 前日は`昨日`と表示される。
7. それ以前は日付表示になる。
8. Searchが利用できる。
9. Search対象にTitle、Description、Project名を含む。
10. Category Filterが利用できる。
11. Importance Filterが利用できる。
12. Project Filterが利用できる。
13. Searchと各Filterを組み合わせられる。
14. Provider Filterは実装しない。
15. 初期表示は30件とする。
16. `さらに読み込む`で追加30件を表示できる。
17. Infinite Scrollを使用しない。
18. Activity RowにTitle、時刻、Provider、Importance、関連Project/Systemを表示できる。
19. Descriptionが存在する場合は短く表示できる。
20. Personal Desk内部にDestinationがある場合は内部Navigationを優先する。
21. 内部Destinationがない場合はExternal URLへ遷移できる。
22. Filter/Search結果0件とFetch Errorを区別できる。
23. Cached Activityがある場合はProvider障害時も表示を維持できる。
24. 特定Providerの障害だけでActivity画面全体をErrorにしない。
25. 1440px幅で快適に利用できる。
26. 13-inch MacBook Airで利用できる。
27. 1280px未満でSidebarが自動collapseする。
28. Filterは狭い画面でwrapできる。
29. Dark / Light / Systemで利用できる。
30. Keyboard操作とVisible Focusに対応する。
31. Importanceを色だけで表現しない。