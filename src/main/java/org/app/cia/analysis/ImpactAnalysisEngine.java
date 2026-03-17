package org.app.cia.analysis;

import org.app.cia.diff.Change;
import org.app.cia.diff.Enums.ChangeType;
import org.app.cia.graph.Edge;
import org.app.cia.parser.CodeUnit;
import org.app.cia.process.ProcessMapper;
import org.jgrapht.Graph;
import org.jgrapht.graph.EdgeReversedGraph;
import org.jgrapht.traverse.DepthFirstIterator;

import java.util.*;

public class ImpactAnalysisEngine {

    public ImpactReport analyze(List<Change> changeList,
                                Graph<CodeUnit, Edge> currentGraph,
                                Graph<CodeUnit, Edge> oldGraph,
                                List<CodeUnit> currentUnits) {

        ImpactReport report = new ImpactReport(changeList);
        Set<CodeUnit> affectedUnits = new HashSet<>();

        // Map filename -> currentUnit for bridging old->current
        Map<String, CodeUnit> currentUnitMap = new HashMap<>();
        for (CodeUnit cu : currentUnits) {
            currentUnitMap.put(cu.getFilename(), cu);
        }

        // Map filename -> oldUnit for finding changed files in oldGraph
        Map<String, CodeUnit> oldUnitMap = new HashMap<>();
        for (CodeUnit cu : oldGraph.vertexSet()) {
            oldUnitMap.put(cu.getFilename(), cu);
        }

        EdgeReversedGraph<CodeUnit, Edge> reversedOld = new EdgeReversedGraph<>(oldGraph);

        for (Change c : changeList) {
            CodeUnit affectedCu = c.getAffectedCu();
            String filename = affectedCu.getFilename();

            // Always use oldGraph for traversal — it has the full dependency picture
            // Find the matching vertex in oldGraph by filename
            CodeUnit oldCu = oldUnitMap.get(filename);

            if (oldCu != null) {
                DepthFirstIterator<CodeUnit, Edge> dfi =
                        new DepthFirstIterator<>(reversedOld, oldCu);
                while (dfi.hasNext()) {
                    CodeUnit traversed = dfi.next();
                    // Bridge to current unit if it still exists, otherwise keep old
                    CodeUnit current = currentUnitMap.get(traversed.getFilename());
                    affectedUnits.add(current != null ? current : traversed);
                }
            } else if (c.getChangeType() != ChangeType.REMOVAL) {
                // New file added — no old equivalent, add itself
                affectedUnits.add(affectedCu);
            }
        }

        ProcessMapper mapper = new ProcessMapper();
        Map<String, List<CodeUnit>> affectedMap = mapper.mapProcesses(
                affectedUnits.stream().toList()
        );

        report.setAffectedUnits(affectedUnits);
        report.setAffectedProcessMap(affectedMap);
        return report;
    }
}