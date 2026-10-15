import * as React from 'react';

export type ViewMode = 'matching' | 'matrix';
export function viewFromSearch(search: string): ViewMode {
  return new URLSearchParams(search).get('view') === 'matrix' ? 'matrix' : 'matching';
}

/** The URL survives a browser reload; visited matching state survives in-app switches. */
export function useViewNavigation() {
  const [view, setView] = React.useState<ViewMode>(() => viewFromSearch(window.location.search));
  const [matchingVisited, setMatchingVisited] = React.useState(view === 'matching');
  const selectView = React.useCallback((next: ViewMode) => {
    setView(next);
    if (next === 'matching') setMatchingVisited(true);
    const url = new URL(window.location.href);
    if (next === 'matrix') url.searchParams.set('view', next);
    else url.searchParams.delete('view');
    window.history.replaceState(window.history.state, '', url);
  }, []);
  React.useEffect(() => {
    const restore = () => {
      const next = viewFromSearch(window.location.search);
      setView(next);
      if (next === 'matching') setMatchingVisited(true);
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  return { view, selectView, matchingVisited };
}
