import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { PopupApp } from './popup-app';
import { PopupModel } from './popup-model';
import { realPopupPort } from './popup-port';

const root = document.getElementById('root');
if (!root) throw new Error('Missing popup root');

// HeroUI default tokens, system preference, no provider or remote runtime assets.
const preference = window.matchMedia('(prefers-color-scheme: dark)');
const setTheme = () => { document.documentElement.dataset.theme = preference.matches ? 'dark' : 'light'; };
setTheme();
preference.addEventListener('change', setTheme);
createRoot(root).render(createElement(PopupApp, { model: new PopupModel(realPopupPort) }));
