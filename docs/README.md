# Personal Desk Documentation

このディレクトリには、Personal Deskの設計・仕様に関するドキュメントを配置する。

ドキュメントは責務ごとに以下の3種類へ分離する。

## `docs/ui`

答える質問:

> ユーザーにはどう見え、どう操作できるか？

画面固有の仕様を記述する。

主な内容:

- 画面構成
- レイアウト
- 表示項目
- Interaction
- Navigation
- Loading / Empty / Error state
- Responsive behavior
- Accessibility
- v0.1 acceptance criteria

Framework、Database、APIなどの実装技術は原則として記述しない。

## `docs/specifications`

答える質問:

> Personal DeskにおいてProject / Activity / Resource等は何を意味するか？

複数の画面や機能から共有されるDomain Ruleを記述する。

例:

- Project Status
- Project ordering
- Activity importance
- Resource type
- Date/Time policy

特定の画面だけに依存するルールは`docs/ui`へ置く。

## `docs/architecture`

答える質問:

> 仕様を技術的にどう実現するか？

実装方式や技術選定を記述する。

主な内容:

- Framework
- Frontend architecture
- Backend architecture
- Database
- Integration
- Synchronization
- Localization implementation
- Deployment

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

画面固有ルールは`ui`へ、複数画面で共有する概念は`specifications`へ、コードやInfrastructureに関する決定は`architecture`へ配置する。

## 推奨する読み順

機能を理解するときは、原則として次の順番で読む。

1. `ui/`
2. `specifications/`
3. `architecture/`

実装するときは、対象画面のUI仕様だけでなく、関連するDomain SpecificationとArchitectureも確認する。

例:

Project Detailを実装する場合:

```text
ui/project-detail.md
        +
specifications/project.md
specifications/activity.md
specifications/resource.md
        +
architecture/frontend.md
architecture/database.md
architecture/integrations.md
```

## 重複を避ける

同じルールを複数ファイルへコピーしない。

たとえばProject Statusの定義は`specifications/project.md`に置き、UI側では必要に応じて参照する。

仕様変更時に複数箇所を修正する必要がある状態を避ける。