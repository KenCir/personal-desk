# Backup・Restore・データ移行

Productionの永続Volumeは`personal-desk-prod_postgres18_data`、mount先は`/var/lib/postgresql`。PostgreSQL 18の既定PGDATAを使用する。稼働中Volumeの単純コピーは論理Backupの代わりにしない。

## Backup

[Production Runbook](production.md)の`DESK_ENV_FILE`、`DESK_PROJECT`、`PROD_SECRET_DIR`、`RELEASE_TAG`を設定してから実行する。

```sh
node scripts/docker/operations.mjs backup /secure-backups/personal-desk-YYYYMMDD.dump
```

`pg_dump -Fc`で専用DBを取得し、`pg_restore --list`でarchiveを確認する。`.dump.json`に日時、Project、server version、release、サイズ、SHA-256、Migration hashを記録する。既存ファイルを上書きしない。失敗時の途中dumpは成功したBackupではなく、manifestが揃うまで使用しない。

dumpとmanifestは一組でVPS外へ暗号化転送する。URL・Token・Mappingの暗号化保管は別に行う。現スクリプトはDB内Roleのpasswordを含むglobalsを出力しない。専用Roleは新しい資格情報で`roles`を再実行する。追加の所有者やRoleを導入した場合のみ、必要性をレビューして`pg_dumpall --globals-only`を機密物として別保管する。

初期運用目標は日次・直近7日＋週次4世代、RPO 24時間、RTO 4時間。容量と復元時間で確定する。ホストtimer等でこのコマンドを呼び、失敗・最終成功期限超過・Disk不足を通知する。Repositoryはtimer登録や外部転送先の設定を自動実行しない。3サービス構成を維持する。

## 隔離Restoreリハーサル

Restoreは`desk-restore-...`形式の**別Projectと空DB**に限定される。Production Projectや既存テーブルがあるDBへのRestoreはスクリプトが拒否する。`--clean`は使用しない。

```sh
export DESK_PROJECT=desk-restore-YYYYMMDD
docker compose --env-file "$DESK_ENV_FILE" -p "$DESK_PROJECT" \
  -f compose.prod.yaml up -d --wait postgres
node scripts/docker/operations.mjs restore /secure-backups/personal-desk-YYYYMMDD.dump
node scripts/docker/operations.mjs roles
```

同じサーバーでProductionとRestore Projectを動かす場合もNetwork/VolumeはProjectごとに独立する。Webは起動しないため3100番を競合させない。初期管理passwordとadmin URLが一致するSecretセットを使う。Production用Secretを共有したくない場合は新規Secretセットとenvファイルを用意する。

Restoreはchecksumを確認し、`pg_restore --exit-on-error --single-transaction --no-owner --no-acl`を実行、Migration hashの一致まで検査する。その後、次を別途確認する。

- 件数、UUID/Slug、FK、Unique、Enum、時刻、Soft Delete、Activity Dedup。
- Integration、sync_runs、Cursor/BaselineとMapping fingerprint。
- Web RoleでRead Query、Worker RoleでMigration preflight・dry-run。リハーサルでは実NotionではなくFixtureを使用する。
- 必要な未適用Migrationをレビューして明示実行し、rolesを再適用する。
- 実際の復元所要時間をRTOと比較する。

自動検証は`node scripts/ci/docker.mjs`。一時ProjectでFixture同期→Backup→別Project Restoreを行い、そのrunのProjectラベルとVolume名を確認してから一時Volumeだけを削除する。本番Volumeを削除するコマンドはこのRunbookに含めない。

## 実データの移行（別途実施）

本実装ではラズパイへの接続・書込・停止・実データ転送を行わない。移行時には「Notionから新規同期」か「ラズパイDBのdump/restore」を明示選択する。新規同期では既存内部ID・履歴は移行されない。

dump/restoreの場合、別途決めたcutover時刻の書込元とSnapshotを確定し、PostgreSQL 18同士でもminor/client version・extension・collation・Roleを確認する。新しいVPS DBへ論理復元し、EntityだけでなくIntegration、sync_runs、Cursor/Baseline、Activity/Dedupを保持する。移行元がこのBackup wrapper以外で作ったarchiveなら、移行専用の検証記録・checksum・Migration履歴を用意し、manifest検査を無効化して通さない。

復元結果・Migration・Read Query・Mappingを照合し、Productionの接続先はVPS内DBのまま維持する。最終確認後にWorkerを明示有効化する。ラズパイDBは開発・テスト用に残し、VPS DBとの自動複製は行わない。古いVolumeとBackupを保持し、削除は移行完了とみなして自動実行しない。
