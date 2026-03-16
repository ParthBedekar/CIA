package org.app.cia.analysis;

import org.app.cia.diff.Change;
import org.app.cia.graph.Edge;
import org.app.cia.parser.CodeUnit;
import org.app.cia.process.ProcessMapper;
import org.jgrapht.Graph;
import org.jgrapht.graph.EdgeReversedGraph;
import org.jgrapht.traverse.DepthFirstIterator;

import java.util.*;

public class ImpactAnalysisEngine {



    public ImpactReport analyze(List<Change> changeList, Graph<CodeUnit, Edge> graph){

        ImpactReport report=new ImpactReport(changeList);
        ProcessMapper mapper=new ProcessMapper();
        Set<CodeUnit> affectedUnits=new HashSet<>();
        for(Change c:changeList){
            affectedUnits.add(c.getAffectedCu());
        }


        EdgeReversedGraph<CodeUnit, Edge> reversed = new EdgeReversedGraph<>(graph);

        for(Change c:changeList){
            if(graph.containsVertex(c.getAffectedCu())){
                DepthFirstIterator<CodeUnit,Edge> dfi = new DepthFirstIterator<>(reversed, c.getAffectedCu());
                while(dfi.hasNext()){
                    affectedUnits.add(dfi.next());
                }
            }
        }
        Map<String, List<CodeUnit>> affectedMap=mapper.mapProcesses(affectedUnits.stream().toList());

        report.setAffectedProcessMap(affectedMap);

        report.setAffectedUnits(affectedUnits);

        return report;
    }
}
