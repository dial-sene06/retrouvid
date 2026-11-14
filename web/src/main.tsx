import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { Audience, BanniereCookies, Consentement } from './consentement';
// Polices (Manrope, IBM Plex Mono, Caveat) servies par l'application depuis /fonts, déclarées dans styles.css.
import './styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><Consentement><App /><Audience /><BanniereCookies /></Consentement></BrowserRouter></StrictMode>);
