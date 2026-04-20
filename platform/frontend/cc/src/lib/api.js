import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 10000,
});

export function getErrorMessage(error, fallback = 'Si è verificato un errore inatteso.') {
  if (error?.response?.data?.errore) {
    return error.response.data.errore;
  }

  if (error?.response?.data?.dettaglio) {
    return error.response.data.dettaglio;
  }

  if (error?.message) {
    return error.message;
  }

  return fallback;
}

export async function fetchStats() {
  const { data } = await api.get('/stats');
  return data;
}

export async function fetchReviews(params) {
  const { data } = await api.get('/reviews', { params });
  return data;
}

export async function fetchReview(id) {
  const { data } = await api.get(`/reviews/${id}`);
  return data;
}

export async function approveReview(id, risposta_custom) {
  const body = risposta_custom ? { risposta_custom } : {};
  const { data } = await api.post(`/reviews/${id}/approve`, body);
  return data;
}

export async function regenerateReview(id) {
  const { data } = await api.post(`/reviews/${id}/regenerate`);
  return data;
}

export async function fetchLogs(params) {
  const { data } = await api.get('/logs', { params });
  return data;
}

export default api;
