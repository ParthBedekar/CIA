package org.app.cia.graph;

import lombok.AllArgsConstructor;
import lombok.Getter;
import org.app.cia.graph.Enums.EdgeLabel;
import org.app.cia.parser.CodeUnit;

@AllArgsConstructor
@Getter
public class Edge {
    private CodeUnit source;
    private CodeUnit destination;
    private EdgeLabel label;
}
