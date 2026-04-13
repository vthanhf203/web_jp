# JP Lab - Japanese Learning Website

This project is a Japanese learning platform inspired by nhaikanji.

## Features

- Register / Login
- Kanji library + draw recognition
- Vocabulary library (admin shared + personal lessons)
- Grammar library (N5/N4)
- Add cards into SRS deck
- SRS review flow (Again / Hard / Good / Easy)
- JLPT mini quiz
- XP and streak tracking

## Tech stack

- Next.js 16 (App Router + Server Actions)
- Prisma + PostgreSQL
- Tailwind CSS
- jose, bcryptjs, zod

## Local setup

1. Install dependencies

```bash
npm install
```

2. Configure environment variables

```bash
cp .env.example .env
```

Then edit `.env`:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require"
AUTH_SECRET="replace-with-a-long-random-secret"
ADMIN_EMAILS="admin@example.com"
```

3. Sync database schema

```bash
npm run db:push
```

4. Seed sample data

```bash
npm run db:seed
```

5. Start dev server

```bash
npm run dev
```

Open http://localhost:3000

## Migrate old file data into DB (optional)

If you already have old JSON data in `data/` from previous versions:

```bash
npm run data:migrate-to-db
```

This migrates:

- `data/admin-vocab-library.json`
- `data/grammar/minna-n4n5.json`
- `data/vocab-lessons/*.json`

into PostgreSQL (`AppData` table).

## Deploy free (recommended)

Use **Vercel + Neon PostgreSQL (free tier)**.

1. Push project to GitHub.
2. Create a Neon database and copy the connection string.
3. Import repository into Vercel.
4. In Vercel Project Settings -> Environment Variables, add:
   - `DATABASE_URL`
   - `AUTH_SECRET`
   - `ADMIN_EMAILS`
5. Deploy.
6. After first deploy, run schema sync once:

```bash
npx prisma db push
```

(you can run this locally with the same `DATABASE_URL`, or from a deploy shell)

## API endpoints

- `GET /api/grammar` (supports `level`, `lesson`, `q`)
- `GET /api/vocab-library` (supports `level`, `q`)
- `GET /api/kanji-library` (supports `level`, `q`)

## Notes

- Admin vocab manager: `/admin/vocab`
- Admin grammar manager: `/admin/grammar`
- Admin kanji manager: `/admin/kanji`
- Grammar image upload now stores image data in DB (works on serverless hosts).
