import * as React from "react";
import { createRoot } from "react-dom/client";

import { RelationLineLayer, type LineSpec } from "../../src/features/relations-view/relation-line-layer.js";

const parameters = new URLSearchParams(window.location.search);
const selected = parameters.get("selected") === "true";
const pending = parameters.get("pending") === "true";
const line = {
  lineId: "tc:100:10->wi:200",
  testCaseItemKey: "tc:100:10",
  workItemItemKey: "wi:200",
  testCaseWorkItemId: 100,
  workItemWorkItemId: 200,
  pending,
  conflict: true
} as LineSpec;

function Harness(): React.ReactElement {
  const [container, setContainer] = React.useState<HTMLDivElement | null>(null);
  return (
    <div ref={setContainer} className="relations-view" style={{ height: "180px" }}>
      <div
        data-item-key={line.testCaseItemKey}
        data-relations-anchor="left"
        style={{ position: "absolute", left: "20px", top: "20px", width: "180px", height: "36px" }}
      />
      <div
        data-item-key={line.workItemItemKey}
        data-relations-anchor="right"
        style={{ position: "absolute", left: "400px", top: "90px", width: "180px", height: "36px" }}
      />
      <RelationLineLayer
        container={container}
        lines={[line]}
        draft={null}
        selectedLineId={selected ? line.lineId : null}
        onSelectLine={() => undefined}
        onVisibleLineIdsChange={() => undefined}
        layoutVersion={0}
      />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
