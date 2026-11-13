import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { Audience, BanniereCookies, Consentement } from './consentement';
// Outfit pour les titres (géométrique, graisses fines), DM Sans pour le texte : servies par l'application, sans Google Fonts.
import '@fontsource/outfit/latin-300.css';
import '@fontsource/outfit/latin-400.css';
import '@fontsource/outfit/latin-500.css';
import '@fontsource/outfit/latin-600.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-700.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><Consentement><App /><Audience /><BanniereCookies /></Consentement></BrowserRouter></StrictMode>);
