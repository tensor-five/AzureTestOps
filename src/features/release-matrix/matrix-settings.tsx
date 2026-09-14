import * as React from 'react';
import type { MatrixSnapshot } from '../../application/dto/release-matrix.dto.js';
import type { MatrixConfig, MatrixColumn } from '../../domain/release-matrix/matrix-config.js';
import { catalogRows, resolveSource, mappingKey, versionTitle } from './matrix-presentation.js';
export function MatrixSettings({ snapshot, config, update }: {
    snapshot: MatrixSnapshot;
    config: MatrixConfig;
    update(patch: Partial<MatrixConfig>): void;
}) {
    const contexts = config.separateEnvironments === false ? [] : [...new Map(catalogRows(snapshot,config).map(row=>[mappingKey(row,''),row])).values()]
        .sort((a,b)=>a.environment.localeCompare(b.environment)||a.content.localeCompare(b.content));
    const change = (id:string,patch:Partial<MatrixColumn>)=>update({columns:config.columns.map(c=>c.id===id?{...c,...patch}:c)});
    const move = (index:number,direction:number)=>{const columns=[...config.columns];[columns[index],columns[index+direction]]=[columns[index+direction],columns[index]];update({columns});};
    const describe = (suite:MatrixSnapshot['suites'][number])=>`${suite.path} (#${suite.id})`;
    return <section className="matrix-settings" aria-label="Matrix konfigurieren">
      <p>Wähle die Versions-Suites für den Vergleich. Die sichtbaren Versionen liefern die Testfälle. Darunter werden Umgebung und Inhalt über ihre direkten Unterordner zugeordnet.</p>
      {config.separateEnvironments === false && <p>Testfälle werden über Umgebungen hinweg zusammengefasst. Wenn mehrere Quellsuites denselben Testfall enthalten, wähle die Umgebung direkt in der jeweiligen Zelle.</p>}
      <div className="matrix-column-settings">{config.columns.map((column,index)=><fieldset key={column.id}>
        <legend>Spalte {index+1}</legend>
        <label>Versions-Suite<select aria-label={`Versions-Suite ${index+1}`} value={column.versionSuiteId} onChange={e=>change(column.id,{versionSuiteId:Number(e.target.value)})}>
          <option value={0}>Versions-Suite auswählen</option>
          {snapshot.suites.map(s=><option key={s.id} value={s.id}>{describe(s)}</option>)}
          {column.versionSuiteId>0&&!snapshot.suites.some(s=>s.id===column.versionSuiteId)&&<option value={column.versionSuiteId}>Versions-Suite #{column.versionSuiteId} · ungültig</option>}
        </select></label>
        <label><input type="checkbox" aria-label={`Spalte ${index+1} anzeigen`} checked={column.visible} onChange={e=>change(column.id,{visible:e.target.checked})}/>Anzeigen</label>
        <div><button type="button" aria-label={`Spalte ${index+1} nach links`} disabled={index===0} onClick={()=>move(index,-1)}>←</button><button type="button" aria-label={`Spalte ${index+1} nach rechts`} disabled={index===config.columns.length-1} onClick={()=>move(index,1)}>→</button><button type="button" aria-label={`Spalte ${index+1} entfernen`} onClick={()=>update({columns:config.columns.filter(c=>c.id!==column.id)})}>Entfernen</button></div>
        {contexts.map(row=>{
          const source=resolveSource(snapshot,config,row,column),key=mappingKey(row,column.id),explicit=config.mappings[key];
          return <label key={key}>{row.environment} / {row.content}<select aria-label={`Suite für ${row.environment} / ${row.content} / ${versionTitle(snapshot,column)}`} value={explicit??''} onChange={e=>{
            const mappings={...config.mappings};if(e.target.value)mappings[key]=Number(e.target.value);else delete mappings[key];update({mappings});
          }}>
            <option value="">Automatisch · {source.suite&&!explicit?describe(source.suite):source.ambiguous?'mehrdeutig':source.reason||'direkter Quellpfad'}</option>
            {source.candidates.map(s=><option key={s.id} value={s.id}>{describe(s)}</option>)}
            {explicit&&!source.candidates.some(s=>s.id===explicit)&&<option value={explicit}>Suite #{explicit} · Zuordnung ungültig</option>}
          </select></label>;
        })}
      </fieldset>)}</div>
      <button type="button" onClick={()=>update({columns:[...config.columns,{id:crypto.randomUUID(),versionSuiteId:0,visible:true}]})}>Spalte hinzufügen</button>
    </section>;
}
