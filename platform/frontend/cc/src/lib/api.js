import axios from 'axios';
import { supabase } from './supabase';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 10000,
});

async function getAccessToken() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return session?.access_token || null;
}

api.interceptors.request.use(async (config) => {
  const accessToken = await getAccessToken();

  if (!config.headers) {
    config.headers = {};
  }

  if (accessToken) {
    if (typeof config.headers.set === 'function') {
      config.headers.set('Authorization', `Bearer ${accessToken}`);
    } else {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
  } else if (typeof config.headers.delete === 'function') {
    config.headers.delete('Authorization');
  } else {
    delete config.headers.Authorization;
  }

  return config;
});

export function getErrorMessage(error, fallback = 'Si è verificato un errore inatteso.') {
  if (error?.response?.status === 401) {
    return 'La sessione è scaduta. Effettua di nuovo l’accesso.';
  }

  if (error?.code === 'ECONNABORTED' || !error?.response) {
    return 'Impossibile caricare i dati, riprova.';
  }

  if (error?.response?.status >= 500) {
    return 'Il servizio non è disponibile in questo momento. Riprova tra poco.';
  }

  return fallback;
}

export async function fetchStats(params) {
  const { data } = await api.get('/stats', { params });
  return data;
}

export async function fetchTopicsBySegment(params) {
  const { data } = await api.get('/stats/topics-by-segment', { params });
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
