package org.app.cia;

import org.app.cia.graph.DependencyGraph;
import org.app.cia.graph.Edge;
import org.app.cia.ingestion.IngestionService;
import org.app.cia.parser.CodeUnit;
import org.app.cia.parser.DirScanner;
import org.app.cia.parser.Enums.Language;
import org.app.cia.parser.FileDispatcher;
import org.jgrapht.Graph;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

public class CoreService {
    IngestionService ingestionService;
    DirScanner dirScanner;

    FileDispatcher fileDispatcher;

    DependencyGraph dependencyGraph;

    List<Path> localRepo;
    Map<Language, List<Path>> walkedFileMap;

    List<CodeUnit> codeUnits;
    Graph<CodeUnit,Edge> codeUnitGraph;
    public CoreService(String url,Path base){
        this.ingestionService=new IngestionService(url,base);
        this.dirScanner=new DirScanner();
        this.fileDispatcher=new FileDispatcher();
        this.dependencyGraph=new DependencyGraph();
    }

    public void extractRepo(){
        localRepo=ingestionService.ingest();
    }

    public void walkRepo(){
        walkedFileMap=dirScanner.traverse(localRepo);
    }

    public void buildUnits(){
        codeUnits=fileDispatcher.dispatch(walkedFileMap);
    }

    public void setDependencyGraph(){
        codeUnitGraph=dependencyGraph.buildGraph(codeUnits);
    }
}
