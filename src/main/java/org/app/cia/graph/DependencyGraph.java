package org.app.cia.graph;

import org.app.cia.graph.Enums.EdgeLabel;
import org.app.cia.parser.CodeUnit;
import org.jgrapht.Graph;
import org.jgrapht.graph.DefaultDirectedGraph;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class DependencyGraph {

    public Graph<CodeUnit, Edge> buildGraph(List<CodeUnit> codeUnits) {
        Graph<CodeUnit, Edge> result = new DefaultDirectedGraph<>(null, null, false);

        Map<String, CodeUnit> classMap  = new HashMap<>();
        Map<String, CodeUnit> methodMap = new HashMap<>();

        for (CodeUnit cu : codeUnits) {
            cu.getClasses().forEach(cl     -> classMap.put(cl, cu));
            cu.getMethods().forEach(method -> methodMap.put(method, cu));
            result.addVertex(cu);
        }

        for (CodeUnit cu : codeUnits) {

            // CALLS edges
            for (String methodCall : cu.getMethodCalls()) {
                if (methodMap.containsKey(methodCall)) {
                    CodeUnit target = methodMap.get(methodCall);
                    if (!target.equals(cu) && !result.containsEdge(cu, target)) {
                        result.addEdge(cu, target, new Edge(cu, target, EdgeLabel.CALLS));
                    }
                }
            }

            // IMPORT edges — match simple class name from fully qualified import
            for (String imp : cu.getImports()) {
                String simpleName = imp.contains(".")
                        ? imp.substring(imp.lastIndexOf(".") + 1)
                        : imp;
                if (classMap.containsKey(simpleName)) {
                    CodeUnit target = classMap.get(simpleName);
                    if (!target.equals(cu) && !result.containsEdge(cu, target)) {
                        result.addEdge(cu, target, new Edge(cu, target, EdgeLabel.IMPORT));
                    }
                }
            }

            // INHERITANCE + IMPLEMENTATION edges
            for (CodeUnit.ParentData pd : cu.getInheritance()) {
                if (pd == null) continue;

                if (pd.getExtension() != null && classMap.containsKey(pd.getExtension())) {
                    CodeUnit target = classMap.get(pd.getExtension());
                    if (!target.equals(cu) && !result.containsEdge(cu, target)) {
                        result.addEdge(cu, target, new Edge(cu, target, EdgeLabel.INHERITANCE));
                    }
                }

                for (String impl : pd.getImplementations()) {
                    if (classMap.containsKey(impl)) {
                        CodeUnit target = classMap.get(impl);
                        if (!target.equals(cu) && !result.containsEdge(cu, target)) {
                            result.addEdge(cu, target, new Edge(cu, target, EdgeLabel.IMPLEMENTATION));
                        }
                    }
                }
            }
        }

        return result;
    }
}