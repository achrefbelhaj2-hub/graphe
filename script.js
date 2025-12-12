/* script.js
   Fonctionnalités:
   - vis-network pour affichage
   - Dijkstra optimisé (MinHeap)
   - A* (heuristique euclidienne)
   - BELLMAN-FORD (poids négatifs, détection de cycle négatif)
   - Toggle orienté / non-orienté
   - Double-clic pour créer nœud avec position
   - Export PNG removed (per request)
*/

const container = document.getElementById('network');

let nodes = new vis.DataSet([]);
let edges = new vis.DataSet([]);

// Configuration initiale pour vis-network
const network = new vis.Network(container, { nodes, edges }, {
  edges: { 
    arrows: { to: { enabled: true, scaleFactor:1 } }, 
    labelHighlightBold: true, 
    font: { align: 'middle', color: '#666' },
    color: '#848484',
    width: 1
  },
  nodes: { 
    shape: 'dot', 
    size: 16, 
    font: { size: 14, color:'#222' },
    color: { background: '#97C2FC', border: '#2B7CE9' }
  },
  physics: { stabilization: true },
  interaction: { hover: true, multiselect: false }
});

/* ===== Helpers & UI ===== */
const logEl = document.getElementById('log');
function log(msg){ logEl.innerHTML = new Date().toLocaleTimeString() + ' — ' + msg + '<br>' + logEl.innerHTML; }

function refreshNodeSelects(){
  const start = document.getElementById('startSelect');
  const end = document.getElementById('endSelect');
  start.innerHTML = '';
  end.innerHTML = '';
  nodes.forEach(n => {
    const o1 = document.createElement('option'); o1.value = n.id; o1.text = n.label;
    const o2 = document.createElement('option'); o2.value = n.id; o2.text = n.label;
    start.appendChild(o1); end.appendChild(o2);
  });
}

/* Build adjacency; respects nonOriented checkbox (allows negative weights) */
function buildAdjacency(){
  const adj = {};
  nodes.forEach(n => adj[n.id] = []);
  const nonOriented = document.getElementById('nonOriented').checked;
  edges.forEach(e => {
    const w = Number(e.label);
    if (!isFinite(w)) return;
    adj[e.from].push({ to: e.to, weight: w, edgeId: e.id });
    if (nonOriented){
      if (!adj[e.to]) adj[e.to] = [];
      adj[e.to].push({ to: e.from, weight: w, edgeId: e.id });
    }
  });
  return adj;
}

/* Node positions for A* */
function getNodePositions(){
  const pos = {};
  nodes.forEach(n => { pos[n.id] = { x: (n.x !== undefined ? n.x : 0), y: (n.y !== undefined ? n.y : 0) }; });
  return pos;
}

/* ===== MinHeap ===== */
class MinHeap {
  constructor(){ this.data = []; }
  _parent(i){ return Math.floor((i-1)/2); }
  _left(i){ return 2*i+1; }
  _right(i){ return 2*i+2; }
  push(item){ this.data.push(item); this._bubbleUp(this.data.length-1); }
  pop(){
    if (this.data.length === 0) return null;
    const root = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0){ this.data[0] = last; this._bubbleDown(0); }
    return root;
  }
  _bubbleUp(i){
    while (i > 0){
      const p = this._parent(i);
      if (this.data[p].priority <= this.data[i].priority) break;
      [this.data[p], this.data[i]] = [this.data[i], this.data[p]];
      i = p;
    }
  }
  _bubbleDown(i){
    while (true){
      const l = this._left(i), r = this._right(i);
      let smallest = i;
      if (l < this.data.length && this.data[l].priority < this.data[smallest].priority) smallest = l;
      if (r < this.data.length && this.data[r].priority < this.data[smallest].priority) smallest = r;
      if (smallest === i) break;
      [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
      i = smallest;
    }
  }
  isEmpty(){ return this.data.length === 0; }
}

/* ===== Dijkstra heap ===== */
function dijkstraHeap(adj, startId){
  const dist = {}; const prev = {};
  Object.keys(adj).forEach(v => { dist[v] = Infinity; prev[v] = null; });
  dist[startId] = 0;
  const heap = new MinHeap();
  heap.push({ node: startId, priority: 0 });

  while (!heap.isEmpty()){
    const item = heap.pop();
    const u = item.node; const d = item.priority;
    if (d !== dist[u]) continue;
    (adj[u] || []).forEach(nb => {
      const alt = dist[u] + nb.weight;
      if (alt < dist[nb.to]){
        dist[nb.to] = alt;
        prev[nb.to] = { node: u, edgeId: nb.edgeId };
        heap.push({ node: nb.to, priority: alt });
      }
    });
  }
  return { dist, prev };
}

/* ===== A* ===== */
function euclidean(a, b){
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx*dx + dy*dy);
}

function aStar(adj, startId, goalId, positions){
  const openSet = new MinHeap();
  openSet.push({ node: startId, priority: 0 });

  const cameFrom = {};
  const gScore = {}; const fScore = {};
  Object.keys(adj).forEach(v => { gScore[v] = Infinity; fScore[v] = Infinity; });
  gScore[startId] = 0;
  fScore[startId] = euclidean(positions[startId]||{x:0,y:0}, positions[goalId]||{x:0,y:0});

  const inOpen = new Set([startId]);

  while (!openSet.isEmpty()){
    const current = openSet.pop().node;
    inOpen.delete(current);
    if (current === goalId){
      const prev = {};
      let cur = goalId;
      while (cameFrom[cur]){
        prev[cur] = { node: cameFrom[cur].from, edgeId: cameFrom[cur].edgeId };
        cur = cameFrom[cur].from;
      }
      return { found: true, prev, gScore };
    }

    (adj[current] || []).forEach(nb => {
      const tentative_g = gScore[current] + nb.weight;
      if (tentative_g < gScore[nb.to]){
        cameFrom[nb.to] = { from: current, edgeId: nb.edgeId };
        gScore[nb.to] = tentative_g;
        const h = euclidean(positions[nb.to]||{x:0,y:0}, positions[goalId]||{x:0,y:0});
        const f = tentative_g + h;
        fScore[nb.to] = f;
        if (!inOpen.has(nb.to)){
          openSet.push({ node: nb.to, priority: f });
          inOpen.add(nb.to);
        }
      }
    });
  }
  return { found: false, prev: {}, gScore };
}

/* ===== Bellman-Ford (supports negative weights, detects negative cycles) ===== */
function bellmanFord(adj, nodesArray, startId){
  const dist = {};
  const prev = {};
  nodesArray.forEach(v => { dist[v.id] = Infinity; prev[v.id] = null; });
  dist[startId] = 0;

  // Relaxation V-1 times
  const numNodes = nodesArray.length;
  for (let i = 0; i < numNodes - 1; i++){
    let updated = false;
    // Iterate over all edges
    nodesArray.forEach(uNode => {
      const u = uNode.id;
      if (dist[u] === Infinity) return;
      (adj[u] || []).forEach(nb => {
        const v = nb.to;
        const weight = nb.weight;
        if (dist[u] + weight < dist[v]){
          dist[v] = dist[u] + weight;
          prev[v] = { node: u, edgeId: nb.edgeId };
          updated = true;
        }
      });
    });
    // Optimization: if no distances were updated in an iteration, we can stop early.
    if (!updated && i > 0) break; 
  }

  // Check for negative cycle (V-th iteration)
  let hasNegativeCycle = false;
  nodesArray.forEach(uNode => {
    const u = uNode.id;
    if (dist[u] === Infinity) return;
    (adj[u] || []).forEach(nb => {
      const v = nb.to;
      const weight = nb.weight;
      if (dist[u] + weight < dist[v]){
        hasNegativeCycle = true;
      }
    });
  });

  return { dist, prev, hasNegativeCycle };
}

/* ===== Styling helpers ===== */
function resetStyles(){
  // Reset edges to default style
  edges.forEach(e => {
    edges.update({ 
      id: e.id, 
      color: '#848484', 
      width: 1,
      font: { color: '#666' },
      smooth: false
    });
  });
  
  // Reset nodes to default style
  nodes.forEach(n => {
    nodes.update({ 
      id: n.id, 
      color: { background: '#97C2FC', border: '#2B7CE9' },
      size: 16
    });
  });
}

function highlightPathFromPrev(prev, source, target, colorEdge='#ff5722', colorNode='#ffd54f'){
  // Reset all styles first
  resetStyles();
  
  if (!prev[target] && source !== target){
    log('Aucun chemin trouvé entre ' + source + ' et ' + target + '.');
    return [];
  }
  
  const pathNodes = []; 
  const pathEdges = [];
  let cur = target;
  
  while (cur !== null){
    pathNodes.push(cur);
    if (cur === source) break;
    const p = prev[cur];
    if (!p) break;
    pathEdges.push(p.edgeId);
    cur = p.node;
  }
  
  // Highlight nodes in path
  pathNodes.forEach(id => {
    nodes.update({ 
      id, 
      color: { background: colorNode, border: '#B71C1C' }, 
      size: 22 
    });
  });
  
  // Highlight edges in path
  pathEdges.forEach(eid => {
    edges.update({ 
      id: eid, 
      color: colorEdge, 
      width: 4, 
      font: { color: '#000', bold: true }
    });
  });
  
  return { pathNodes: pathNodes.reverse(), pathEdges };
}

/* ===== UI handlers ===== */
document.getElementById('addNodeBtn').addEventListener('click', () => {
  const name = document.getElementById('nodeName').value.trim();
  if (!name){ alert('Donne un nom au nœud.'); return; }
  let id = name; let count = 1;
  while (nodes.get(id)) { id = name + '_' + count; count++; }
  nodes.add({ id: id, label: name });
  document.getElementById('nodeName').value = '';
  refreshNodeSelects();
  log('Nœud ajouté: ' + name);
});

document.getElementById('addEdgeBtn').addEventListener('click', () => {
  const from = document.getElementById('edgeFrom').value.trim();
  const to = document.getElementById('edgeTo').value.trim();
  const w = Number(document.getElementById('edgeWeight').value.trim());
  if (!from || !to || !isFinite(w)){ alert('Source, cible et poids valides requis.'); return; }
  let fromId = null, toId = null;
  nodes.forEach(n => { if (n.label === from || n.id === from) fromId = n.id; if (n.label === to || n.id === to) toId = n.id; });
  if (!fromId || !toId){ alert('Nœud introuvable — vérifie les noms existants.'); return; }
  edges.add({ id: 'e' + (Math.random()*1e9|0), from: fromId, to: toId, label: String(w) });
  document.getElementById('edgeFrom').value = '';
  document.getElementById('edgeTo').value = '';
  document.getElementById('edgeWeight').value = '';
  refreshNodeSelects();
  log('Arête ajoutée: ' + from + ' → ' + to + ' (poids=' + w + ')');
});

document.getElementById('runDijkstra').addEventListener('click', () => {
  resetStyles(); // Reset before running new algorithm
  const start = document.getElementById('startSelect').value;
  const end = document.getElementById('endSelect').value;
  if (!start || !end){ alert('Choisis une source et une destination.'); return; }
  const adj = buildAdjacency();
  const res = dijkstraHeap(adj, start);
  const dist = res.dist[end];
  if (!isFinite(dist)){ log('Distance (Dijkstra): ∞ — pas de chemin trouvé.'); return; }
  const highlighted = highlightPathFromPrev(res.prev, start, end, '#1e88e5', '#90caf9');
  log('Dijkstra — plus court chemin de ' + start + ' à ' + end + ' = ' + dist + ' (nœuds: ' + (highlighted.pathNodes?highlighted.pathNodes.join(' → '):'—') + ')');
});

document.getElementById('runAstar').addEventListener('click', () => {
  resetStyles(); // Reset before running new algorithm
  const start = document.getElementById('startSelect').value;
  const end = document.getElementById('endSelect').value;
  if (!start || !end){ alert('Choisis une source et une destination.'); return; }
  const adj = buildAdjacency();
  const positions = getNodePositions();
  const res = aStar(adj, start, end, positions);
  if (!res.found){ log('A* — aucun chemin trouvé.'); return; }
  const highlighted = highlightPathFromPrev(res.prev, start, end, '#2e7d32', '#c8e6c9');
  const cost = res.gScore[end];
  log('A* — chemin trouvé de ' + start + ' à ' + end + ' (coût = ' + cost + ') (nœuds: ' + (highlighted.pathNodes?highlighted.pathNodes.join(' → '):'—') + ')');
});

document.getElementById('runBellmanFord').addEventListener('click', () => {
  resetStyles(); // Reset before running new algorithm
  const start = document.getElementById('startSelect').value;
  const end = document.getElementById('endSelect').value;
  if (!start || !end){ alert('Choisis une source et une destination.'); return; }
  const adj = buildAdjacency();
  const nodesArray = nodes.get();
  const res = bellmanFord(adj, nodesArray, start);
  
  if (res.hasNegativeCycle){
    log('Bellman-Ford: Cycle de poids négatif détecté. Le chemin le plus court est indéfini.');
    // Highlight all edges in red to indicate negative cycle
    edges.forEach(e => {
      edges.update({ 
        id: e.id, 
        color: '#ff0000',
        width: 2
      });
    });
    return;
  }
  
  const dist = res.dist[end];
  if (!isFinite(dist)){ 
    log('Distance (Bellman-Ford): ∞ — pas de chemin trouvé.'); 
    return; 
  }
  
  const highlighted = highlightPathFromPrev(res.prev, start, end, '#dc3545', '#f5c6cb');
  log('Bellman-Ford — plus court chemin de ' + start + ' à ' + end + ' = ' + dist + ' (nœuds: ' + (highlighted.pathNodes?highlighted.pathNodes.join(' → '):'—') + ')');
});

document.getElementById('clearHighlight').addEventListener('click', () => {
  resetStyles();
  log('Mise en forme réinitialisée.');
});

document.getElementById('resetAll').addEventListener('click', () => {
  if (!confirm('Supprimer tous les nœuds et arêtes ?')) return;
  nodes.clear(); edges.clear();
  refreshNodeSelects();
  log('Graphe réinitialisé.');
});

document.getElementById('loadSample').addEventListener('click', () => {
  resetStyles(); // Reset styles when loading sample
  nodes.clear(); edges.clear();
  nodes.add([
    {id:'A', label:'A', x:-200, y:-100}, 
    {id:'B', label:'B', x:-50, y:-120},
    {id:'C', label:'C', x:80, y:-50},
    {id:'D', label:'D', x:150, y:70},
    {id:'E', label:'E', x:0, y:80},
    {id:'F', label:'F', x:-140, y:40}
  ]);
  edges.add([
    {id:'e1', from:'A', to:'B', label:'4'},
    {id:'e2', from:'A', to:'C', label:'7'},
    {id:'e3', from:'B', to:'C', label:'1'},
    {id:'e4', from:'B', to:'F', label:'5'},
    {id:'e5', from:'C', to:'D', label:'3'},
    {id:'e6', from:'C', to:'E', label:'2'},
    {id:'e7', from:'E', to:'D', label:'4'},
    {id:'e8', from:'F', to:'E', label:'6'}
  ]);
  refreshNodeSelects();
  log('Graphe d\'exemple chargé (avec positions).');
});

/* Double-click to add node at position */
network.on('doubleClick', params => {
  const pos = params.pointer && params.pointer.canvas;
  if (!pos) return;
  const name = prompt('Nom du nouveau nœud (annuler pour ignorer) :');
  if(!name) return;
  let id = name; let count = 1;
  while (nodes.get(id)) { id = name + '_' + count; count++; }
  nodes.add({ id, label: name, x: pos.x, y: pos.y, fixed:false });
  refreshNodeSelects();
  log('Nœud ajouté (double-clic) : ' + name + ' (position enregistrée)');
});

/* Gestion de l'orientation visuelle du graphe */
function toggleOrientationVisuals(){
  resetStyles(); // Reset styles when toggling orientation
  const nonOriented = document.getElementById('nonOriented').checked;
  const options = {
    edges: {
      arrows: { to: { enabled: !nonOriented } }
    }
  };
  network.setOptions(options);
  log(nonOriented ? 'Mode non orienté activé (flèches masquées).' : 'Mode orienté activé (flèches affichées).');
}

// Ajout de l'écouteur d'événement pour la case à cocher
document.getElementById('nonOriented').addEventListener('change', toggleOrientationVisuals);

/* Start with sample graph loaded */
document.getElementById('loadSample').click();