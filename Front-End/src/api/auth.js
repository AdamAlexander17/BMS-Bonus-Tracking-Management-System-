import axiosInstance from './axiosInstance';
import axios from 'axios';

export const login = (credentials) =>
  axios.post('http://127.0.0.1:8001/api/login/', credentials);

export const logout = (refresh_token) =>
  axiosInstance.post('logout/', { refresh_token });

export const changeOwnPassword = (payload) =>
  axiosInstance.post('users/change-password/', payload);

export const refreshToken = (refresh_token) =>
  axios.post('http://127.0.0.1:8001/api/token/refresh/', { refresh_token });

// Fetch a fresh snapshot of the authenticated user (permissions, brands, roles).
// Called by AuthContext on app boot so the sidebar / gating reflects whatever
// the admin has changed since the user's JWT was minted.
export const fetchMe = () => axiosInstance.get('me/');
