export interface BuildEnrichmentPromptOptions {
  snapshotDir: string;
  fileKey: string;
}

/**
 * Build the prompt sent to `claude -p` for the Plugin-API enrichment pass.
 *
 * The prompt instructs Claude to read the REST-emitted snapshot, call the
 * figma MCP tool once with a script that iterates over every node ID, merge
 * the returned enrichment into each on-disk JSON, and write a summary.
 */
export function buildEnrichmentPrompt(opts: BuildEnrichmentPromptOptions): string {
  const { snapshotDir, fileKey } = opts;
  return `# crew figma-snapshot — Plugin-API enrichment task

You are a one-shot worker. Walk the snapshot at \`${snapshotDir}\` and add Plugin-API-only data to each per-node JSON (\`componentProperties\`, \`mainComponent\`, \`boundVariables\`). The REST data on disk is the source of truth for everything else — do not modify the \`raw\` field of any JSON file.

## Inputs

- Snapshot index: \`${snapshotDir}/index.json\`
- Figma file key: \`${fileKey}\`

## Procedure

1. Read \`${snapshotDir}/index.json\`. Extract the array of node IDs (the object's keys).
2. Call the \`mcp__plugin_figma_figma__use_figma\` MCP tool ONCE with the script in the section below. Substitute \`<NODE_IDS_JSON>\` with a JSON array of the node IDs (the keys from index.json). Pass \`fileKey: "${fileKey}"\` and \`skillNames: "figma-use"\`.
3. The script returns an object mapping nodeId → enrichment object (or \`{ error: "..." }\` per node that failed).
4. For each successful entry, read the corresponding metadata JSON file (per \`index.json\`'s \`metadataPath\` field, joined to \`${snapshotDir}\`), add the returned enrichment object as a top-level \`enrichment\` field on the JSON, and write the file back to disk. Do NOT modify the \`raw\` field.
5. When all files are written, output a single-line JSON summary to stdout matching this shape exactly (this is the LAST line of stdout, nothing after it):

   \`{"enrichedNodeCount": <number>, "errors": [{"nodeId": "<id>", "reason": "<message>"}]}\`

   Also write the same summary to \`${snapshotDir}/.enrichment-summary.json\`.

## Script to pass to use_figma

\`\`\`javascript
${ENRICHMENT_SCRIPT}
\`\`\`

The script must run on the file specified by \`fileKey\` above. Do not navigate pages — \`figma.getNodeByIdAsync\` resolves nodes regardless of current page.

Constraints:
- Do not create any other files in the snapshot directory.
- Do not modify the snapshot's PNG files.
- Do not retry on transient failures; report them in the \`errors\` array of the summary.
- Keep your reasoning concise. The summary JSON is the only output that matters for downstream tooling.`;
}

const ENRICHMENT_SCRIPT = `const ids = <NODE_IDS_JSON>;
const out = {};

async function paintTokenAlias(paint) {
  if (!paint || !paint.boundVariables || !paint.boundVariables.color || !paint.boundVariables.color.id) {
    return null;
  }
  const varId = paint.boundVariables.color.id;
  try {
    const v = await figma.variables.getVariableByIdAsync(varId);
    if (!v) return { variableId: varId, variableName: null, resolvedAlias: null, resolvedHex: null };
    const chain = [v.name];
    const c0 = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
    let val = c0 ? v.valuesByMode[c0.defaultModeId || c0.modes[0].modeId] : null;
    let hops = 0;
    while (val && typeof val === 'object' && 'id' in val && val.type === 'VARIABLE_ALIAS' && hops < 5) {
      hops++;
      const next = await figma.variables.getVariableByIdAsync(val.id);
      if (!next) break;
      chain.push(next.name);
      const nc = await figma.variables.getVariableCollectionByIdAsync(next.variableCollectionId);
      val = nc ? next.valuesByMode[nc.defaultModeId || nc.modes[0].modeId] : null;
    }
    let resolvedHex = null;
    if (val && typeof val === 'object' && 'r' in val) {
      resolvedHex = '#' +
        Math.round(val.r * 255).toString(16).padStart(2, '0').toUpperCase() +
        Math.round(val.g * 255).toString(16).padStart(2, '0').toUpperCase() +
        Math.round(val.b * 255).toString(16).padStart(2, '0').toUpperCase();
    }
    return { variableId: varId, variableName: v.name, resolvedAlias: chain.join(' -> '), resolvedHex };
  } catch (e) {
    return { variableId: varId, variableName: null, resolvedAlias: null, resolvedHex: null };
  }
}

for (const id of ids) {
  try {
    const node = await figma.getNodeByIdAsync(id);
    if (!node) { out[id] = { error: 'not found' }; continue; }

    const enrichment = {
      source: 'plugin-api',
      capturedAt: new Date().toISOString(),
      componentProperties: null,
      mainComponent: null,
      boundVariables: [],
    };

    if (node.type === 'INSTANCE') {
      const cp = node.componentProperties || {};
      enrichment.componentProperties = {};
      for (const key of Object.keys(cp)) {
        const prop = cp[key];
        let value = prop.value;
        if (prop.type === 'INSTANCE_SWAP' && prop.value) {
          try {
            const ref = await figma.getNodeByIdAsync(prop.value);
            if (ref) value = { id: prop.value, name: ref.name };
          } catch (e) { /* leave value as id */ }
        }
        enrichment.componentProperties[key.split('#')[0]] = value;
      }
      if (node.mainComponent) {
        enrichment.mainComponent = {
          id: node.mainComponent.id,
          name: node.mainComponent.name,
          parentSetName: node.mainComponent.parent ? node.mainComponent.parent.name : null,
        };
      }
    }

    const paintProps = ['fills', 'strokes', 'backgrounds'];
    for (const propName of paintProps) {
      const paints = node[propName];
      if (!Array.isArray(paints)) continue;
      for (let i = 0; i < paints.length; i++) {
        const paint = paints[i];
        if (!paint || paint.visible === false) continue;
        const info = await paintTokenAlias(paint);
        if (info) {
          enrichment.boundVariables.push({
            path: \`\${propName}[\${i}].color\`,
            ...info,
          });
        }
      }
    }

    out[id] = enrichment;
  } catch (e) {
    out[id] = { error: e && e.message ? e.message : String(e) };
  }
}

return out;
`;
