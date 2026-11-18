# Бинго

Сервис для бинго-событий: ведущий публикует набор триггеров и дедлайн, участники собирают свои карточки, ведущий отмечает произошедшее, а завершённые линии определяют итоговый счёт.

## Локальный запуск

Нужен Node.js 24 или новее.

```powershell
npm ci
Copy-Item .env.example .env.local
```

Заполни `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_BASE_PATH=/
```

Запусти интерфейс:

```powershell
npm run dev
```

## Supabase

1. Создай Supabase-проект.
2. В SQL Editor выполни SQL-файлы из `supabase/migrations/` по порядку, включая `202611180001_twitch_host_allowlist.sql` — `202611180005_test_card_2x2.sql`.
3. В Settings → API Keys скопируй Project URL и **publishable key** в `.env.local`.
4. В Authentication → URL Configuration добавь адрес GitHub Pages как разрешённый Redirect URL (обычно `https://<owner>.github.io/<repo>/`).
5. В Authentication → Sign In / Providers включи Twitch и добавь Client ID и Client Secret. В Twitch Developer Console OAuth Redirect URL должен быть `https://<project-ref>.supabase.co/auth/v1/callback`.

Ведущий тоже может играть: до старта события он присоединяется со своим игровым именем и собирает отдельную карточку. После старта присоединиться с новой карточкой уже нельзя.

Publishable key предназначен для браузера и попадёт в собранный JavaScript. Доступ к данным ограничивается RLS. Никогда не добавляй в `.env.local`, исходники или GitHub Actions **secret key** (`sb_secret_...`) или устаревший `service_role` key.

## Права ведущих

Войти и играть могут все. Создавать события могут аккаунты из закрытого allowlist. Для предварительного аппрува Twitch-ника выполни в Supabase SQL Editor:

```sql
insert into public.bingo_host_username_allowlist (twitch_username)
values ('nickname');
```

Ник указывается без `@`, в нижнем регистре. Удалить аппрув можно так:

```sql
delete from public.bingo_host_username_allowlist
where twitch_username = 'nickname';
```

Числовой Twitch ID тоже поддерживается через `public.bingo_host_allowlist`. Обе таблицы закрыты от браузера, а право проверяется непосредственно при создании события.

Ведущий может отметить событие публичным при создании или до старта. Пока набор открыт, оно будет видно всем вошедшим игрокам. Ведущий также может назначать модераторами участников; модераторы во время игры могут менять только отметки триггеров.
## GitHub Pages

Workflow `.github/workflows/deploy-pages.yml` собирает проект и публикует `dist/` при push в `main`. Он использует официальную схему GitHub Pages с `configure-pages`, `upload-pages-artifact` и `deploy-pages`.

1. Добавь в Settings → Secrets and variables → Actions два repository secrets: `VITE_SUPABASE_URL` и `VITE_SUPABASE_PUBLISHABLE_KEY`.
2. В Settings → Pages установи Build and deployment source в **GitHub Actions**.
3. В Supabase добавь production URL сайта в Authentication → URL Configuration. Для project pages адрес обычно выглядит как `https://<owner>.github.io/<repo>/`.
4. Отправь изменения в `main` или запусти workflow вручную из вкладки Actions.

GitHub Actions определяет базовый путь Pages при сборке. Если нужно переопределить его (например, для собственного домена), добавь repository variable `VITE_BASE_PATH`; для домена верхнего уровня значение — `/`.

Инструкция GitHub по публикации: [Using custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
