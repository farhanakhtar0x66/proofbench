import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';

export type WorkspacePath = '/' | '/race' | '/execution' | '/execution/runs' | '/benchmarks' | '/benchmarks/routing' | '/verify' | '/guide';
const paths: readonly WorkspacePath[] = ['/', '/race', '/execution', '/execution/runs', '/benchmarks', '/benchmarks/routing', '/verify', '/guide'];
const legacy: Record<string, WorkspacePath | undefined> = {
  '#track-d': '/benchmarks', '#controlled-benchmark': '/benchmarks/routing', '#comparison': '/benchmarks/routing',
  '#workspace': '/execution', '#execution-map': '/execution', '#run-inspector': '/execution', '#execution-trace': '/execution',
  '#run-ledger': '/execution/runs', '#workspace-features': '/guide', '#workspace-faq': '/guide',
  '#verification-input': '/verify', '#freshness-findings': '/verify', '#saved-assessment': '/verify',
};

function readRoute() {
  const pathname = window.location.pathname.replace(/\/$/, '') || '/';
  const anchor = window.location.hash;
  const savedBenchmark = new URLSearchParams(window.location.search).has('trackSession');
  const path = pathname === '/' && (legacy[anchor] || savedBenchmark)
    ? legacy[anchor] ?? '/benchmarks'
    : paths.find(item => item === pathname) ?? '/';
  return { path, anchor, savedBenchmark, href: `${window.location.pathname}${window.location.search}${anchor}` };
}

export function useWorkspaceNavigation() {
  const [route, setRoute] = useState(readRoute);
  const lastBenchmark = useRef<string | undefined>(undefined);
  const current = useRef(route);

  function update() {
    if (current.current.path === '/benchmarks' && current.current.savedBenchmark) {
      lastBenchmark.current = current.current.href;
    }
    const next = readRoute();
    current.current = next;
    setRoute(next);
  }

  useEffect(() => {
    window.addEventListener('popstate', update);
    window.addEventListener('hashchange', update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener('hashchange', update);
    };
  }, []);

  function navigate(href: string) {
    current.current = readRoute();
    const destination = href === '/benchmarks'
      ? (current.current.path === '/benchmarks' ? current.current.href : lastBenchmark.current ?? href)
      : href;
    if (destination !== current.current.href) window.history.pushState(null, '', destination);
    update();
  }

  return { route, navigate };
}

export function WorkspaceLink({ href, navigate, active, className, children }: {
  href: string; navigate: (href: string) => void; active?: boolean; className?: string; children: ReactNode;
}) {
  function follow(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(href);
  }

  return <a href={href} onClick={follow} aria-current={active ? 'page' : undefined} className={className}>{children}</a>;
}
