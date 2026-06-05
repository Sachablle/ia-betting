import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import FootballPage from './FootballPage';
import BasketballPage from './BasketballPage';

export default function SportsPage() {
  const [params] = useSearchParams();
  const active = params.get('sport') || 'football';

  useEffect(() => {
    const y = sessionStorage.getItem('scroll_sports');
    if (y) { window.scrollTo(0, +y); sessionStorage.removeItem('scroll_sports'); }
  }, [active]);

  return active === 'basketball' ? <BasketballPage /> : <FootballPage />;
}
