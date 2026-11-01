# `docs/architecture/overview.md`

## 1. 目的

Personal Desk全体の技術Architectureを定義する。

## 2. 基本思想

Personal Deskは各サービスのSource of Truthを置き換えない。

役割:

- 集約
- Normalization
- 横断表示
- Activity生成
- Navigation
- Cache

## 3. Application form

Web Application + PWA。

WindowsとmacOSのBrowserから同じApplicationを利用する。

## 4. Technology

- TypeScript
- Next.js
- React
- Tailwind CSS
- shadcn/ui
- Node.js
- PostgreSQL
- Drizzle ORM
- Docker Compose

## 5. Logical Architecture

```text
Browser / PWA
      │
      ▼
Next.js Web
      │
      ├── Application API
      │
      ├── PostgreSQL
      │
      └── Integration Layer
             │
             ├── Notion
             ├── GitHub
             ├── Google Calendar
             └── Prometheus
```

将来:

```text
Web
 │
 ├── PostgreSQL
 │
 └── Worker
       └── Integrations
```

## 6. Repository Direction

```text
personal-desk/
├── apps/
│   ├── web/
│   └── worker/
├── packages/
│   ├── core/
│   ├── database/
│   ├── integrations/
│   ├── i18n/
│   └── ui/
├── docs/
├── compose.yaml
└── README.md
```

必要になるまですべてのDirectoryを作成する必要はない。