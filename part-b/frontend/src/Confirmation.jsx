import { useEffect, useRef } from 'react';
import { formatDate, rupees } from './api.js';

const appointmentTime = value => new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true,
}).format(new Date(value));

export default function Confirmation({ booking, onNewBooking }) {
  const heading = useRef(null);
  useEffect(() => heading.current?.focus(), []);
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(booking.starts_at));

  return (
    <section className="confirmation panel" aria-labelledby="confirmation-title">
      <span className="success-mark" aria-hidden="true">✓</span>
      <p className="eyebrow">YOU’RE ALL SET</p>
      <h1 id="confirmation-title" ref={heading} tabIndex={-1}>Your time is reserved.</h1>
      <p className="muted">We look forward to seeing you at Studio Salon.</p>
      <dl className="receipt">
        <div><dt>Service</dt><dd>{booking.service}</dd></div>
        <div><dt>Stylist</dt><dd>{booking.stylist}</dd></div>
        <div><dt>Date</dt><dd>{formatDate(date)}</dd></div>
        <div><dt>Time · IST</dt><dd>{appointmentTime(booking.starts_at)} – {appointmentTime(booking.ends_at)}</dd></div>
        <div className="receipt-total"><dt>Price</dt><dd>{rupees(booking.price_rupees)}</dd></div>
      </dl>
      <div className="booking-id"><span>Booking ID</span><code>{booking.id}</code></div>
      <p className="muted small">Save your booking ID for reference. No online payment is required.</p>
      <button className="primary" onClick={onNewBooking}>Book another appointment</button>
    </section>
  );
}
