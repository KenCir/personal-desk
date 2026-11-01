# Personal Desk v0.1 実装レポート

## 実DB初回同期完了（2026-11-01）

ユーザーがバックアップ未取得での続行を明示したため、対象`pi:5432/personal_desk`と未適用Migrationを再確認して`0001_kind_wrecker.sql`を適用しました。既存Migrationは変更していません。

- 初回同期: Areas 6、Projects 12を作成。Tasks／Synthetic Milestones／GitHub Resourcesは対象値がなく0件。エラー・警告なし。
- 再同期: 取得18、作成0、更新0、削除0。前後のInternal ID・External ID・Slug・件数一致を実PostgreSQLで確認しました。
- `sync_runs`: 2件ともsuccess、開始／終了時刻あり、初回created 18、再同期created 0、両方updated 0・deleted 0・error null。
- 既存Read Layer: Project一覧12件、Project Detail 12件の取得成功。
- Browser: DatabaseモードのDashboard（5件表示）、Projects（12件表示）、Project DetailのHTTP 200と実データ表示を確認。JavaScript例外0。Screenshotを目視確認し、レイアウトに問題なし。
- `.env`: `NOTION_MAPPING_FILE=notion.mapping.json`、`NOTION_SYNC_TARGET=pi:5432/personal_desk`、`DATA_SOURCE=database`を設定しました。Secretはログやレポートへ記載していません。
- 検証用画面: `http://127.0.0.1:43103`。通常起動でもDatabaseモードになります。Mockへ戻す場合は`DATA_SOURCE=mock`で再起動します。

実装コードは前回の自動検証後に変更していません。Lint／Type Check／Build／83件の自動テスト／Mock E2E 4件／空DB・接続失敗E2E 2件の既存成功結果に、今回の実Schema・実データ・実PostgreSQL・ブラウザ検証を追加しました。空DB専用E2Eは同期後の開発DBには再実行していません。今後このテストを実行する場合は独立した空DBが必要です。

実データのTask・Deadline・GitHub値は空のため、それらの保存・生成・更新の検証根拠はMock APIとPGliteの自動テストです。実アカウントへテストデータを書き足していません。今回の手動初回同期の範囲は完了し、Polling／Webhook／Scheduler／自動Soft Delete／Activity生成／他Provider接続は依頼どおり未実装です。

## 実Notion接続検証（2026-11-01）

読み取り専用APIによるAreas／Projects／TasksのSchema取得とデータ取得に成功しました。以下は実アカウントで確認した結果です。開発PostgreSQLへの初回同期と実データUI確認はまだ完了していません。

- Areas: `Name`はtitle。ProjectsへのRelationを確認。
- Projects: `Name`はtitle、`Status`はselect、`Area`はAreasへのrelation、`Deadline`はdate、`GitHub`はurl。Status OptionはPlanning／Active／Waiting／Paused／Done。NotesはrelationのためDescriptionへ流用しません。
- Tasks: `Task`はtitle、`Status`はselect、`Project`はProjectsへのrelation、`Due`はdate、`Priority`と`Type`はselect。Status OptionはTodo／Doing／Waiting／Done。
- 想定との差はProjects／TasksのStatus型でした。`notion.mapping.json`で両方をselectに設定し、`.env`の`NOTION_MAPPING_FILE`で明示指定しました。Status値の対応は既存Mappingを維持しています。
- 実取得件数: Areas 6、Projects 12、Tasks 0。今回のデータから生成されるMilestone／GitHub Resourceは0件です。
- `--verify`: 実Notionスナップショットを独立したメモリ内PGliteへ2回同期。初回はAreas 6／Projects 12を作成、2回目は作成0・更新0。Internal ID維持、重複なし、既存Read LayerからProject 12件とDetail 12件の読み取りを確認しました。
- `--dry-run`: `pi:5432/personal_desk`へ読み取り専用で接続。作成予定はAreas 6／Projects 12、Validation ErrorとWarningは0件。未適用Migration検出のためCLI終了コードは1です。
- 未適用の`0001_kind_wrecker.sql`はtask_status Enumへwaitingを追加する内容です。対象DB・変更内容は確認済みですが、バックアップ状況が未確認のため適用していません。実DBへの同期書き込みも未実行です。

ローカルPATHにはpg_dump／pg_restore／Dockerが見つかりませんでした。バックアップ状況確認後、Migration、初回同期、再同期、DatabaseモードUI検証へ進みます。以下の2026-10-30記録は実接続前の履歴です。

## Notion手動初回同期（実接続前・2026-10-30）

Collector、Schema検証、Normalizer、差分計算、Writer、手動CLIを`packages/integrations/src/notion/`へ追加しました。既存Database Connection Factory、13テーブル、Read Query、Domain Utility、UIは再利用しています。Notionへの書き込み、Polling、Scheduler、Webhook、自動Soft Delete、Activity自動生成はありません。

**この段階では実Notionへの接続と実DBへの初回同期は未完了です。** ローカル設定にNotion Token／Data Source IDがなく、実Schema・実データ件数・実データUIをまだ検証できていません。以下のテスト結果を実アカウント検証と混同しないでください。

### 追加・変更ファイル

- 新規Package: `packages/integrations/package.json`、`tsconfig.json`
- Collector・設定: `src/notion/collector.ts`、`config.ts`、`types.ts`
- 正規化・差分・保存: `src/notion/normalize.ts`、`plan.ts`、`writer.ts`、`sync.ts`
- CLI・独立DB検証: `src/notion/cli.ts`、`verify.ts`
- Test: `src/notion/fixtures.ts`、`collector.test.ts`、`normalize.test.ts`、`pipeline.test.ts`、`sync.test.ts`
- 設定例: `notion.mapping.example.json`
- 更新: `.env.example`、ルート`package.json`、`pnpm-lock.yaml`、`README.md`、`IMPLEMENTATION.md`

上記`src/`は`packages/integrations/`を基準とします。既存設計書`docs/`、Schema、Migration履歴ファイルは変更していません。

### 実装と判断

- Notion REST API `2026-03-11`へ固定し、Node.js `fetch`を使用します。Notion SDKは使用していません。公式の[Versioning](https://developers.notion.com/reference/versioning)、[Data Source Property](https://developers.notion.com/reference/property-object)、[Request Limits](https://developers.notion.com/reference/request-limits)を確認しました。
- SchemaのProperty名またはID、型、Relation先を検証します。Statusの未対応Optionも報告し、対応不能なEntityは更新しません。初期Mappingは既存設計書の想定値であり、実Schemaを確認した結果ではありません。
- Area／Project／Taskは`provider + external_id`で識別し、新規IDは`uuid`のv7で生成します。既存ID・Slugを維持し、新規Slug衝突はExternal ID由来のsuffixで解決します。日本語のみの名前は推測でローマ字化せず、`area-UUID`／`project-UUID`を使用します。
- Status／Area／Deadline差分だけでProjectの`meaningful_updated_at`を更新します。`source_updated_at`／`synced_at`／監査`updated_at`は分離し、同一データ再確認は作成・業務更新件数へ加算しません。
- Synthetic MilestoneとGitHub Resourceは用途付きの固定External IDを使い、既存の手動データを上書きしません。Deadlineの明示的な空欄化は管理対象Milestoneをcancelled・期限なしにし、GitHubの空欄化は管理リンクを保持してWarningを出します。これは今回削除処理を導入しないための判断です。
- Date onlyはTokyo暦日、DateTimeはOffset／IANA TimezoneをTemporalで正規化します。曖昧な日時は拒否します。Date rangeはstartを使用します。
- 完了日時が提供されないため、初回Doneの`completed_at`はLast Edited Timeで初期化し、Done中の再同期で動かさず、再開時にnullへ戻します。
- Task Typeは既存TaskのUI/並べ替えへ影響させず、正規化値のみSync Run metadataへ記録します。Description未設定時にNotesやPage Bodyを流用しません。
- APIは読み取りEndpointのみ。Pagination、必要なProperty Itemの追加取得、350ms間隔、最大3回の限定Retryを実装しました。長いRetry-Afterは早期再試行せず再実行待ちとして報告します。認証・権限・Mapping不一致はRetryしません。
- Dry RunはREAD ONLY Transactionで計画を作り、Sync Runも保存しません。実行時は明示Target、接続先DB名、Migrationのhash／履歴、waiting Enumを検証します。Entity保存はTransactionで一括実行し、DB失敗時はロールバック、失敗Runは別Transactionで記録します。保存TransactionはAdvisory LockとUnique Constraintで保護します。
- エラーは固定Codeを使用し、Raw API Response／SQL例外／Tokenを通常ログへ出しません。CLI出力にもSecret Redactionを適用します。

### 現段階の検証

- `pnpm lint`: 成功。
- `pnpm test`: 83件成功。既存45件にNotion関連38件を追加しました。API Mock、実際のSchema形状を模したFixture、独立PGliteを使用し、実Notion Accountへアクセスしていません。
- `pnpm typecheck`: 5 Package成功。
- `pnpm build`: `DATA_SOURCE=mock`を明示して成功。
- `pnpm test:e2e`: 既存Mock 4シナリオ成功。
- `pnpm test:e2e:database`: 空DB・接続失敗の2シナリオ成功。
- `pnpm format:check`: 成功。
- `pnpm notion:sync --help`: CLI起動成功。
- `pnpm notion:sync --check-db`: 実PostgreSQLへの読み取り専用検査成功。対象`pi:5432/personal_desk`、履歴は初期Migrationのみ、Task Enumにwaitingなし、`0001_kind_wrecker.sql`未適用を検出しました。適用はしていません。

Fixtureの初回同期はArea 1、Project 1、Task 2、Synthetic Milestone 1、GitHub Resource 1を作成し、2回目は作成0・更新0・全Internal ID維持を確認しました。これはテスト件数であり、実Notionの同期件数ではありません。

### 残る実データ検証

1. 読み取り専用Notion Tokenと3つのData Source IDを設定する。
2. 実Schemaを読み取り、Property／Status／Relationを確認し、必要なMappingを明示設定する。
3. Dry Runと`--verify`で実Notionスナップショットの独立DB同期・冪等性を確認する。
4. 対象DBとバックアップ状況を確認してから既存waiting Migrationを適用する。
5. 開発DBへ初回同期、再同期し、実件数・ID・Slug・更新件数を検証する。
6. DatabaseモードでNotion由来のDashboard／Projects／Project Detailをブラウザ確認する。

現時点で実DBのデータ変更、Migration適用、Notionへの書き込みはありません。完了条件を満たしたという報告は実データ検証後に行います。

## Database Read Layer 要件確認・補完（2026-10-30）

着手時点でRead Contract、Mock/Database Source、主要Read Query、Cursor Pagination、PGliteテストが既に存在していました。これらを再利用し、今回の依頼との不一致を補完しました。以下が現在の動作です。後段の2026-09-19記録にあるCalendarサンプル混在・Productionの暗黙Mockは解消しています。

- Data Sourceは`apps/web/src/lib/data.ts`で選択し、`DeskDataSource`を介してUIへ共通Read Modelを返します。Databaseは既存Connection FactoryとServer専用の接続プールを再利用します。
- 開発・テストの未指定はMock。Productionの未指定、不正値は明確な設定エラー。Productionでのサンプル確認は`DATA_SOURCE=mock`を明示します。
- DatabaseのCalendarは空配列と`disconnected`状態を返し、画面に未接続と表示します。Mockイベントのimport・Fallbackはありません。
- Infrastructure QueryはRead Modelの列のみを明示選択します。監査列・同期情報・metadata等のDB RowをUIへ渡しません。Backupに紐づくAlertの対象も解決します。
- System/Serviceの最終確認には`last_checked_at`、最後の成功には`last_success_at`を表示します。Stale判定は従来のDomain Logicを再利用します。
- 接続失敗は例外／画面Error／Activity API 503となり、EmptyやMockに変換しません。接続プール終了には5秒の上限を設けました。
- 永続キャッシュは追加していません。`cached`プレビューは既存の表示確認機能であり、実DB障害からの復元を保証するものではありません。

### 今回の検証結果

| コマンド                 | 結果                                                                 |
| ------------------------ | -------------------------------------------------------------------- |
| `pnpm lint`              | 成功                                                                 |
| `pnpm typecheck`         | 全Package成功                                                        |
| `pnpm test`              | 45件成功（Domain 14、Query 16、Migration 1、Source/Request 6、UI 8） |
| `pnpm build`             | `DATA_SOURCE=mock`を明示して成功                                     |
| `pnpm format:check`      | 成功                                                                 |
| `pnpm test:e2e`          | Mockの既存4シナリオ成功                                              |
| `pnpm test:e2e:database` | 実空DB画面と接続失敗の2シナリオ成功                                  |
| `pnpm db:smoke`          | 実PostgreSQLの読み取り専用Query成功                                  |

Database E2EではDashboard、Projects、Activity、InfrastructureのEmpty表示、Calendar未接続、未知Slug、空Activity API、ブラウザ例外なしを確認しました。別プロセスの到達不能DBでは画面ErrorとActivity API 503、Mock非混入を確認しています。データありのRelation、Soft Delete、Ordering、Filter、Search、Pagination、Today、Staleは独立したPGliteで検証しています。

E2Eの成果物出力先をMock/Databaseで分離しました。この環境ではport 3001を別アプリが使用していたため、Database E2Eは43101/43102を使用します。既存アプリを停止・変更していません。

### 今回のファイル

新規:

- `apps/web/src/lib/data-sources/database.test.ts`
- `playwright.database.config.ts`
- `tests/database-e2e/empty.spec.ts`
- `tests/database-e2e/failure.spec.ts`

変更:

- `apps/web/src/lib/data.ts`
- `apps/web/src/lib/data-sources/{config,database,mock,contract.test}.ts`
- `apps/web/src/components/dashboard/today-card.tsx`
- `apps/web/src/components/infrastructure/infrastructure-view.tsx`
- `apps/web/src/components/components.test.tsx`
- `packages/core/src/{types,reader}.ts`
- `packages/database/src/{index,queries,queries.test}.ts`
- `packages/i18n/src/index.ts`
- `playwright.config.ts`、`package.json`、`README.md`、`IMPLEMENTATION.md`

SchemaおよびMigrationファイルは今回変更していません。既存の`0001_kind_wrecker.sql`も維持しています。設計ドキュメント`docs/`は変更していません。作業開始時にRepositoryのアプリ一式がGit未追跡だったため、この一覧は今回実際に編集したファイルを示します。

### 実PostgreSQLの確認

`pnpm db:smoke`成功。PostgreSQLが強制するREAD ONLY Transactionで全Read Queryを実行しました。Project、Area、Activity、System、Service、Backup、Alert、Today Task、Resourceは0件、Milestoneなし、存在しないSlugは未検出です。既存DBへの書き込み、削除、再作成、Migration適用は行っていません。

実DBのTask Statusは`todo/in_progress/done/cancelled`の4値でした。Readは成功しています。Notion Integrationで`waiting`を書き込む前に、既存の追加Migrationの適用状況を確認する必要があります。

### 仕様判断・次の段階

Project概要のRecent Activityは今回の明示要件に従いnormal以上・最大5件、Project Activityページではlowも取得できます。これは既存Domain文書の「Project Detailはlow以上」を概要と全Activityページで区別した扱いです。Today Taskは既存Domainと同じくTokyo日付で今日以前の期限を対象にし、waitingを件数に含めTop Taskから除外します。

Notionへ進む前の残課題は、Provider値の正規化、UUIDと外部IDの対応、冪等Upsert、意味のある更新時刻、Soft Delete判定、同期履歴・Cursor・Retry、waiting Migrationの適用確認です。今回External API、Worker、Scheduler、編集・外部書き戻し、認証は追加していません。

## PostgreSQL Read Layer（現在の状態）

初期実装の記録は下記に残しています。そこにある「DB未接続」「Read Query未実装」は初期段階の記録であり、この追加実装で解消しました。

- `packages/core/src/reader.ts`: 最小の共有Read Contract。Mock/Databaseは同じInterfaceを実装し、Calendarだけ明示的なMockを維持。
- `apps/web/src/lib/data-sources/`: モード検証、Mock実装、Server専用Database実装。既存FactoryのConnectionを再利用し、失敗時にMockへFallbackしない。
- `packages/database/src/queries.ts`: Project一覧/Slug/Area、Next Milestone、Resources、Activity、Today Tasks、Infrastructureを取得。通常EntityはSoft Deleteを除外。履歴は残し、削除済み親への画面リンクは除去。
- Projectの更新順は`meaningful_updated_at`を使用。Milestoneはpendingの期限昇順。TasksはTokyoの今日以前の未完了を対象とし、waitingは件数に含めTop Taskから除外。
- ActivityはAND Filter、Importance完全一致、文字列検索、30件のCursor Pagination。Timestampのマイクロ秒とIDで順序を安定化。ブラウザは追加分のみ取得し、Filter変更時に古いRequestを中断。失敗時は取得済み内容を維持してRetry可能。
- Infrastructureはactive Alertとlive Entityを取得し、既存Domain関数でStaleを導出。DBにStaleを保存しない。
- Task Status `waiting`を型・Schema・追加Migration `0001_kind_wrecker.sql`・Testへ反映。既存Migrationは変更していない。

### 切替と実DB検証

ルート`.env`の`DATA_SOURCE=database`と既存`DATABASE_URL`で有効化し、Serverを再起動。既定は`mock`。詳細はREADME参照。

2026-09-19に既存PostgreSQLで`src/smoke.ts`を実行。PostgreSQLのREAD ONLY Transaction内で全Read Queryを実行し成功。各対象は0件、Project詳細は未検出、Milestoneなし。データは一切投入していない。実DBのTask Enumは旧4値のままで、新しいMigrationは未適用。Notionのwaiting書き込み前に`pnpm db:migrate`が必要。

DatabaseモードのProduction Serverをport 3001で起動し、ChromeでDashboard/Projects/Activity/Infrastructure/Settingsの200、日本語DB表示、空Activity API、存在しないProjectのNot Found、ブラウザ例外なしを確認。データありの関係・削除・Filter・Cursorは全Migration適用済みPGliteで検証。

### 検証結果

- `pnpm test`: 38件成功（Domain 14、DB Query 14、Migration 1、Source/API Contract 3、UI 6）。
- `pnpm test:e2e`: Mockモード4シナリオ成功。非同期Load More/Filterも検証。
- `pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm format:check`: 成功。
- Real PostgreSQL Smoke: 成功。実行環境の制約から`packages/database`で`node node_modules/tsx/dist/cli.mjs src/smoke.ts`を使用（`pnpm db:smoke`と同一の実装）。

### Notion Integration前の残課題

Read Layerは実装済み。次はUUID v7と外部IDの対応、Provider値の日時/Status正規化、冪等Upsert、意味のある更新時刻、Soft Delete、同期Cursor/実行履歴/失敗時RetryのWrite側を実装する。今回WorkerやAPI連携、Polling、Webhook、編集、認証は追加していない。既存設計書の変更や新たな重大な矛盾はない。初期記録にある日時・Backup優先順位等の確認事項は引き続き参照する。

## 初期実装の記録

- pnpm workspace: Next.js 16 / React 19 / TypeScript、Tailwind CSS 4、ローカル所有のshadcn/ui Button。
- App Routerの要求された8 Route。ProjectのActivity/Resourcesは安定したsub-route。
- 日本語UI、Dictionary分離、Dark既定の3 Theme、永続化、240px Sidebar、1280px未満で72pxへcollapse、最大1600px、Dashboard上段7:5。
- Project一覧のAND検索・Filter・Status grouping・Done既定collapseと検索時展開。
- ActivityのSearch/Category/Importance/Project Filter、東京日付group、30件ずつLoad MoreとFilter変更時reset。
- Project概要、未完了Milestone、重要Resource最大6件、normal以上のActivity最大5件、用途別Resource group。
- InfrastructureのSummary Metrics、状態順序、Backup期限判定、active Alert、Mock更新、時刻経過に伴うStale再評価。
- 独立したSection State、キャッシュ維持、Loading/Empty/Error/StaleプレビューとRetry。
- Semantics、Keyboard操作、Visible Focus、色・Icon・文字での状態表示、Reduced Motion、Skip link。
- Drizzleの13テーブル、SQL Migration/metadata、Compose開発用PostgreSQL、接続Factory。
- Mock: 8 Project、3 Area、97 Activity、6用途リンク/Project、2 System、4 Service、3 Backup、active/resolved Alert。
- Manifest/SVG iconの基礎。Offline cacheやService Workerは含みません。

## 主なファイル

| 目的                 | ファイル                                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace / Commands | `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`                                                                                                   |
| DB / Docker          | `compose.yaml`, `.env.example`, `packages/database/src/schema.ts`, `packages/database/drizzle/0000_cuddly_oracle.sql`                                     |
| Domain / 日付        | `packages/core/src/types.ts`, `selectors.ts`, `datetime.ts`                                                                                               |
| 日本語               | `packages/i18n/src/index.ts`                                                                                                                              |
| Mock境界             | `apps/web/src/lib/data.ts`, `mock-data.ts`, `project.ts`                                                                                                  |
| Layout / 表示状態    | `apps/web/src/app/layout.tsx`, `globals.css`, `components/app-shell.tsx`, `shared.tsx`, `preview.tsx`                                                     |
| 画面                 | `apps/web/src/app/`, `components/dashboard/`, `projects/`, `activity/`, `infrastructure/`                                                                 |
| 検証                 | `packages/core/src/selectors.test.ts`, `packages/database/src/migration.test.ts`, `apps/web/src/components/components.test.tsx`, `tests/e2e/desk.spec.ts` |

## 最小限の判断

1. **DBなしでMock起動**: 今回はMigration/Schemaまでという範囲に合わせ、Server read境界からRequest単位でMockを生成。Provider APIへはアクセスしません。
2. **更新時刻**: UI/Domainの`Project.updatedAt`は将来の`meaningful_updated_at`のRead Model aliasです。DBの監査`updated_at`や`synced_at`をソートに流用しません。
3. **UUID**: DBはUUID型、生成はApplication責務。現時点でDB seedがないため、PostgreSQLのversion/extensionに依存するUUID生成defaultは設定せず、将来UUID v7を渡せるようにしています。MockのIDは画面用の安定した文字列です。
4. **All-day**: `all_day`を保持し、Mockの期限はAsia/Tokyoの午前0時を表すoffset付きTimestampで表現。日数比較は時差による24時間差ではなくTokyo日付で行います。
5. **Today Tasks**: 期限超過と今日締切の未完了Taskを「今日対象」とし、期限なし・未来のTaskは含めません。All-dayの今日締切は午前0時を過ぎても期限超過にしません。
6. **Milestone**: 最も近いpendingを期限昇順で選択。期限超過も消さず「超過」と表示します。
7. **Backup**: 明示的なfailed/runningを古い成功時刻で上書きしません。successに対して個別thresholdを超えた場合にstaleを導出。Infrastructureの5分判定は境界を含み、Backupは設計の「超えた」に従い境界を含みません。
8. **データがないOverall**: 全対象が空の場合にHealthyとは表示せずUnknown。Active Warning AlertもOverall Warningへ反映します。
9. **Package分割**: UIはWeb内に置き、再利用が必要なDomain/DB/i18nだけを共有Package化しました。
10. **Mock Refresh**: 新しい現在時刻を基準にMockを再生成します。実監視の更新を装うものではなく、サンプルであることを常時表示します。

## 設計上の確認事項

既存の設計ドキュメントは変更していません。実装範囲を妨げる明確な矛盾はありませんでした。次の点はIntegration実装時に確定する必要があります。

- `updatedAt`と`meaningful_updated_at`の対応は上記のRead Model判断で整合させました。
- Backup staleの一般式とfailed/runningの同時成立時の優先関係は明記がありません。表示優先順位と失敗の意味を優先し、failed/runningを維持します。
- 「今日対象Task」の期限なしTaskやProvider独自のToday flagの扱いは未定義です。今回は期限基準に限定しました。
- 日付のみのProvider値を`timestamptz`へNormalizeする際のtimezoneはProvider mappingで確定が必要です。今回のMockはTokyoに固定。
- 全体ArchitectureのPWAは方向性として記載されています。Manifestは用意しましたが、インストール互換性、各OSでのインストール確認、Service Workerは次段階です。

## 未実装

依頼の範囲外として、Notion / GitHub / Google Calendar / Prometheus / Backup実接続、Worker/Webhook/Polling、認証、多人数、AI/Vector Search、編集・外部書き込み・Infrastructure操作、専用Mobile UIを実装していません。

DBを利用した実Read QueryやSeedは今回のMock動作に不要なため未接続です。Dockerがこの実行環境にないため、**`docker compose up`と実PostgreSQLに対する`pnpm db:migrate`は未実行**です。

## 実行コマンドと検証結果

2026-09-19 / Windows / Node.js 24.19.0 / pnpm 11.19.0 / Chrome。

| コマンド            | 結果                                                                   |
| ------------------- | ---------------------------------------------------------------------- |
| `pnpm install`      | 成功。Lockfile作成。pnpmのbuild許可をesbuild/sharp/unrs-resolverに限定 |
| `pnpm db:generate`  | 成功。13 TableのMigration生成                                          |
| `pnpm lint`         | 成功、警告なし                                                         |
| `pnpm typecheck`    | 4 Package成功                                                          |
| `pnpm test`         | 19 Test成功（Domain 13、UI 5、DB 1）                                   |
| `pnpm build`        | 成功。要求された全Route生成                                            |
| `pnpm test:e2e`     | 4 Scenario成功                                                         |
| `pnpm format:check` | 成功                                                                   |
| `pnpm start`        | Production Server起動・ブラウザで確認                                  |

DBテストはPGliteで生成SQLを実行し、テーブル数、実瞬間のTimezone付きTimestamp、stale Enumなし、外部ID重複拒否、Area削除時のProject保持、Project削除時のActivity履歴保持を検証しました。Docker/PostgreSQL serviceそのものの動作確認とは区別しています。

E2EではDashboard件数、Project検索/遷移/404、Project内Activity、Resource外部リンク、横断Activityの絞り込み・Load More、Infrastructure表示・更新、Theme永続化/System追随、Sidebarの1440/1280/1279/1024/768px、横スクロールなし、部分Error/Cache/Empty/Loading/Retryを確認しました。Dark/Light/narrowのScreenshotも目視確認しています。

実行環境では標準PATHのVoltaが制限内で動かなかったため、用意されているNode/pnpm runtimeをPATHへ追加して実行しました。Drizzle/Vitest/Playwrightの一部はOS/親Directory参照や終了処理の制約を受け、通常権限で再実行して成功しています。

実装方式の確認に利用した一次資料: [Next.js](https://nextjs.org/docs)、[shadcn/ui](https://ui.shadcn.com/docs/installation/manual)、[Drizzle Migration](https://orm.drizzle.team/docs/drizzle-kit-generate)。

## 次のIntegration候補

1. **Notion**: Area/Project/Task/MilestoneをNormalizeし、Mock readerをDB Queryへ差し替える。Source ID/意味のある更新/Soft Deleteを先に固める。
2. **GitHub**: Resourceで監視Repositoryを限定。Webhookと定期Reconciliation、dedup_key、Meaningful Activityを導入。
3. **Google Calendar**: TodayのNext EventとIncremental Cursorを実装。
4. **Prometheus**: 現在状態とSummary Metricsを同期。取得障害と対象のDownを分離し、last_success_atを正しく更新。
5. **Backup Adapter**: Job別の期限、失敗/復旧、AlertをNormalize。
