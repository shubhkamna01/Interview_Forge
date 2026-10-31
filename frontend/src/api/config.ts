/**
 * Where the backend lives. "/api" works in development through the Vite proxy (see vite.config.ts).
 * For a deployed site set VITE_API_URL to the full URL, e.g. https://api.example.com/api
 */
export const API_URL: string = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");
