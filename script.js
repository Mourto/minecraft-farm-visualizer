document.addEventListener('DOMContentLoaded', () => {
    const width = window.innerWidth * 0.95;
    const height = window.innerHeight * 0.8;
    let i = 0; // Unique ID counter

    const svg = d3.select("#farm-graph")
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .call(d3.zoom().on("zoom", function (event) {
            svg.attr("transform", event.transform)
        }))
        .append("g")
        .attr("transform", "translate(50,50)");

    const simulation = d3.forceSimulation()
        .force("link", d3.forceLink().id(d => d.id).distance(d => d.source.type === 'root' ? 150 : (d.source.type === 'section' ? 100 : 70)))
        .force("charge", d3.forceManyBody().strength(-250))
        .force("center", d3.forceCenter((width - 100) / 2, (height - 100) / 2))
        .force("collision", d3.forceCollide().radius(d => (d.radius || 20) + 5));

    let currentNodes = [];
    let currentLinks = [];

    // Function to assign unique IDs and prepare nodes for D3
    function prepareNodes(node, parentId) {
        node.id = node.id || `${node.name.replace(/\s+/g, '-')}-${i++}`;
        node.parentId = parentId;
        if (node.children) {
            node.children.forEach(child => prepareNodes(child, node.id));
        }
    }

    prepareNodes(farmData, null);

    // Initialize with the root node and its direct children (sections)
    farmData._children = farmData.children; // Store all children
    farmData.children = null; // Start collapsed beyond root

    function updateGraph(sourceNode) {
        const nodes = [];
        const links = [];
        const nodeSet = new Set();

        function flatten(node) {
            if (!nodeSet.has(node.id)) {
                nodes.push(node);
                nodeSet.add(node.id);
            }
            if (node.children) {
                node.children.forEach(child => {
                    if (!nodeSet.has(child.id)) {
                        nodes.push(child);
                        nodeSet.add(child.id);
                    }
                    links.push({ source: node, target: child });
                    flatten(child);
                });
            }
        }

        flatten(farmData); // Process the whole tree based on current expanded/collapsed state
        
        currentNodes = nodes;
        currentLinks = links;

        // Links
        const link = svg.selectAll(".link")
            .data(currentLinks, d => `${d.source.id}-${d.target.id}`);

        link.exit().remove();

        const linkEnter = link.enter().append("line")
            .attr("class", "link");

        // Nodes
        const node = svg.selectAll(".node")
            .data(currentNodes, d => d.id);

        node.exit().remove();

        const nodeEnter = node.enter().append("g")
            .attr("class", d => `node ${d.type}`)
            .attr("transform", d => `translate(${sourceNode.x0 || sourceNode.x || width / 4},${sourceNode.y0 || sourceNode.y || height / 4})`) // Initial position for new nodes
            .call(d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended));

        nodeEnter.append("circle")
            .attr("r", 1e-6) // Start with small radius for transition
            .on("click", toggleNode);

        nodeEnter.append("text")
            .attr("dy", ".35em")
            .attr("text-anchor", "middle")
            .text(d => `${d.name}${d.quantity ? ' (x'+d.quantity+')' : ''}`);
        
        const mergedNodes = nodeEnter.merge(node);

        mergedNodes.transition()
            .duration(500)
            .attr("transform", d => `translate(${d.x},${d.y})`);

        mergedNodes.select("circle")
            .transition()
            .duration(500)
            .attr("r", d => d.type === 'root' ? 35 : (d.type === 'section' ? 25 : (d.type === 'item' ? 18 : 12)))
            .attr("class", d => d.type);
            
        mergedNodes.select("text")
            .text(d => `${d.name}${d.quantity ? ' (x'+d.quantity+')' : ''}`);

        simulation
            .nodes(currentNodes)
            .on("tick", ticked);

        simulation.force("link")
            .links(currentLinks);

        simulation.alpha(0.3).restart();

        function ticked() {
            link.merge(linkEnter)
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            mergedNodes
                .attr("transform", d => `translate(${d.x},${d.y})`);
        }

        // Store the old positions for transition.
        currentNodes.forEach(function(d){
            d.x0 = d.x;
            d.y0 = d.y;
        });
    }

    function toggleNode(event, d) {
        if (d.children) { // If children are visible, collapse them
            d._children = d.children;
            d.children = null;
        } else if (d._children) { // If children are stored (collapsed), expand them
            d.children = d._children;
            d._children = null;
        } else {
            // If no _children, it means it's a leaf node in the current view or has no children defined
            // This part might not be strictly necessary if farmData is pre-structured with all levels
        }
        updateGraph(d);
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
        // To unpin after drag, set d.fx = null; d.fy = null;
    }

    // Initial call to draw the root node
    farmData.x0 = width / 2 - 50;
    farmData.y0 = 50;
    toggleNode(null, farmData); // Expand the root node initially to show sections
    // farmData.children = farmData._children; // Show first level (sections)
    // farmData._children = null;
    // updateGraph(farmData);

});
