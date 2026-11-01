# `docs/specifications/project.md`

## 1. Projectとは

Personal Deskで管理対象となる活動・開発・計画の単位。

例:

- Personal Desk
- kids-illust-contest-web
- 大学出願・受験

## 2. Status

内部値:

```text
planning
active
waiting
blocked
done
```

表示例:

- planning → 計画中
- active → 進行中
- waiting → 待機中
- blocked → 停止中
- done → 完了

## 3. Status Order

```text
blocked
active
planning
waiting
done
```

## 4. Sorting

通常:

`updatedAt DESC`

Done:

`completedAt DESC`

## 5. Priority

Personal Desk独自のProject Priorityはv0.1では持たない。

## 6. Area

Projectは0または1つのAreaに所属する。

Area自体のSource of TruthはNotion。

## 7. Slug

形式:

`lowercase-kebab-case`

例:

```text
personal-desk
kids-illust-contest-web
university-application
```

要件:

- 一意
- 一度決めた後は安定
- Project名変更で自動変更しない

## 8. Milestone

Project-levelの重要な期限・到達点。

Task deadlineとは区別する。

例:

- 出願締切
- Release
- Event
- 提出期限

## 9. Source of Truth

Project:

`Notion`

Personal DeskはNormalized representation / Cacheを保持してよいが、Notionと競合するSource of Truthにはしない。