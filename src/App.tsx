import { useEffect, type MouseEvent, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import AuthPage from './features/auth/AuthPage';
import { AuthProvider, useAuth } from './features/auth/AuthProvider';
import CallbackPage from './features/auth/CallbackPage';
import DashboardPage from './features/events/DashboardPage';
import HostEventPage from './features/events/HostEventPage';
import JoinEventPage from './features/cards/JoinEventPage';
import ParticipantEventPage from './features/cards/ParticipantEventPage';

function Brand() {
  return (
    <Link className="brand" to="/" aria-label="Бинго — на главную">
      <span className="brand-mark" aria-hidden="true">Б</span>
      <span>БИНГО<span className="brand-period">.</span></span>
    </Link>
  );
}

function LandingPage() {
  const scrollToHowItWorks = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <main className="landing">
      <header className="topbar">
        <Brand />
        <nav className="topbar-nav" aria-label="Основная навигация">
          <a href="#how-it-works" onClick={scrollToHowItWorks}>Как это работает</a>
          <Link className="button button-small button-outline" to="/login">Войти <span aria-hidden="true">↗</span></Link>
        </nav>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <div className="eyebrow"><span className="live-dot" /> ИГРАЙТЕ ВМЕСТЕ, ГДЕ БЫ ВЫ НИ БЫЛИ</div>
          <h1 id="hero-title">Ставки сделаны.<br /><span>События — нет.</span></h1>
          <p className="hero-lede">Создай бинго на любой повод. Собери компанию. Отмечай, что сбылось. Остальное — дело удачи.</p>
          <div className="hero-actions">
            <Link className="button button-primary" to="/login">Создать своё бинго <span aria-hidden="true">↗</span></Link>
            <a className="text-link" href="#how-it-works" onClick={scrollToHowItWorks}>Как играть <span aria-hidden="true">↓</span></a>
          </div>
          <div className="hero-proof"><div className="proof-avatars"><i>А</i><i>М</i><i>К</i><b>+</b></div><span>Вечеринки, стримы, рабочие созвоны.<br />Бинго найдётся для всего.</span></div>
        </div>

        <div className="hero-art" aria-label="Пример карточки бинго" role="img">
          <div className="art-star star-one">✳</div>
          <div className="art-star star-two">✳</div>
          <div className="art-note">ПЯТНИЧНЫЙ<br />СОЗВОН № 08 <span>LIVE</span></div>
          <div className="bingo-card-preview">
            <div className="card-preview-head"><strong>СОЗВОН<br />БИНГО</strong><span>03 × 03<br />КАРТОЧКА 01</span></div>
            <div className="card-preview-grid">
              <div className="tile tile-marked">Кто-то<br />опоздал <span>✓</span></div>
              <div className="tile">«Всем<br />слышно?»</div>
              <div className="tile tile-marked">Кот<br />в эфире <span>✓</span></div>
              <div className="tile">Не тот<br />экран</div>
              <div className="tile tile-center">СВОЙ<br />ТРИГГЕР</div>
              <div className="tile">«Я на<br />мьюте»</div>
              <div className="tile tile-marked">Уже<br />пятница <span>✓</span></div>
              <div className="tile">Шутка<br />про кофе</div>
              <div className="tile tile-marked">Пять<br />минут <span>✓</span></div>
            </div>
            <div className="card-preview-foot"><span>СЧЁТ</span><strong>02 <small>ЛИНИИ</small></strong><span className="mini-spark">✳</span></div>
          </div>
          <div className="floating-score"><span>БИНГО!</span><strong>+2</strong><small>ЛИНИИ ЗАКРЫТЫ</small></div>
          <div className="art-stamp">ТВОЯ<br />ИГРА<span>✦</span></div>
          <div className="art-coordinates">КООРДИНАТЫ: ВЕСЕЛЬЕ<br />54° 59' 00" СШ · 82° 53' 00" ВД</div>
        </div>
      </section>

      <section id="how-it-works" className="how-section">
        <div className="section-heading"><span className="eyebrow">ПРОСТО НАЧАТЬ</span><h2>Триггеры случаются.<br /><span>Бинго — тоже.</span></h2></div>
        <div className="steps-grid">
          <article className="step-card"><span className="step-number">01</span><div className="step-icon">✳</div><h3>Придумай игру</h3><p>Задай повод, добавь триггеры и выбери размер карточки. Например: «коллега забыл выключить микрофон».</p></article>
          <article className="step-card"><span className="step-number">02</span><div className="step-icon step-icon-outline">↗</div><h3>Позови друзей</h3><p>Поделись ссылкой. До старта каждый соберёт свою карточку из общих триггеров — повторы не страшны.</p></article>
          <article className="step-card"><span className="step-number">03</span><div className="step-icon">▦</div><h3>Лови моменты</h3><p>Отмечай, что произошло. Считаются завершённые ряды, столбцы и диагонали. Побеждает тот, у кого их больше.</p></article>
        </div>
      </section>

      <footer className="site-footer"><Brand /><span>МЕНЬШЕ СКРОЛЛА. БОЛЬШЕ БИНГО.</span><span>СДЕЛАНО ДЛЯ ХОРОШИХ ИСТОРИЙ © 2026</span></footer>
    </main>
  );
}

function PlaceholderPage() {
  return (
    <main className="placeholder-page">
      <header className="topbar"><Brand /></header>
      <section className="placeholder-card">
        <span className="eyebrow">СКОРО НАЧНЁМ</span>
        <h1>Настраиваем<br /><span>игровое поле.</span></h1>
        <p>Для входа и сохранения событий потребуется подключить Supabase. Пока можно вернуться на главную и посмотреть, как устроена игра.</p>
        <Link className="button button-primary" to="/">На главную <span aria-hidden="true">↗</span></Link>
      </section>
    </main>
  );
}

function AuthRedirector() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    const next = window.sessionStorage.getItem('bingo:return-to');
    if (next && ['/','/login','/auth/callback'].includes(location.pathname)) {
      window.sessionStorage.removeItem('bingo:return-to');
      navigate(next.startsWith('/') ? next : '/dashboard', { replace: true });
    } else if (location.pathname === '/login' || location.pathname === '/auth/callback') {
      navigate('/dashboard', { replace: true });
    }
  }, [location.pathname, navigate, user]);

  return null;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, configured } = useAuth();
  const location = useLocation();
  if (!configured) return <PlaceholderPage />;
  if (loading) return <main className="workspace-page"><div className="loading-panel full-loading">Проверяем вход<span className="loading-dots">•••</span></div></main>;
  if (!user) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  return children;
}

function RoutedApp() {
  return (
    <>
      <AuthRedirector />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/auth/callback" element={<CallbackPage />} />
        <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
        <Route path="/host/:eventId" element={<RequireAuth><HostEventPage /></RequireAuth>} />
        <Route path="/e/:inviteToken" element={<RequireAuth><JoinEventPage /></RequireAuth>} />
        <Route path="/play/:eventId" element={<RequireAuth><ParticipantEventPage /></RequireAuth>} />
        <Route path="*" element={<PlaceholderPage />} />
      </Routes>
    </>
  );
}

export default function App() {
  return <AuthProvider><RoutedApp /></AuthProvider>;
}
