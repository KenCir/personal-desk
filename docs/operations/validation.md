# Production Docker実装・検証記録

2026-11-04 / 基準main `b4f19c3f82c789c79d35ee852b2e1efbd5381088`。承認済み[計画](../production-deployment-plan.md)のPhase 2〜9を実装した。以下は**計画済み・実装済み・実行検証済みを区別**した記録であり、本番配置済みという意味ではない。

## Phase別状況

| Phase                       | 計画・実装                                                                                       | 実行検証と残る確認                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2. Dockerfile               | Web/Workerのmulti-stage、maintenance target、非root、Standalone、runtime tsx、dockerignoreを実装 | Node 26.13.0 / pnpm 12.16.1でProduction Build、実Standalone起動・Asset、空ディレクトリからfiltered production installとWorker importが成功。Docker Image BuildはEngine不在で未検証 |
| 3. Production Compose       | Web/Worker/PostgreSQL 18、専用Volume、DBポート非公開、Worker opt-inを実装                        | 公式Compose CLI 5.7.0でconfig成功。3サービス・profile・restart=no・既定false・内部Networkを確認。コンテナ起動・Docker Volumeは未検証                                               |
| 4. Network/Caddy/Secret     | 内部DB Network、Worker egress、Web loopback公開、file Secret Loader、Role/接続先guardを実装      | Secret単体・実Node preloadテスト成功。Caddy設定は変更していない。実VPSのNetwork・ファイルUID・公開経路は未確認                                                                     |
| 5. Health/Logging/Shutdown  | Web live/ready、Worker heartbeat/probe、既存Abort連携、ログ上限・停止猶予を実装                  | HTTP 200、DB失敗の503/timeout、heartbeatとprobeのテスト成功。POSIX signal/コンテナの停止試験はDocker CIへ実装済みだが未実行                                                        |
| 6. Migration/Backup/Restore | 明示管理CLI、権限分離、ランダムSecret作成、archive/manifest、空の別Project限定Restoreを実装      | 新規ローカルPG18.6で管理Migration/Roleの再実行、実権限拒否、native dump/restore全13テーブル・Migration履歴一致。Docker管理wrapperの正常系は未実行                                  |
| 7. Docker試験               | 一時ProjectのBuild/起動/Fixture Worker/Health/永続性/Restore/cleanup検証スクリプトを実装         | Configまで実行済み。Image BuildはローカルEngine接続失敗。コンテナ・Docker Volume・daemon再起動は未検証。native PG再起動でFixture保持を確認                                         |
| 8. CI                       | 独立Docker jobとSecret/probeテストを追加、既存Checks/E2E・SHA固定を維持                          | ローカルの既存検証・監査成功。Commit/PushをしないためGitHub hosted CIは未実行。Dockerジョブの成功を確認してから必須check化を判断                                                   |
| 9. 運用文書                 | 初回起動、Worker制御、更新、権限、Backup/Restore、障害対応、実データ移行のRunbookを実装          | Repository内リンク・手順を照合。VPS固有値と実機リハーサルは配置前作業                                                                                                              |

## 実行した検証

| コマンド／検証                                                                                                                        | 結果                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `pnpm lint`                                                                                                                           | 成功                                                                                                      |
| `pnpm typecheck`                                                                                                                      | 全Package成功                                                                                             |
| `pnpm format:check`                                                                                                                   | 成功。Docker/CIスクリプトと運用文書を対象に追加                                                           |
| `pnpm test`                                                                                                                           | 104件成功。実PG用6件はこの実行では未設定によりskipし、次行で別途実行                                      |
| `POSTGRES_TEST_URL=... pnpm exec vitest run packages/database/src/postgres.test.ts packages/integrations/src/notion/postgres.test.ts` | 新規local `personal_desk_ci`で6件成功。排他・切断・原子性・同期を検証                                     |
| `pnpm db:migrate` / `pnpm db:smoke`                                                                                                   | 新規local DBで成功。Read-only確認                                                                         |
| `DATA_SOURCE=mock pnpm build`                                                                                                         | 成功。Next.js 16.4.3。通常出力とDESK_STANDALONE=1出力を別々にBuild・起動確認                              |
| `pnpm test:e2e`                                                                                                                       | Mock 4件成功                                                                                              |
| `pnpm test:e2e:database`                                                                                                              | 新規空DBと到達不能DBの2件成功                                                                             |
| `node --test scripts/docker/*.test.mjs`                                                                                               | 8件成功。Secret・実preload・provision・probe・運用guardを検証                                             |
| `node scripts/ci/audit.mjs`                                                                                                           | 成功。既知8件、unexpected 0、Baseline変更なし                                                             |
| isolated `pnpm --filter @personal-desk/worker... install --prod --frozen-lockfile --strict-peer-dependencies`                         | 成功。新しいソースのみのディレクトリで9 Packageを導入、`node --import tsx src/main.ts --help`成功         |
| Standalone serverの直接起動                                                                                                           | Web用DB Roleでlive/ready・画面・静的JS・同期後Project詳細が200                                            |
| Fixture Worker `--once`×2                                                                                                             | 実Workerプロセスと実PGで成功。専用fetch preloadにより実Notion通信なし。ID維持・Baseline・Activity重複なし |
| maintenance `migrate` / `roles`×2                                                                                                     | 新規local DBで成功。Web INSERT/DDLとWorker DELETEが実DBで拒否されることを確認                             |
| native `pg_dump -Fc` / `pg_restore --single-transaction --no-owner --no-acl`                                                          | 別の新規空DBへ復元成功。13テーブル全行・Cursor/Baseline・Migration hash/時刻が一致                        |
| native PostgreSQL停止→再起動                                                                                                          | 同じ新規datadirでProject 1、Cursor 1、Migration 2を保持。検証後停止                                       |
| Compose `config -q` / `config --format json`                                                                                          | 公開SHA-256照合済み公式単体CLI 5.7.0で成功                                                                |
| Compose `build web worker`                                                                                                            | **未検証**。ローカル`docker_engine` named pipe不在で接続失敗。Imageは作成されていない                     |
| `node scripts/ci/docker.mjs`                                                                                                          | **実行不可を検出**。Docker CLI不在で終了コード1、`unavailable: true`。成功扱いにしていない                |

実PG検証は今回作った`.local/production-docker-validation/data`のPostgreSQL 18.6を`127.0.0.1:55441`に限定して実行した。既存の`.local/pg18-tests/data`やラズパイDBを使用していない。検証用サーバーは停止済み。Native検証の一時スクリプト・証跡は`.local/production-docker-validation/`（Git除外）、Docker未実行記録は`test-results/docker/result.json`（Git除外）にある。

Compose単体CLIの取得は[公式release v5.7.0](https://github.com/docker/compose/releases/tag/v5.7.0)を使用し、公開asset digest `f5dc759702aec5c0602e247aa861d14853216e3f481c4eaaf83621a035ecf92f`を照合した。Engineやシステムサービスは導入していない。Nodeの固定base tag `26.13.0-bookworm-slim`は公式Docker Hub APIで存在とamd64/arm64対応を確認したが、Image pull/buildの代わりにはならない。

## 主な実装ファイル

| 領域          | ファイル                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------- |
| Image/Compose | `apps/web/Dockerfile`、`apps/worker/Dockerfile`、`compose.prod.yaml`、`compose.prod.env.example`、`.dockerignore`     |
| Secretと管理  | `scripts/docker/{secrets,preload,provision,maintenance,operations}.mjs`とNodeテスト                                   |
| Web           | `apps/web/next.config.ts`、`apps/web/src/lib/data-sources/database.ts`、`apps/web/src/app/api/health/`                |
| DB            | `packages/database/src/index.ts`のreadiness。Schema・Migration SQLは変更なし                                          |
| Worker        | `apps/worker/src/{main,heartbeat}.ts`、heartbeatテスト、`scripts/docker/worker-health.mjs`とprobeテスト               |
| 依存          | `apps/worker/package.json`とLockfileのtsxをdev→runtimeへ移動。バージョンは据置き                                      |
| CI            | `.github/workflows/ci.yml`、`scripts/ci/docker.mjs`、`scripts/ci/notion-fixture.ts`、ルートpackage.jsonの検証コマンド |
| 運用          | `docs/operations/{production,backup-restore,validation}.md`、README/docs README/CI文書への案内                        |

## 本番配置前に残る作業

1. Docker Engineが使える隔離Linux環境で`node scripts/ci/docker.mjs`を実行し、全コンテナ検証を通す。Image Build、非root Secret読取、health、SIGTERM/SIGKILL、Volume永続性、管理wrapper、Restoreを未確認のまま配置しない。
2. VPS architecture、空き容量・RAM、Docker/Composeと運用スクリプト用Node 26.13.0、既存Caddyのホスト/コンテナ方式、Network名、3100番、TLS/アクセス制限、Secret UIDを確認する。Caddy接続案とリソース上限を実測で確定する。
3. GitHubのDockerジョブを実行して結果を確認する。今回Commit/Pushはしていないため、hosted CI成功の証跡はない。
4. Production用Secret/MappingをGit外に準備し、DB Role、公開範囲、Backupの外部保管先・暗号化・保持・通知・timerを設定する。実SecretをBuildへ渡さない。
5. 「空DBからNotion初回同期」か「既存DBの論理移行」を決める。後者は別作業としてSnapshot/cutover/Restore照合を行う。ラズパイDBは開発・テストとして維持する。
6. 同じreleaseのImageと管理targetを用意し、Backup→明示Migration/Role→Web確認→必要時だけWorker dry-run/once/明示定期起動の順で進める。VPSでのdaemon/host再起動後にWorkerが停止したままかも確認する。

実デプロイ、Caddy変更、ラズパイへの書込、実Notionへの書込、Production Workerの常駐、Commit/Pushは行っていない。
