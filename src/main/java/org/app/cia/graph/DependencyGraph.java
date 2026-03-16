package org.app.cia.graph;

import org.app.cia.graph.Enums.EdgeLabel;
import org.app.cia.parser.CodeUnit;
import org.jgrapht.Graph;
import org.jgrapht.graph.DefaultDirectedGraph;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class DependencyGraph {

    public Graph<CodeUnit,Edge> buildGraph(List<CodeUnit> codeUnits){
        Graph<CodeUnit, Edge> result = new DefaultDirectedGraph<>(null, null, false);

        Map<String,CodeUnit> classMap=new HashMap<>();
        Map<String,CodeUnit> methodMap=new HashMap<>();

        Map<String,CodeUnit> importMap=new HashMap<>();

        for(CodeUnit cu:codeUnits){
            cu.getClasses().forEach(cl->classMap.put(cl,cu));
            cu.getMethods().forEach(method->methodMap.put(method,cu));
            cu.getImports().forEach(imp->importMap.put(imp,cu));
            result.addVertex(cu);

        }

        for(CodeUnit cu:codeUnits){
            for(String methodCall:cu.getMethodCalls()){
                if(methodMap.containsKey(methodCall)){
                    Edge edge=new Edge(cu,methodMap.get(methodCall), EdgeLabel.CALLS);
                    result.addEdge(cu,methodMap.get(methodCall),edge);
                }
            }
            for(String imp:cu.getImports()){
                if(importMap.containsKey(imp) && !importMap.get(imp).equals(cu)){
                    Edge edge=new Edge(cu,importMap.get(imp),EdgeLabel.IMPORT);
                    result.addEdge(cu,importMap.get(imp),edge);
                }
            }
            for(CodeUnit.ParentData pd:cu.getInheritance()){
                if(pd != null && pd.getExtension() != null && classMap.containsKey(pd.getExtension())){
                    Edge edge=new Edge(cu,classMap.get(pd.getExtension()),EdgeLabel.INHERITANCE);
                    result.addEdge(cu,classMap.get(pd.getExtension()),edge);
                }
                for(String impl : pd.getImplementations()){
                    if(classMap.containsKey(impl)){
                        Edge edge=new Edge(cu,classMap.get(impl),EdgeLabel.IMPLEMENTATION);
                        result.addEdge(cu,classMap.get(impl),edge);
                    }
                }
            }
        }
        return result;
    }
}
