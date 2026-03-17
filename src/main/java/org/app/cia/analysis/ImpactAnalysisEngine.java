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

        EdgeReversedGraph<CodeUnit, Edge> reversedCurrent = new EdgeReversedGraph<>(currentGraph);
        EdgeReversedGraph<CodeUnit, Edge> reversedOld     = new EdgeReversedGraph<>(oldGraph);

        for (Change c : changeList) {
            CodeUnit affectedCu = c.getAffectedCu();

            if (c.getChangeType() == ChangeType.REMOVAL) {
                // Use old graph — find what depended on the removed unit
                if (oldGraph.containsVertex(affectedCu)) {
                    DepthFirstIterator<CodeUnit, Edge> dfi =
                            new DepthFirstIterator<>(reversedOld, affectedCu);
                    while (dfi.hasNext()) {
                        CodeUnit old = dfi.next();
                        // Bridge to current unit by filename if it still exists
                        CodeUnit current = currentUnitMap.get(old.getFilename());
                        if (current != null) {
                            affectedUnits.add(current);
                        } else {
                            affectedUnits.add(old);
                        }
                    }
                }
            } else {
                // Use current graph for additions and element-level changes
                if (currentGraph.containsVertex(affectedCu)) {
                    DepthFirstIterator<CodeUnit, Edge> dfi =
                            new DepthFirstIterator<>(reversedCurrent, affectedCu);
                    while (dfi.hasNext()) {
                        affectedUnits.add(dfi.next());
                    }
                }
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