// src/auth.ts — in-memory session token (cleared on page refresh, like the old login state)
let token = '';
export const setAuthToken = (t: string) => { token = t; };
export const getAuthToken = () => token;
