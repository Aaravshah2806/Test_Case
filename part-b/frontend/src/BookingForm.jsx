import { useState } from 'react';
import { formatDate, formatTime, localDate, request, rupees } from './api.js';
import useAvailability from './useAvailability.js';
import { validateCustomer } from './validation.js';

export default function BookingForm({ services, stylists, onBooked }) {
  const [serviceId, setServiceId] = useState(services[0].id);
  const [stylistId, setStylistId] = useState(stylists[0].id);
  const [date, setDate] = useState(localDate);
  const [time, setTime] = useState('');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const availability = useAvailability(serviceId, stylistId, date, refresh);
  const service = services.find(item => item.id === Number(serviceId));
  const stylist = stylists.find(item => item.id === Number(stylistId));

  function choose(setter, value) {
    setter(value);
    setTime('');
    setMessage('');
  }

  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    const nextErrors = validateCustomer(name, mobile);
    if (!time || !availability.times.includes(time)) nextErrors.time = 'Choose an available time.';
    setErrors(nextErrors);
    setMessage('');
    if (Object.keys(nextErrors).length) return;
    setPending(true);
    try {
      const result = await request('/bookings', {
        method: 'POST',
        body: JSON.stringify({
          service_id: Number(serviceId), stylist_id: Number(stylistId), date,
          start_time: time, customer_name: name.trim(), mobile,
        }),
      });
      onBooked(result);
    } catch (error) {
      setMessage(error.message);
      if (error.status === 409) {
        setTime('');
        setRefresh(value => value + 1);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="booking-layout" onSubmit={submit} noValidate>
      <div className="panel booking-panel">
        <fieldset disabled={pending}>
          <legend><span className="step">01</span> Choose your service</legend>
          <div className="services">
            {services.map(item => (
              <button type="button" className="service-option" key={item.id}
                aria-pressed={Number(serviceId) === item.id}
                onClick={() => choose(setServiceId, item.id)}>
                <span className="service-name">{item.name}</span>
                <span className="service-meta">{item.duration_minutes} min <span>·</span> {rupees(item.price_rupees)}</span>
                <span className="service-tick" aria-hidden="true">{Number(serviceId) === item.id ? '✓' : '+'}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset disabled={pending}>
          <legend><span className="step">02</span> Find your time</legend>
          <div className="selector-row">
            <label>Stylist<select value={stylistId} onChange={event => choose(setStylistId, event.target.value)}>
              {stylists.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select></label>
            <label>Appointment date<input type="date" required value={date}
              onChange={event => choose(setDate, event.target.value)} /></label>
          </div>
          <p className="muted small">{stylist.name} · {formatTime(stylist.work_start)}–{formatTime(stylist.work_end)} · All times are IST</p>
          <div className="times-heading"><span>Available start times</span>
            <button className="text-button" type="button" disabled={availability.loading || !date}
              onClick={() => { setTime(''); setRefresh(value => value + 1); }}>Refresh</button>
          </div>
          <div aria-live="polite" aria-busy={availability.loading}>
            {!date ? <p className="empty-state">Choose a date to see available times.</p>
              : availability.loading ? <p className="empty-state">Finding available times…</p>
              : availability.error ? <p className="error" role="alert">{availability.error} Use Refresh to try again.</p>
              : !availability.times.length ? <p className="empty-state">No times left for this service. Try another stylist or date.</p>
              : <div className="slots" role="group" aria-label="Available start times">
                {availability.times.map(slot => <button type="button" key={slot}
                  aria-pressed={time === slot} onClick={() => { setTime(slot); setErrors(value => ({ ...value, time: '' })); }}>
                  {formatTime(slot)}
                </button>)}
              </div>}
          </div>
          {errors.time && <p className="error" role="alert">{errors.time}</p>}
        </fieldset>
        <fieldset disabled={pending}>
          <legend><span className="step">03</span> Your details</legend>
          <div className="selector-row">
            <label>Your name<input autoComplete="name" name="customer_name" value={name} maxLength={100}
              placeholder="e.g. Asha Shah" required aria-invalid={Boolean(errors.customer_name)}
              aria-describedby={errors.customer_name ? 'name-error' : undefined}
              onChange={event => setName(event.target.value)} />
              {errors.customer_name && <span id="name-error" className="error">{errors.customer_name}</span>}
            </label>
            <label>Mobile number<input type="tel" inputMode="numeric" autoComplete="tel-national" name="mobile"
              value={mobile} placeholder="10-digit mobile number" maxLength={10} required
              aria-invalid={Boolean(errors.mobile)}
              aria-describedby={errors.mobile ? 'mobile-help mobile-error' : 'mobile-help'}
              onChange={event => setMobile(event.target.value)} />
              <span id="mobile-help" className="muted small">10 digits, without +91 or spaces.</span>
              {errors.mobile && <span id="mobile-error" className="error">{errors.mobile}</span>}
            </label>
          </div>
        </fieldset>
      </div>
      <aside className="panel summary" aria-labelledby="summary-title">
        <p className="eyebrow">YOUR APPOINTMENT</p><h2 id="summary-title">A moment, just for you.</h2>
        <dl>
          <div><dt>Service</dt><dd>{service.name}</dd></div>
          <div><dt>Duration</dt><dd>{service.duration_minutes} minutes</dd></div>
          <div><dt>Stylist</dt><dd>{stylist.name}</dd></div>
          <div><dt>Date</dt><dd>{date ? formatDate(date) : 'Choose a date'}</dd></div>
          <div><dt>Time</dt><dd>{time ? `${formatTime(time)} IST` : 'Choose a time'}</dd></div>
        </dl>
        <div className="total"><span>Total</span><strong>{rupees(service.price_rupees)}</strong></div>
        {message && <p className="error" role="alert">{message}</p>}
        <button type="submit" className="primary" disabled={pending || availability.loading || !time}>
          {pending ? 'Reserving your time…' : 'Confirm appointment →'}
        </button>
        <p className="muted small">Pay at the salon. Your slot is reserved once your booking is confirmed.</p>
      </aside>
    </form>
  );
}
