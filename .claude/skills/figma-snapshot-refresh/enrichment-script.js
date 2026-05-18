// Figma Plugin-API enrichment script — a `figma-snapshot-refresh` skill asset.
// The skill substitutes <NODE_IDS_JSON> with a JSON array of node IDs and passes
// the whole file to the mcp__plugin_figma_figma__use_figma MCP tool. The script
// returns an object mapping each nodeId to its enrichment data (or { error }).
const ids = <NODE_IDS_JSON>;
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

async function resolvedStylesFor(node) {
  const result = { fills: [], strokes: [], textColor: null };
  const paintProps = ['fills', 'strokes'];
  for (const propName of paintProps) {
    const paints = node[propName];
    if (!Array.isArray(paints)) continue;
    for (let i = 0; i < paints.length; i++) {
      const paint = paints[i];
      if (!paint || paint.visible === false) continue;
      const info = await paintTokenAlias(paint);
      const hex = info && info.resolvedHex ? info.resolvedHex : (paint.color ? '#' +
        Math.round(paint.color.r * 255).toString(16).padStart(2, '0').toUpperCase() +
        Math.round(paint.color.g * 255).toString(16).padStart(2, '0').toUpperCase() +
        Math.round(paint.color.b * 255).toString(16).padStart(2, '0').toUpperCase() : null);
      const entry = { hex, tokenAlias: info && info.variableName ? info.variableName : null, opacity: paint.opacity != null ? paint.opacity : 1 };
      if (propName === 'fills') result.fills.push(entry);
      else result.strokes.push(entry);
    }
  }
  // Text color comes from a child text node when the instance has a single primary text child.
  if (node.findOne) {
    const textNode = node.findOne ? node.findOne((n) => n.type === 'TEXT') : null;
    if (textNode && Array.isArray(textNode.fills) && textNode.fills[0]) {
      const info = await paintTokenAlias(textNode.fills[0]);
      const c = textNode.fills[0].color;
      result.textColor = {
        hex: info && info.resolvedHex ? info.resolvedHex : (c ? '#' +
          Math.round(c.r * 255).toString(16).padStart(2, '0').toUpperCase() +
          Math.round(c.g * 255).toString(16).padStart(2, '0').toUpperCase() +
          Math.round(c.b * 255).toString(16).padStart(2, '0').toUpperCase() : null),
        tokenAlias: info && info.variableName ? info.variableName : null,
      };
    }
  }
  return result;
}

async function instanceEntry(node, path) {
  const cp = node.componentProperties || {};
  const propertyOverrides = {};
  for (const key of Object.keys(cp)) {
    const prop = cp[key];
    let value = prop.value;
    if (prop.type === 'INSTANCE_SWAP' && prop.value) {
      try {
        const ref = await figma.getNodeByIdAsync(prop.value);
        if (ref) value = ref.name;
      } catch (e) { /* leave as raw id */ }
    }
    propertyOverrides[key.split('#')[0]] = value;
  }
  let mainComponentSetId = null;
  let variantOverrides = null;
  if (node.mainComponent) {
    const parent = node.mainComponent.parent;
    if (parent && parent.type === 'COMPONENT_SET') {
      mainComponentSetId = parent.id;
      variantOverrides = node.mainComponent.name;
    } else {
      // Standalone component (not part of a set).
      mainComponentSetId = node.mainComponent.id;
      variantOverrides = null;
    }
  }
  return {
    id: node.id,
    name: node.name,
    path: path.slice(),
    mainComponentSetId,
    variantOverrides,
    componentPropertyOverrides: propertyOverrides,
    resolvedStyles: await resolvedStylesFor(node),
  };
}

async function walkChildren(node, depth, path, instances, depthWarnings) {
  // Cap recursion at depth 6 per spec §1 — surface depthWarnings rather than truncating silently.
  if (depth > 6) {
    depthWarnings.push({ depthExceeded: true, depth: depth, atNodeId: node.id, atName: node.name });
    return;
  }
  // Leaf node types (VECTOR, TEXT, RECTANGLE, ...) have no `children` property,
  // and the Plugin API throws on access — check existence with `in` first.
  if (!node || !('children' in node) || !Array.isArray(node.children)) return;
  // A COMPONENT_SET is a variant matrix — a component *definition*, not a
  // composition. Walking its variants emits one redundant entry per nested
  // instance (the 320-variant Pill set alone produced ~78 KB of near-identical
  // icon entries). Variant identity and per-variant paints already live in the
  // REST `raw` field; real instance *usage* is captured on the screen nodes.
  if (node.type === 'COMPONENT_SET') return;
  for (const child of node.children) {
    const childPath = path.concat([child.name || child.id]);
    if (child.type === 'INSTANCE') {
      instances.push(await instanceEntry(child, childPath));
    }
    if ('children' in child && Array.isArray(child.children) && child.children.length > 0) {
      await walkChildren(child, depth + 1, childPath, instances, depthWarnings);
    }
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
      componentInstances: [],
      depthWarnings: [],
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
            path: `${propName}[${i}].color`,
            ...info,
          });
        }
      }
    }

    // §1: walk the composite's tree, emit nested-instance entries.
    await walkChildren(node, 1, [], enrichment.componentInstances, enrichment.depthWarnings);

    out[id] = enrichment;
  } catch (e) {
    out[id] = { error: e && e.message ? e.message : String(e) };
  }
}

return out;
