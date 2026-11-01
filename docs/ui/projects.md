# `docs/ui/projects.md`

## 1. 目的

すべてのProjectを確認、検索、絞り込みし、Project Detailへ移動するための一覧画面。

## 2. Route

`/projects`

## 3. 基本レイアウト

```text
Projects

[ Search... ] [ Status ▼ ] [ Area ▼ ]

停止中
────────────────────────
Project ...

進行中
────────────────────────
Project ...

計画中
────────────────────────
Project ...

待機中
────────────────────────
Project ...

完了済み 12件 >
```

Gridではなく1列のRow形式を使用する。

## 4. Search

リアルタイム検索。

対象:

- Project name
- Description
- Area

Status / Area FilterとAND条件で組み合わせる。

## 5. Status Filter

- すべて
- 停止中
- 進行中
- 計画中
- 待機中
- 完了

## 6. Area Filter

利用可能なArea一覧から選択する。

Default:

`すべてのArea`

## 7. Grouping

StatusごとにSection分け。

順序:

1. blocked
2. active
3. planning
4. waiting
5. done

空Sectionは非表示。

## 8. Ordering

通常:

`updatedAt DESC`

Done:

`completedAt DESC`

`completedAt`がない場合は`updatedAt DESC`。

## 9. Project Row

表示:

- Name
- Description 最大1行
- Area
- Status
- Updated

クリック:

`/projects/[slug]`

Keyboard:

- Tab
- Enter
- Visible focus

## 10. Done

Defaultで折り畳む。

Search/FilterによってDone Projectが対象になる場合は自動展開する。

## 11. Project Creation

Personal Deskからは作成しない。

v0.1ではread-only。

## 12. Empty / Error

Projectが0件:

`プロジェクトがありません。`

検索結果なし:

`条件に一致するプロジェクトがありません。`

Fetch失敗:

`プロジェクトを取得できませんでした。`

Cacheがある場合は表示を維持する。

## 13. Responsive

Dashboardと同じSidebar breakpointを使用。

1280px未満でSidebar collapse。

SearchとFilterは必要に応じて複数行にする。

## 14. v0.1受け入れ条件

- Status group表示
- Search
- Status filter
- Area filter
- Done collapse
- Row clickでDetailへ遷移
- Project編集なし
- ErrorとEmptyを区別