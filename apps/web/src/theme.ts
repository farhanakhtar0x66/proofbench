import { useEffect, useState } from 'react';

// Light or dark. With no choice saved, the page follows the system setting.
// index.html applies a saved choice before the first paint, so the page never
// flashes the wrong theme.
export type Theme = 'light' | 'dark';
const KEY = 'proofbench_theme';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

function chosen(): Theme | undefined {
  const value = document.documentElement.dataset.theme;
  return value === 'light' || value === 'dark' ? value : undefined;
}

export function currentTheme(): Theme {
  return chosen() ?? (media().matches ? 'dark' : 'light');
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#101010' : '#f7f7f7');
  try { localStorage.setItem(KEY, theme); } catch { /* private mode: the choice lasts for this page only */ }
}

export function toggleTheme() {
  setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}

/** The theme in effect, updated when the choice or the system setting changes. */
export function useTheme(): Theme {
  const [theme, setState] = useState<Theme>(currentTheme);
  useEffect(() => {
    const update = () => setState(currentTheme());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const query = media();
    query.addEventListener('change', update);
    return () => { observer.disconnect(); query.removeEventListener('change', update); };
  }, []);
  return theme;
}
