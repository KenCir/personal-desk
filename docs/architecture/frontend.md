# `docs/architecture/frontend.md`

## 1. Technology

- TypeScript
- React
- Next.js
- Tailwind CSS
- shadcn/ui

## 2. Routing

```text
/
/projects
/projects/[slug]
/projects/[slug]/activity
/projects/[slug]/resources
/activity
/infrastructure
/settings
```

## 3. Responsive

基準:

- 1440px
- max-width 1600px
- Sidebar 240px

1280px未満:

Sidebar自動collapse。

## 4. Component policy

共通UIと画面固有UIを分離する。

例:

```text
shared/
  AppSidebar
  PageHeader
  StatusBadge
  RelativeTime
  EmptyState
  ErrorState
  LoadingSkeleton

dashboard/
projects/
project-detail/
```

## 5. State

Server dataと一時的UI stateを区別する。

UI state例:

- Sidebar collapsed
- Theme
- Done section expanded
- Filter selection

## 6. Theme

- Dark
- Light
- System

Default Dark。

Theme preferenceはlocal persistence可能。

## 7. PWA

v0.1でPWAとしてインストール可能にする方向。

Offline-first Applicationにはしない。