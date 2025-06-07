document.addEventListener('DOMContentLoaded', () => {
    const farmGraphContainer = d3.select("#farm-graph-container"); // Corrected selector
    const tabContainer = d3.select("#tab-container");
    const treeViewContainer = d3.select("#tree-view-container"); // New container
    const materialsSummaryContainer = d3.select("#materials-summary-container"); // New container
    let width = farmGraphContainer.node().getBoundingClientRect().width; // Use corrected container
    let height = window.innerHeight * 0.8;
    let i = 0; // Unique ID counter for original data
    let svg, g, simulation;
    let currentFarmData; // The raw data for the currently selected farm

    // Store unique nodes and links for the force simulation
    let uniqueNodes = [];
    let uniqueLinks = [];

    let zoneTargets = {}; // To store target Y for each node type

    function updateZoneTargets() {
        const numZones = 4;
        const topPadding = height * 0.05; // Small padding at the top
        const bottomPadding = height * 0.05; // Small padding at the bottom
        const usableHeight = height - topPadding - bottomPadding;
        const zoneHeight = usableHeight / numZones;

        zoneTargets = {
            'root': topPadding + zoneHeight * 0.5,       // Center of the first zone
            'section': topPadding + zoneHeight * 1.5,    // Center of the second zone
            'item': topPadding + zoneHeight * 2.5,       // Center of the third zone
            'material': topPadding + zoneHeight * 3.5,   // Center of the fourth zone
        };
    }

    // --- Force Simulation Setup ---
    // Initialize simulation variable first
    simulation = d3.forceSimulation(); 

    function setupSimulationForces(nodes, links) {
        if (!simulation) {
            simulation = d3.forceSimulation(nodes);
        } else {
            simulation.nodes(nodes);
        }

        simulation
            .force("link", d3.forceLink(links)
                .id(d => d.id)
                .distance(d => {
                    // Increased distances for more separation (kept from previous attempt)
                    if (d.source.type === 'root' || d.target.type === 'root') return 150; 
                    if (d.source.type === 'section' || d.target.type === 'section') return 120;
                    if (d.source.type === 'item' || d.target.type === 'item') return 90;
                    return 60; // For material or other links
                })
                .strength(0.6) 
            )
            .force("charge", d3.forceManyBody()
                .strength(d => {
                    // Increased (more negative) charge strength for more repulsion (kept from previous attempt)
                    if (d.type === 'root') return -1500;
                    if (d.type === 'section') return -1200;
                    if (d.type === 'item') return -600;
                    return -300; // For material nodes
                })
            )
            .force("collide", d3.forceCollide()
                // Adjusted collision radius: more moderate increase
                .radius(d => (d.type === 'root' ? 35 : (d.type === 'section' ? 30 : (d.type === 'item' ? 25 : 20))) + 15) 
                .strength(0.8) 
            )
            .force("forceX", d3.forceX(width / 2).strength(0.05)) // Weaker X centering (kept)
            .force("forceY", d3.forceY(d => zoneTargets[d.type]).strength(d => { // Y force strength (kept)
                if (d.type === 'root' || d.type === 'material') return 1.5;
                if (d.type === 'section') return 1.2;
                return 1;
            }));
        
        simulation.alpha(0.3).restart(); // Restart simulation with new alpha (kept)
    }
    // Call it after width/height are known, e.g., in loadFarmData or after initial width/height set.
    // For now, let's ensure it's called before first use.

    function initializeGraphBase() {
        // Remove any existing svg content if we are re-initializing
        farmGraphContainer.select("svg#farm-graph").selectAll("*").remove();


        // Select the existing SVG element by its ID
        svg = farmGraphContainer.select("svg#farm-graph")
            .attr("width", width)
            .attr("height", height)
            .call(d3.zoom().on("zoom", function (event) {
                if (g) g.attr("transform", event.transform);
            }))
            .on("dblclick.zoom", null);

        // If g already exists, remove it before appending a new one
        if (g) {
            g.remove();
        }
        g = svg.append("g"); // Append g to the selected SVG
    }

    function getNodeRadius(type) {
        switch (type) {
            case 'root': return 30;
            case 'section': return 25;
            case 'item': return 20;
            case 'material': return 15;
            default: return 18;
        }
    }
    
    // Prepares original data with unique IDs and sets up _children for collapse/expand
    function prepareOriginalData(node, parentId) {
        node.originalId = node.originalId || `${node.name.replace(/\s+/g, '-')}-orig-${i++}`;
        node.parentId = parentId; // parentId in the original tree structure

        if (node.children && node.children.length > 0) {
            node._children = node.children; 
            node._children.forEach(child => prepareOriginalData(child, node.originalId));
            if (node.type !== 'root') { // Keep root expanded initially
                 node.children = null; 
            }
        } else {
            node.children = null;
            node._children = null;
        }
    }

    // --- New function to process data for force layout ---
    function processDataForForceLayout(farmDataRoot) {
        const visibleNodesByName = new Map();
        const newLinks = [];
        let nodeIdCounter = 0; // Counter for new unique node IDs for the simulation

        function traverse(node, depth, parentSimId) {
            let simNode = visibleNodesByName.get(node.name);
            if (!simNode) {
                simNode = {
                    id: `sim-${node.name.replace(/\s+/g, '-')}-${nodeIdCounter++}`, // Unique ID for simulation
                    name: node.name,
                    type: node.type,
                    quantity: 0,
                    depth: depth,
                    originalNodeReferences: [] // To link back to original data if needed
                };
                visibleNodesByName.set(node.name, simNode);
            }
            simNode.quantity += node.quantity || 0; // Aggregate quantity
            simNode.depth = Math.min(simNode.depth, depth); // Use shallowest depth
            simNode.originalNodeReferences.push(node.originalId);


            if (parentSimId && simNode.id !== parentSimId) {
                 // Check if a link already exists (important for merging)
                const linkExists = newLinks.some(l => (l.source === parentSimId && l.target === simNode.id) || (l.source === simNode.id && l.target === parentSimId));
                if (!linkExists) {
                    newLinks.push({ source: parentSimId, target: simNode.id, originalSourceId: node.parentId, originalTargetId: node.originalId });
                }
            }

            if (node.children && node.children.length > 0) {
                node.children.forEach(child => traverse(child, depth + 1, simNode.id));
            }
        }

        traverse(farmDataRoot, 0, null);
        
        uniqueNodes = Array.from(visibleNodesByName.values());
        uniqueLinks = newLinks;

        // Ensure all link sources/targets are in uniqueNodes
        // This can happen if a parent is collapsed but children were processed due to multiple paths
        const nodeIds = new Set(uniqueNodes.map(n => n.id));
        uniqueLinks = uniqueLinks.filter(l => nodeIds.has(l.source) && nodeIds.has(l.target));
    }


    function updateGraph() { // Removed farmData argument as it uses global uniqueNodes/Links
        if (!g || !simulation) return;

        // Update zone targets based on current SVG height
        updateZoneTargets(); 

        // Ensure simulation forces are set up with the current nodes and links
        // This was missing and is crucial after data processing or state changes.
        setupSimulationForces(uniqueNodes, uniqueLinks);

        // --- Links ---
        let link = g.selectAll(".link")
            .data(uniqueLinks, d => `${d.source.id || d.source}-${d.target.id || d.target}`); // Use IDs of source/target objects

        link.exit().remove();

        const linkEnter = link.enter().append("line")
            .attr("class", "link");

        link = linkEnter.merge(link);

        // --- Nodes ---
        let node = g.selectAll(".node")
            .data(uniqueNodes, d => d.id); // Use the unique simulation ID

        node.exit().remove();

        const nodeEnter = node.enter().append("g")
            .attr("class", d => `node ${d.type}`)
            .call(drag(simulation)) // Add drag behavior
            .on("click", clickNode); // Modified click handler

        nodeEnter.append("circle")
            .attr("r", d => getNodeRadius(d.type))
            .attr("class", d => d.type);

        nodeEnter.append("text")
            .attr("dy", ".35em")
            .attr("y", d => getNodeRadius(d.type) + 15)
            .attr("text-anchor", "middle")
            .text(d => `${d.name}${d.quantity > 0 ? ' (x'+d.quantity+')' : ''}`);
        
        node = nodeEnter.merge(node);

        // Update text for existing nodes (in case quantity changed)
        node.select("text")
            .text(d => `${d.name}${d.quantity > 0 ? ' (x'+d.quantity+')' : ''}`);
        
        node.select("circle")
             .attr("r", d => getNodeRadius(d.type))
             .attr("class", d => d.type);


        // --- Simulation ---
        simulation.nodes(uniqueNodes)
            .on("tick", ticked);

        simulation.force("link").links(uniqueLinks);
        simulation.alpha(1).restart(); // Restart simulation

        function ticked() {
            link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            node
                .attr("transform", d => `translate(${d.x},${d.y})`);
        }
    }
    
    // Click handler for force layout nodes
    // This needs to find the corresponding node(s) in the original currentFarmData
    // and toggle their expansion state, then re-process and update.
    function clickNode(event, d_sim) {
        event.stopPropagation();
        let changed = false;

        // Find all original nodes that this simulation node represents
        // For simplicity, we'll toggle the first one that can be toggled.
        // A more complex approach might be needed if multiple original nodes contribute
        // and have different states.
        
        function findAndToggle(originalNode) {
            if (originalNode.originalId === d_sim.originalNodeReferences[0] || originalNode.name === d_sim.name) { // Fallback to name if ID isn't there
                if (originalNode._children && !originalNode.children) { // If collapsed, expand
                    originalNode.children = originalNode._children;
                    // originalNode._children = null; // Keep _children to allow re-collapsing
                    changed = true;
                    return true; // Found and toggled
                } else if (originalNode.children) { // If expanded, collapse
                    // originalNode._children = originalNode.children; // Already set in prepareOriginalData
                    originalNode.children = null;
                    changed = true;
                    return true; // Found and toggled
                }
            }
            if (originalNode.children) {
                for (const child of originalNode.children) {
                    if (findAndToggle(child)) return true;
                }
            }
            // Also check _children if currently collapsed, to ensure we can find the node
            // to expand it, even if its parent path isn't fully expanded yet.
            // This part is tricky with merging. For now, focus on toggling based on current visible state.
            if (originalNode._children && !originalNode.children) {
                 for (const child of originalNode._children) {
                    if (findAndToggle(child)) return true;
                }
            }
            return false;
        }

        // Attempt to find the primary original node associated with the clicked simulation node
        // and toggle it. This uses the first originalId stored.
        let toggledOriginalNode = null;
        function findOriginalNodeById(node, idToFind) {
            if (node.originalId === idToFind) return node;
            let found = null;
            if (node.children) {
                for (const child of node.children) {
                    found = findOriginalNodeById(child, idToFind);
                    if (found) return found;
                }
            }
            if (node._children) { // Also search in collapsed children
                for (const child of node._children) {
                    found = findOriginalNodeById(child, idToFind);
                    if (found) return found;
                }
            }
            return null;
        }
        
        if (d_sim.originalNodeReferences && d_sim.originalNodeReferences.length > 0) {
            // Try to toggle based on the *first* original node reference.
            // This is a simplification. If multiple original nodes merge, clicking
            // might ideally offer a choice or toggle all, but that's more complex.
            toggledOriginalNode = findOriginalNodeById(currentFarmData, d_sim.originalNodeReferences[0]);
        }


        if (toggledOriginalNode) {
            if (toggledOriginalNode.children) { // Is currently expanded, so collapse
                // toggledOriginalNode._children = toggledOriginalNode.children; // Ensure _children is set
                toggledOriginalNode.children = null;
                changed = true;
            } else if (toggledOriginalNode._children) { // Is currently collapsed, so expand
                toggledOriginalNode.children = toggledOriginalNode._children;
                // toggledOriginalNode._children = null; // Keep _children to allow re-collapsing
                changed = true;
            }
        }


        if (changed) {
            processDataForForceLayout(currentFarmData); // Re-process based on new state of currentFarmData
            updateGraph();
        }
    }


    // --- Drag functions ---
    function drag(simulation) {
        function dragstarted(event, d) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }
        function dragged(event, d) {
            d.fx = event.x;
            d.fy = event.y;
        }
        function dragended(event, d) {
            if (!event.active) simulation.alphaTarget(0);
            // d.fx = null; // Keep node fixed after drag unless user wants them to resettle
            // d.fy = null;
        }
        return d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended);
    }

    function loadFarmData(farmDataToLoad) {
        i = 0; 
        currentFarmData = JSON.parse(JSON.stringify(farmDataToLoad)); 
        prepareOriginalData(currentFarmData, null);

        if (currentFarmData.type === 'root' && currentFarmData._children && !currentFarmData.children) {
            currentFarmData.children = currentFarmData._children;
        }
        
        width = farmGraphContainer.node().getBoundingClientRect().width; // Use corrected container
        height = window.innerHeight * 0.8;
        
        initializeGraphBase(); 
        updateZoneTargets();
        processDataForForceLayout(currentFarmData);
        setupSimulationForces(uniqueNodes, uniqueLinks);
        updateGraph(); 
        renderTreeView(currentFarmData);
        renderMaterialsSummary(currentFarmData); // Add this line
    }

    function renderTreeView(farmData) {
        treeViewContainer.html(""); // Clear previous tree
        const ul = treeViewContainer.append("ul").attr("class", "tree-root");

        function createNode(parentElement, nodeData) {
            const li = parentElement.append("li")
                .attr("class", `tree-node ${nodeData._children && nodeData._children.length > 0 ? (nodeData.children ? 'expanded' : 'collapsed') : ''}`);

            const toggler = li.append("span")
                .attr("class", "toggler")
                .on("click", (event) => {
                    event.stopPropagation();
                    if (nodeData._children) {
                        if (nodeData.children) { // If expanded, collapse
                            nodeData.children = null;
                            li.classed('expanded', false).classed('collapsed', true);
                        } else { // If collapsed, expand
                            nodeData.children = nodeData._children;
                            li.classed('collapsed', false).classed('expanded', true);
                        }
                        // Re-render this part of the tree or the specific children
                        // For simplicity, we'll re-render the children list for this node
                        childrenUl.remove(); // Remove old children list
                        if (nodeData.children) {
                            childrenUl = li.append("ul").attr("class", "children");
                            nodeData.children.forEach(child => createNode(childrenUl, child));
                        }
                    }
                });
            
            toggler.append("span").attr("class", "name").text(`${nodeData.name} `);
            if (nodeData.quantity) {
                toggler.append("span").attr("class", "quantity").text(`(x${nodeData.quantity})`);
            }

            let childrenUl = li.append("ul").attr("class", "children");
            if (nodeData.children && nodeData.children.length > 0) {
                nodeData.children.forEach(child => createNode(childrenUl, child));
            }
        }

        createNode(ul, farmData); // Start with the root of the farm data
    }

    function calculateTotalMaterials(farmData) {
        const materials = {};

        function traverse(node) {
            if (node.type === 'material' && node.name) {
                materials[node.name] = (materials[node.name] || 0) + (node.quantity || 0);
            }
            // If an item has children, recurse. If it's an item without children but has a quantity,
            // it might be a direct material (though our structure uses type: 'material').
            // This primarily focuses on nodes explicitly marked as 'material'.
            if (node.children && node.children.length > 0) {
                node.children.forEach(traverse);
            }
            // Also consider _children if the node is collapsed, to get a full sum
            // This is important if the graph/tree isn't fully expanded by default.
            else if (node._children && node._children.length > 0) {
                node._children.forEach(traverse);
            }
        }

        traverse(farmData); // Start with the root of the farm data
        return materials;
    }

    function renderMaterialsSummary(farmData) {
        materialsSummaryContainer.html(""); // Clear previous summary
        const totalMaterials = calculateTotalMaterials(farmData);

        materialsSummaryContainer.append("h3").text("Total Basic Materials");
        const ul = materialsSummaryContainer.append("ul");

        // Sort by quantity descending, then by name ascending for ties
        Object.entries(totalMaterials)
            .sort(([, quantityA], [, quantityB]) => quantityB - quantityA) // Sort by quantity descending
            .forEach(([name, quantity]) => {
                ul.append("li").text(`${name}: ${quantity.toLocaleString()}`);
            });

        if (Object.keys(totalMaterials).length === 0) {
            ul.append("li").text("No basic materials found or calculated.");
        }
    }


    function createTabs() {
        allFarmsData.forEach((farm, index) => {
            const tab = tabContainer.append("button")
                .attr("class", "tab-button")
                .text(farm.name)
                .on("click", () => {
                    loadFarmData(farm);
                    tabContainer.selectAll(".tab-button").classed("active", false);
                    tab.classed("active", true);
                });
            if (index === 0) tab.classed("active", true); // Activate the first tab by default
        });
    }

    createTabs(); // Initial tab creation
    loadFarmData(allFarmsData[0]); // Load the first farm's data by default

    window.addEventListener('resize', () => {
        width = farmGraphContainer.node().getBoundingClientRect().width;
        height = window.innerHeight * 0.8;
        updateZoneTargets(); 

        if (svg) {
            svg.attr("width", width).attr("height", height);
        }
        // Ensure simulation forces that depend on width/height are updated
        if (simulation) {
            simulation.force("forceX", d3.forceX(width / 2).strength(0.05));
            simulation.force("forceY", d3.forceY(d => zoneTargets[d.type]).strength(d => { 
                if (d.type === 'root' || d.type === 'material') return 1.5;
                if (d.type === 'section') return 1.2;
                return 1;
            }));
            simulation.alpha(0.3).restart(); // Reheat simulation slightly after resize adjustments
        }
        // updateGraph(); // This might be redundant if simulation restart handles it, or could be necessary
        // Let's keep it simple and rely on simulation restart for now, can add updateGraph() if needed.
    });
});
