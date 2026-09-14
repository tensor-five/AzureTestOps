import * as React from 'react';
import { createPortal } from 'react-dom';
type Tooltip = {
    id: string;
    label: string;
    x: number;
    y: number;
    anchor: HTMLElement;
};
const Context = React.createContext<{
    active: Tooltip | null;
    show(value: Tooltip): void;
    hide(id: string): void;
    updateLabel(id: string, label: string): void;
}>({ active: null, show: () => { }, hide: () => { }, updateLabel: () => { } });
/** A single tooltip follows the latest pointer/focus target, including fixed-edge cells. */
export function MatrixTooltipProvider({ children }: {
    children: React.ReactNode;
}) {
    const [active, setActive] = React.useState<Tooltip | null>(null);
    const hide = React.useCallback((id: string) => setActive(t => t?.id === id ? null : t), []);
    const updateLabel = React.useCallback((id: string, label: string) => {
        setActive(t => t?.id === id && t.label !== label ? { ...t, label } : t);
    }, []);
    React.useEffect(() => {
        const dismissOutside = (event: PointerEvent) => setActive(current =>
            current && event.target instanceof Node && !current.anchor.contains(event.target) ? null : current);
        document.addEventListener('pointerdown', dismissOutside, true);
        return () => document.removeEventListener('pointerdown', dismissOutside, true);
    }, []);
    React.useEffect(() => { const reposition = () => setActive(t => { if (!t)
        return null; if (!t.anchor.isConnected) return null; const b = t.anchor.getBoundingClientRect(); return { ...t, x: Math.max(8, Math.min(b.left, window.innerWidth - Math.min(320, window.innerWidth - 16) - 8)), y: Math.max(8, Math.min(b.bottom + 4, window.innerHeight - 100)) }; }); window.addEventListener('scroll', reposition, true); window.addEventListener('resize', reposition); return () => { window.removeEventListener('scroll', reposition, true); window.removeEventListener('resize', reposition); }; }, []);
    return <Context.Provider value={{ active, show: setActive, hide, updateLabel }}>{children}{active && createPortal(<div id={active.id} role="tooltip" className="matrix-tooltip" style={{ left: active.x, top: active.y }}>{active.label}</div>, document.body)}</Context.Provider>;
}
export const useMatrixTooltip = () => React.useContext(Context);
