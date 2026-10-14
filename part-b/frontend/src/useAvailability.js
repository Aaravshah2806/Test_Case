import { useEffect, useState } from 'react';
import { request } from './api.js';

export default function useAvailability(serviceId, stylistId, date, refresh) {
  const key = `${serviceId}/${stylistId}/${date}/${refresh}`;
  const ready = Boolean(serviceId && stylistId && date);
  const [state, setState] = useState({ key: '', times: [], loading: false, error: '' });

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setState({ key, times: [], loading: true, error: '' });
    const query = new URLSearchParams({ service_id: serviceId, stylist_id: stylistId, date });
    request(`/availability?${query}`, { signal: controller.signal })
      .then(data => setState({ key, times: data.start_times, loading: false, error: '' }))
      .catch(error => {
        if (error.name !== 'AbortError') {
          setState({ key, times: [], loading: false, error: error.message });
        }
      });
    return () => controller.abort();
  }, [key, ready, serviceId, stylistId, date]);

  // Do not expose stale slots for even one render when the selectors change.
  return ready && state.key === key ? state
    : { times: [], loading: ready, error: '' };
}
