package org.app.cia.db;

import lombok.AllArgsConstructor;
import lombok.Getter;
import org.app.cia.parser.Enums.Language;
import org.springframework.data.neo4j.core.schema.Id;
import org.springframework.data.neo4j.core.schema.Node;
import org.springframework.data.neo4j.core.schema.Relationship;

import java.util.List;

@Node
@Getter
@AllArgsConstructor
public class CodeUnitNode {
    @Id
    private String filePath;
    private String filename;
    private Language language;
    private List<String> methods;
    private List<String> classes;

    @Relationship(type = "CALLS")
    private List<CodeUnitNode> calls;

    @Relationship(type = "IMPORT")
    private List<CodeUnitNode> imports;

    @Relationship(type = "INHERITANCE")
    private List<CodeUnitNode> inheritance;

    @Relationship(type = "IMPLEMENTATION")
    private List<CodeUnitNode> implementations;
}