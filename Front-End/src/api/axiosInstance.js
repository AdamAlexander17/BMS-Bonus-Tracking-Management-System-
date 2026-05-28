import axios from 'axios';

const axiosInstance = axios.create({
  baseURL: '/api/',
  headers: { 'Content-Type': 'application/json' },
});

// Attach access token to every request
axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Queue-based auto-refresh on 401
// Prevents multiple simultaneous refresh calls when several requests expire at once.
let isRefreshing = false;
let failedQueue = [];

function processQueue(error, token = null) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
}

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        // Another refresh is already in flight — queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            original.headers.Authorization = `Bearer ${token}`;
            return axiosInstance(original);
          })
          .catch((err) => Promise.reject(err));
      }

      original._retry = true;
      isRefreshing = true;

      try {
        const refresh = localStorage.getItem('refresh_token');
        if (!refresh) {
          processQueue(new Error('No refresh token'), null);
          localStorage.clear();
          window.location.href = '/login';
          return Promise.reject(new Error('No refresh token'));
        }
        const { data } = await axios.post('/api/token/refresh/', {
          refresh_token: refresh,
        });
        const newToken = data.data.access_token;
        localStorage.setItem('access_token', newToken);
        axiosInstance.defaults.headers.common.Authorization = `Bearer ${newToken}`;
        processQueue(null, newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return axiosInstance(original);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.clear();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
