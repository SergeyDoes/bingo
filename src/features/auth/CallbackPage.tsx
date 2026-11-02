import { Link } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export default function CallbackPage() {
  const { loading, user } = useAuth();

  return (
    <main className="placeholder-page">
      <header className="topbar">
        <Link className="brand" to="/" aria-label="Бинго — на главную"><span className="brand-mark">Б</span><span>БИНГО<span className="brand-period">.</span></span></Link>
      </header>
      <section className="placeholder-card">
        <span className="eyebrow">ВХОД В ИГРУ</span>
        <h1>{loading ? <>Проверяем<br /><span>ссылку.</span></> : user ? <>Ты<br /><span>в игре.</span></> : <>Ссылка<br /><span>устарела.</span></>}</h1>
        <p>{loading ? 'Подтверждаем почту и готовим игровое поле.' : user ? 'Можно вернуться к событию.' : 'Запроси новую ссылку для входа — старая уже не действует.'}</p>
        <Link className="button button-primary" to={user ? '/dashboard' : '/login'}>{user ? 'К событиям' : 'Запросить ссылку'} <span aria-hidden="true">↗</span></Link>
      </section>
    </main>
  );
}
