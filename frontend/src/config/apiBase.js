export const API_URL = import.meta.env.VITE_API_URL || '/api';
export const API_BASE = API_URL.replace(/\/api\/?$/, '') || '';
