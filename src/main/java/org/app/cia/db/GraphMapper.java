package org.app.cia.db;

import org.app.cia.graph.Edge;
import org.app.cia.graph.Enums.EdgeLabel;
import org.app.cia.parser.CodeUnit;
import org.jgrapht.Graph;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class GraphMapper {

    public List<CodeUnitNode> map(Graph<CodeUnit, Edge> graph) {
        Map<CodeUnit, CodeUnitNode> nodeMap = new HashMap<>();

        // First pass — create all nodes without relationships
        for (CodeUnit cu : graph.vertexSet()) {
            CodeUnitNode node = new CodeUnitNode(
                    cu.getFilePath().toString(),
                    cu.getFilename(),
                    cu.getLanguage(),
                    cu.getMethods(),
                    cu.getClasses(),
                    new ArrayList<>(),
                    new ArrayList<>(),
                    new ArrayList<>(),
                    new ArrayList<>()
            );
            nodeMap.put(cu, node);
        }

        // Second pass — wire relationships
        for (Edge edge : graph.edgeSet()) {
            CodeUnitNode source = nodeMap.get(graph.getEdgeSource(edge));
            CodeUnitNode target = nodeMap.get(graph.getEdgeTarget(edge));

            if (edge.getLabel() == EdgeLabel.CALLS) {
                source.getCalls().add(target);
            } else if (edge.getLabel() == EdgeLabel.IMPORT) {
                source.getImports().add(target);
            } else if (edge.getLabel() == EdgeLabel.INHERITANCE) {
                source.getInheritance().add(target);
            } else if (edge.getLabel() == EdgeLabel.IMPLEMENTATION) {
                source.getImplementations().add(target);
            }
        }

        return new ArrayList<>(nodeMap.values());
    }
}