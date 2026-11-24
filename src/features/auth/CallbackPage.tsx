import { Link } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { tr } from '../../lib/i18n';

export default function CallbackPage() {
  const { loading, user } = useAuth();

  return (
    <main className="placeholder-page">
      <header className="topbar">
        <Link className="brand" to="/" aria-label={tr('Бинго — на главную', 'Bingo — home')}><span className="brand-mark">Б</span><span>BINGO<span className="brand-period">.</span></span></Link>
      </header>
      <section className="placeholder-card">
        <span className="eyebrow">{tr('ВХОД В ИГРУ', 'SIGNING IN')}</span>
        <h1>{loading ? <>{tr('Проверяем', 'Checking')}<br /><span>{tr('ссылку.', 'your link.')}</span></> : user ? <>{tr('Ты', 'You’re')}<br /><span>{tr('в игре.', 'in.')}</span></> : <>{tr('Ссылка', 'Link')}<br /><span>{tr('устарела.', 'expired.')}</span></>}</h1>
        <p>{loading ? tr('Подтверждаем почту и готовим игровое поле.', 'Confirming your email and getting the game ready.') : user ? tr('Можно вернуться к событию.', 'You can return to the event.') : tr('Запроси новую ссылку для входа — старая уже не действует.', 'Request a new sign-in link. This one has expired.')}</p>
        <Link className="button button-primary" to={user ? '/dashboard' : '/login'}>{user ? tr('К событиям', 'Go to events') : tr('Запросить ссылку', 'Request a link')} <span aria-hidden="true">↗</span></Link>
      </section>
    </main>
  );
}
