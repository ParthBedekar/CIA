package org.app.cia;

import org.app.cia.analysis.ImpactAnalysisEngine;
import org.app.cia.analysis.ImpactReport;
import org.app.cia.db.CodeUnitNodeRepository;
import org.app.cia.db.GraphMapper;
import org.app.cia.diff.ASTDiffEngine;
import org.app.cia.diff.Change;
import org.app.cia.graph.DependencyGraph;
import org.app.cia.graph.Edge;
import org.app.cia.ingestion.IngestionService;
import org.app.cia.parser.CodeUnit;
import org.app.cia.parser.DirScanner;
import org.app.cia.parser.Enums.Language;
import org.app.cia.parser.FileDispatcher;
import org.app.cia.process.ProcessMapper;
import org.jgrapht.Graph;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

@Service
public class CoreService {

    private final CodeUnitNodeRepository repository;

    private IngestionService ingestionService;
    private final DirScanner dirScanner = new DirScanner();
    private final FileDispatcher fileDispatcher = new FileDispatcher();
    private final DependencyGraph dependencyGraph = new DependencyGraph();
    private final ASTDiffEngine astDiffEngine = new ASTDiffEngine();
    private final GraphMapper graphMapper = new GraphMapper();

    private List<CodeUnit> oldUnits;
    private List<CodeUnit> currentUnits;
    private Graph<CodeUnit, Edge> codeUnitGraph;
    private List<Change> changes;
    private ImpactReport impactReport;

    public CoreService(CodeUnitNodeRepository repository) {
        this.repository = repository;
    }

    public void triggerEngine(String url, Path base) {
        this.ingestionService = new IngestionService(url, base);
    }

    public void extractAndBuild() {
        List<Path> snapshots = ingestionService.ingest();
        // index 0 = latest commit, index 1 = previous commit
        Map<Language, List<Path>> currentFileMap = dirScanner.traverse(List.of(snapshots.get(0)));
        Map<Language, List<Path>> oldFileMap = dirScanner.traverse(List.of(snapshots.get(1)));

        currentUnits = fileDispatcher.dispatch(currentFileMap);
        oldUnits = fileDispatcher.dispatch(oldFileMap);
    }

    public void buildGraph() {
        codeUnitGraph = dependencyGraph.buildGraph(currentUnits);
    }

    public void computeDiff() {
        changes = astDiffEngine.diff(oldUnits, currentUnits);
    }

    public void analyzeImpact() {
        ProcessMapper processMapper = new ProcessMapper();
        Map<String, List<CodeUnit>> processMap = processMapper.mapProcesses(currentUnits);
        ImpactAnalysisEngine engine = new ImpactAnalysisEngine();
        impactReport = engine.analyze(changes, codeUnitGraph);
    }

    public void persistGraph() {
        repository.saveAll(graphMapper.map(codeUnitGraph));
    }

    public ImpactReport getImpactReport() {
        return impactReport;
    }
}