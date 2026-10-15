// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useViewNavigation, viewFromSearch } from './use-view-navigation.js';

afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

it('defaults safely and restores matrix navigation from the URL', () => {
  expect(viewFromSearch('')).toBe('matching');
  expect(viewFromSearch('?view=unknown')).toBe('matching');
  window.history.replaceState(null, '', '/?view=matrix');
  const hook = renderHook(() => useViewNavigation());
  expect(hook.result.current.view).toBe('matrix');
  expect(hook.result.current.matchingVisited).toBe(false);
});

it('keeps the selected view across remounts and retains visited matching state during switches', () => {
  window.history.replaceState({ other: true }, '', '/?filter=kept#anchor');
  const first = renderHook(() => useViewNavigation());
  act(() => first.result.current.selectView('matrix'));
  expect(first.result.current.matchingVisited).toBe(true);
  expect(window.location.search).toBe('?filter=kept&view=matrix');
  expect(window.location.hash).toBe('#anchor');
  expect(window.history.state).toEqual({ other: true });
  first.unmount();
  const reloaded = renderHook(() => useViewNavigation());
  expect(reloaded.result.current.view).toBe('matrix');
  expect(reloaded.result.current.matchingVisited).toBe(false);
  act(() => reloaded.result.current.selectView('matching'));
  expect(window.location.search).toBe('?filter=kept');
  expect(reloaded.result.current.matchingVisited).toBe(true);
  act(() => reloaded.result.current.selectView('matrix'));
  expect(reloaded.result.current.matchingVisited).toBe(true);
});

it('follows browser history changes without forgetting a visited matching workspace', () => {
  window.history.replaceState(null, '', '/?view=matrix');
  const hook = renderHook(() => useViewNavigation());
  act(() => {
    window.history.replaceState(null, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  expect(hook.result.current.view).toBe('matching');
  expect(hook.result.current.matchingVisited).toBe(true);
});
