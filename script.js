document.addEventListener('DOMContentLoaded', () => {
    const width = window.innerWidth * 0.95;
    const height = window.innerHeight * 0.8;
    let i = 0;

    const svg = d3.select("#farm-graph")
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr("transform", "translate(50,50)"); // Adjust margins

    const simulation = d3.forceSimulation()
        .force("link", d3.forceLink().id(d => d.id).distance(100))
        .force("charge", d3.forceManyBody().strength(-300))
        .force("center", d3.forceCenter((width - 100) / 2, (height - 100) / 2))
        .force("collision", d3.forceCollide().radius(d => d.radius || 30));

    let rootNodes = [];
    let allNodes = [];
    let allLinks = [];

    // Initial root: The Farm itself
    const farmRootNode = { id: "Iron Farm", name: "Iron Farm", type: "root", fx: width / 2 - 50, fy: 50, radius: 40, childrenData: farmData.map(s => ({...s, parentId: "Iron Farm"})) };
    rootNodes.push(farmRootNode);
    allNodes.push(farmRootNode);

    function updateGraph() {
        // Flatten nodes and links
        const currentNodes = [];
        const currentLinks = [];
        const nodeSet = new Set();

        function addNodesAndLinks(node) {
            if (!nodeSet.has(node.id)) {
                currentNodes.push(node);
                nodeSet.add(node.id);
            }

            if (node.children) {
                node.children.forEach(child => {
                    if (!nodeSet.has(child.id)) {
                        currentNodes.push(child);
                        nodeSet.add(child.id);
                    }
                    currentLinks.push({ source: node.id, target: child.id });
                    addNodesAndLinks(child);
                });
            }
        }

        rootNodes.forEach(addNodesAndLinks);
        
        allNodes = currentNodes;
        allLinks = currentLinks;

        // Links
        const link = svg.selectAll(".link")
            .data(allLinks, d => `${d.source.id}-${d.target.id}`);

        link.exit().remove();

        const linkEnter = link.enter().append("line")
            .attr("class", "link");

        // Nodes
        const node = svg.selectAll(".node")
            .data(allNodes, d => d.id);

        node.exit().remove();

        const nodeEnter = node.enter().append("g")
            .attr("class", d => `node ${d.type}`)
            .call(d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended));

        nodeEnter.append("circle")
            .attr("r", d => d.radius || (d.type === 'section' ? 30 : (d.type === 'item' ? 20 : (d.type === 'component' ? 15 : 10))))
            .on("click", toggleNode);

        nodeEnter.append("text")
            .attr("dy", ".35em")
            .attr("text-anchor", "middle")
            .text(d => `${d.name}${d.quantity ? ' (x'+d.quantity+')' : ''}`);
        
        const mergedNodes = nodeEnter.merge(node);
        mergedNodes.select("circle").attr("class", d => d.type);
        mergedNodes.select("text").text(d => `${d.name}${d.quantity ? ' (x'+d.quantity+')' : ''}`);


        simulation
            .nodes(allNodes)
            .on("tick", ticked);

        simulation.force("link")
            .links(allLinks);

        simulation.alpha(1).restart();

        function ticked() {
            linkEnter.merge(link)
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            mergedNodes
                .attr("transform", d => `translate(${d.x},${d.y})`);
        }
    }

    function toggleNode(event, d) {
        if (d.children) { // Collapse
            d._children = d.children;
            d.children = null;
        } else if (d._children) { // Expand stored children
            d.children = d._children;
            d._children = null;
        } else { // Load children for the first time
            if (d.type === 'root') {
                d.children = d.childrenData.map(sectionData => ({
                    id: sectionData.name, 
                    name: sectionData.name, 
                    type: 'section', 
                    parentId: d.id,
                    childrenData: sectionData.items,
                    radius: 30
                }));
            } else if (d.type === 'section') {
                d.children = d.childrenData.map(itemData => ({
                    id: `${d.id}-${itemData.name}-${i++}`,
                    name: itemData.name,
                    quantity: itemData.quantity,
                    type: 'item',
                    parentId: d.id,
                    childrenData: itemData.components,
                    radius: 20
                }));
            } else if (d.type === 'item' && d.childrenData && d.childrenData.length > 0) {
                d.children = d.childrenData.map(compData => {
                    const componentId = `${d.id}-${compData.name}-${i++}`;
                    const recipe = recipes[compData.name]; // Check if this component is craftable
                    return {
                        id: componentId,
                        name: compData.name,
                        quantity: compData.quantity,
                        type: recipe ? 'component' : 'material', // 'component' if further craftable, 'material' if base
                        parentId: d.id,
                        childrenData: recipe ? recipe.map(r => ({...r, parentId: componentId})) : [], // components for the recipe
                        radius: recipe ? 15 : 10
                    };
                });
            } else if (d.type === 'component' && d.childrenData && d.childrenData.length > 0) {
                 d.children = d.childrenData.map(baseMatData => ({
                    id: `${d.id}-${baseMatData.name}-${i++}`,
                    name: baseMatData.name,
                    quantity: baseMatData.quantity * (d.quantity || 1), // Multiply by parent quantity
                    type: 'material',
                    parentId: d.id,
                    childrenData: [],
                    radius: 10
                }));
            }
        }
        updateGraph();
    }

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
        // Keep fx, fy to pin nodes after dragging, or set to null to unpin
        // d.fx = null;
        // d.fy = null;
    }

    // Initial expansion of the root node
    toggleNode(null, farmRootNode);
    updateGraph(); 
});
