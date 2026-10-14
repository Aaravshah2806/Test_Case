import { useEffect, useState } from 'react';
import { request } from './api.js';
import BookingForm from './BookingForm.jsx';
import Confirmation from './Confirmation.jsx';

export default function App() {
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [booking, setBooking] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    Promise.all([
      request('/services', { signal: controller.signal }),
      request('/stylists', { signal: controller.signal }),
    ]).then(([services, stylists]) => {
      if (!services.length || !stylists.length) throw new Error('The salon catalog is not ready yet.');
      setCatalog({ services, stylists });
    }).catch(problem => {
      if (problem.name !== 'AbortError') setError(problem.message);
    });
    return () => controller.abort();
  }, [reload]);

  return (
    <>
      <header className="site-header"><a className="brand" href="/" aria-label="Studio Salon home">
        <span className="brand-mark">S</span><span>STUDIO <span className="brand-light">/ SALON</span></span>
      </a><span className="header-note">Good hair. A little self-care.</span></header>
      <main>
        {booking ? <Confirmation booking={booking} onNewBooking={() => setBooking(null)} /> : <>
          <div className="intro"><p className="eyebrow">MAKE TIME FOR YOURSELF</p>
            <h1>Your next good hair day<br /><em>starts here.</em></h1>
            <p className="muted">Choose your service, find your stylist, and we’ll save you a seat.</p>
          </div>
          {error ? <section className="panel load-state" role="alert"><h2>We couldn’t load the salon.</h2>
            <p>{error}</p><button className="primary" onClick={() => setReload(value => value + 1)}>Try again</button>
          </section> : !catalog ? <p className="panel load-state" role="status">Getting the salon ready…</p>
            : <BookingForm services={catalog.services} stylists={catalog.stylists} onBooked={setBooking} />}
        </>}
      </main>
      <footer><span>STUDIO SALON</span><span>A little care goes a long way.</span></footer>
    </>
  );
}
