import * as React from 'react';
import { useMatrixTooltip } from './matrix-tooltip.js';
import type { TestCaseProjection } from '../../domain/test-management/test-case-projection.js';
import { outcomeDisplay } from '../../domain/test-management/outcome-display.js';
import { manualOutcomes, type ManualOutcome } from '../../domain/release-matrix/matrix-config.js';
export type MatrixCellProps = {
    projection?: TestCaseProjection;
    pointCount: number;
    pending: boolean;
    missingSuite: boolean;
    ambiguous: boolean;
    missingSuiteReason?: string;
    sourceDescription?: string;
    readOnlyReason?: string;
    onConfigure(): void;
    onChange(outcome: ManualOutcome): void;
};
export function MatrixCell(props: MatrixCellProps) {
    const tooltip = useMatrixTooltip();
    const [keyboardOutcome, setKeyboardOutcome] = React.useState<ManualOutcome | null>(null);
    const host = React.useRef<HTMLDivElement>(null);
    const pointerType = React.useRef('mouse');
    const id = React.useId();
    const p = props.projection;
    const reason = props.missingSuite ? (props.missingSuiteReason || (props.ambiguous ? 'Mehrere gleichnamige Suites: Suite zuordnen.' : 'Suite fehlt oder Zuordnung ist ungültig.')) : !p ? 'Nicht in dieser Suite' : props.readOnlyReason || (props.pointCount !== 1 ? `${props.pointCount} Testpunkte: Zum Speichern ist genau ein Testpunkt erforderlich.` : '');
    const label = p ? `${p.lastOutcome || 'Unknown'} · ${p.title} · ${props.sourceDescription ?? p.suitePath}${reason ? ' · ' + reason : ''}` : reason;
    const { hide, updateLabel } = tooltip;
    React.useEffect(() => { updateLabel(id, label); }, [id, label, updateLabel]);
    React.useEffect(() => () => hide(id), [id, hide]);
    const show = () => { const box = host.current?.getBoundingClientRect(); if (box)
        tooltip.show({ id, label, anchor: host.current!, x: Math.max(8, Math.min(box.left, window.innerWidth - Math.min(320, window.innerWidth - 16) - 8)), y: Math.min(box.bottom + 4, window.innerHeight - 100) }); };
    const display = p ? outcomeDisplay(p.lastOutcome) : null;
    return <div ref={host} className="matrix-cell-control" aria-busy={props.pending} tabIndex={reason ? 0 : undefined} aria-label={reason || undefined} aria-describedby={tooltip.active?.id === id ? id : undefined}
      onPointerEnter={event => { pointerType.current = event.pointerType; }}
      onPointerDown={event => { pointerType.current = event.pointerType; }}
      onMouseEnter={show} onMouseLeave={() => {
          if (pointerType.current !== 'touch' && !host.current?.contains(document.activeElement)) tooltip.hide(id);
      }} onFocus={show} onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget)) tooltip.hide(id);
          setKeyboardOutcome(null);
      }} onClick={show}>
    {p && display ? <><span aria-hidden="true" className={`relations-view-outcome-chip relations-view-outcome-chip-${display.slug}`}>{outcomeDisplay(keyboardOutcome ?? p.lastOutcome).shortLabel}</span>
      <select aria-label={label} aria-describedby={tooltip.active?.id === id ? id : undefined} value={keyboardOutcome ?? p.lastOutcome} onKeyDown={e => {
                if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !e.altKey) {
                    e.preventDefault();
                    const current = manualOutcomes.indexOf((keyboardOutcome ?? p.lastOutcome) as ManualOutcome);
                    setKeyboardOutcome(manualOutcomes[Math.max(0, Math.min(manualOutcomes.length - 1, current + (e.key === "ArrowDown" ? 1 : -1)))]);
                }
                if (e.key === "Enter" && keyboardOutcome) {
                    e.preventDefault();
                    props.onChange(keyboardOutcome);
                    setKeyboardOutcome(null);
                }
                if (e.key === "Escape") {
                    setKeyboardOutcome(null);
                    tooltip.hide(id);
                }
            }} disabled={props.pending || props.pointCount !== 1 || !!props.readOnlyReason} onChange={e => { setKeyboardOutcome(null); props.onChange(e.target.value as ManualOutcome); }}>
        {!manualOutcomes.includes(p.lastOutcome as ManualOutcome) && <option disabled value={p.lastOutcome}>{p.lastOutcome}</option>}
        {manualOutcomes.map(o => <option key={o} value={o}>{o}</option>)}
      </select></> : <button type="button" aria-label={reason} onClick={() => { show(); if (props.ambiguous)
            props.onConfigure(); }}>{props.missingSuite ? '?' : '·'}</button>}

  </div>;
}
